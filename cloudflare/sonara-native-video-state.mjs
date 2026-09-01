const OWNER_VIDEO_CREDITS = 10_000;
const VIDEO_CREDIT_COST = { '720p': 1, '1080p': 2, '4k': 4 };
const PLAN_LIMITS = {
  free: { planId: 'free', planName: 'Free', videoCreditsPerMonth: 1, videoClipSeconds: 8, videoResolutions: ['720p'] },
  studio: { planId: 'studio', planName: 'Studio', videoCreditsPerMonth: 60, videoClipSeconds: 480, videoResolutions: ['720p', '1080p', '4k'] }
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store, max-age=0', 'x-sonara-video-state-store': 'durable-v1', ...headers }
  });
}

function activeStudioEntitlement(user, now = Date.now()) {
  const entitlement = user?.entitlement;
  return Boolean(
    entitlement?.planId === 'studio' && entitlement?.cadence === 'yearly' &&
    entitlement?.status === 'active' && Number(entitlement?.expiresAt || 0) > now
  );
}

function monthPeriod(now = Date.now()) {
  const date = new Date(now);
  return {
    start: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
    end: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  };
}

function billingSnapshot(user, now = Date.now()) {
  const studio = activeStudioEntitlement(user, now);
  const plan = studio ? PLAN_LIMITS.studio : PLAN_LIMITS.free;
  const period = monthPeriod(now);
  const periodMatches = Number(user?.usagePeriodStart || 0) === period.start && Number(user?.usagePeriodEnd || 0) === period.end;
  const videoCreditsUsed = periodMatches ? Math.max(0, Number(user?.videoCreditsUsed || 0)) : 0;
  const videoCreditsPerMonth = Math.max(plan.videoCreditsPerMonth, Math.max(0, Number(user?.videoCreditsPerMonthOverride || 0)));
  return {
    planId: plan.planId,
    planName: plan.planName,
    videoCreditsPerMonth,
    videoCreditsUsed,
    videoCreditsRemaining: Math.max(0, videoCreditsPerMonth - videoCreditsUsed),
    videoClipSeconds: plan.videoClipSeconds,
    videoResolutions: plan.videoResolutions,
    providerConfigured: true,
    entitlementEndsAt: studio ? new Date(Number(user.entitlement.expiresAt)).toISOString() : null
  };
}

function randomToken(byteLength = 18) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function reservationKey(uid, id) { return `video-reservation:${String(uid || '')}:${String(id || '')}`; }
function jobKey(uid, id) { return `video-job:${String(uid || '')}:${String(id || '')}`; }

async function latestVideoJob(store, uid) {
  const prefix = `video-job:${String(uid || '')}:`;
  const entries = await store.ctx.storage.list({ prefix });
  let latest = null;
  for (const [key, job] of entries) {
    if (!job || typeof job !== 'object') continue;
    const createdAt = Math.max(0, Number(job.createdAt || job.updatedAt || 0));
    if (!latest || createdAt > latest.createdAt) {
      latest = {
        jobId: String(key).slice(prefix.length),
        status: String(job.status || 'PROCESSING'),
        createdAt,
        updatedAt: Math.max(createdAt, Number(job.updatedAt || 0)),
        ...(job.videoUrl ? { videoUrl: String(job.videoUrl) } : {}),
        ...(job.error ? { error: String(job.error) } : {})
      };
    }
  }
  return latest;
}

async function ownerCredits(store, record) {
  const owner = Boolean(
    activeStudioEntitlement(record.user) &&
    String(record.user?.entitlement?.source || '') === 'legacy-studio-restoration-2026-08-31'
  );
  if (owner && Number(record.user.videoCreditsPerMonthOverride || 0) < OWNER_VIDEO_CREDITS) {
    record.user.videoCreditsPerMonthOverride = OWNER_VIDEO_CREDITS;
    await store.ctx.storage.put(record.userKey, record.user);
  }
}

async function authenticated(store, request) {
  const record = await store.authenticatedSession(request);
  if (!record) return null;
  await store.normalizeUsageWindow(record);
  await ownerCredits(store, record);
  return record;
}

async function status(store, request) {
  const record = await authenticated(store, request);
  if (!record) return json({ ok: false, code: 'AUTH_REQUIRED', message: 'Accedi per usare SONARA Video AI.' }, 401);
  return json({ ...billingSnapshot(record.user), latestVideoJob: await latestVideoJob(store, record.user.uid) });
}

async function reserve(store, request) {
  const record = await authenticated(store, request);
  if (!record) return json({ ok: false, code: 'AUTH_REQUIRED', message: 'Accedi per usare SONARA Video AI.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, code: 'INVALID_JSON', message: 'Richiesta non valida.' }, 400); }
  const resolution = String(body?.resolution || '').toLowerCase();
  const billing = billingSnapshot(record.user);
  if (!billing.videoResolutions.includes(resolution)) return json({ ok: false, code: 'VIDEO_RESOLUTION_NOT_ALLOWED', message: 'Questa qualità video non è inclusa nel piano attivo.', allowed: billing.videoResolutions }, 403);
  const credits = Number(VIDEO_CREDIT_COST[resolution] || 0);
  if (!credits) return json({ ok: false, code: 'INVALID_VIDEO_RESOLUTION', message: 'Risoluzione video non valida.' }, 400);
  if (billing.videoCreditsUsed + credits > billing.videoCreditsPerMonth) return json({ ok: false, code: 'VIDEO_CREDITS_EXHAUSTED', message: 'Hai terminato i crediti Video AI del mese.', creditsRemaining: billing.videoCreditsRemaining }, 402);
  record.user.videoCreditsUsed = billing.videoCreditsUsed + credits;
  await store.ctx.storage.put(record.userKey, record.user);
  const reservationId = randomToken();
  await store.ctx.storage.put(reservationKey(record.user.uid, reservationId), { uid: record.user.uid, reservationId, credits, resolution, status: 'reserved', createdAt: Date.now() });
  return json({ ok: true, reservationId, credits, billing: billingSnapshot(record.user) });
}

async function cancelReservation(store, request) {
  const record = await authenticated(store, request);
  if (!record) return json({ ok: false, code: 'AUTH_REQUIRED', message: 'Accedi per usare SONARA Video AI.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, code: 'INVALID_JSON', message: 'Richiesta non valida.' }, 400); }
  const id = String(body?.reservationId || '').trim();
  const key = reservationKey(record.user.uid, id);
  const reservation = id ? await store.ctx.storage.get(key) : null;
  if (!reservation || reservation.status !== 'reserved') return json({ ok: false, code: 'VIDEO_RESERVATION_NOT_FOUND', message: 'Prenotazione crediti non valida.' }, 404);
  record.user.videoCreditsUsed = Math.max(0, Number(record.user.videoCreditsUsed || 0) - Number(reservation.credits || 0));
  await store.ctx.storage.put(record.userKey, record.user);
  await store.ctx.storage.put(key, { ...reservation, status: 'cancelled', cancelledAt: Date.now() });
  return json({ ok: true, billing: billingSnapshot(record.user) });
}

async function createJob(store, request) {
  const record = await authenticated(store, request);
  if (!record) return json({ ok: false, code: 'AUTH_REQUIRED', message: 'Accedi per usare SONARA Video AI.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, code: 'INVALID_JSON', message: 'Richiesta non valida.' }, 400); }
  const id = String(body?.jobId || '').trim();
  const reservationId = String(body?.reservationId || '').trim();
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(id)) return json({ ok: false, code: 'VIDEO_JOB_REQUIRED', message: 'Job video non valido.' }, 400);
  const rKey = reservationKey(record.user.uid, reservationId);
  const reservation = reservationId ? await store.ctx.storage.get(rKey) : null;
  if (!reservation || reservation.status !== 'reserved') return json({ ok: false, code: 'VIDEO_RESERVATION_NOT_FOUND', message: 'Prenotazione crediti non valida.' }, 409);
  const input = body?.record && typeof body.record === 'object' ? body.record : {};
  const prompt = String(input.prompt || '').trim().slice(0, 6000);
  if (prompt.length < 8) return json({ ok: false, code: 'VIDEO_PROMPT_REQUIRED', message: 'Descrivi il video con un prompt più completo.' }, 400);
  const billing = billingSnapshot(record.user);
  const job = { ...input, uid: record.user.uid, prompt, planId: billing.planId, credits: Number(reservation.credits || 0), resolution: reservation.resolution, status: 'PROCESSING', refunded: false, createdAt: Date.now(), updatedAt: Date.now() };
  if (JSON.stringify(job).length > 240_000) return json({ ok: false, code: 'VIDEO_JOB_TOO_LARGE', message: 'Job Video AI troppo grande.' }, 413);
  await store.ctx.storage.put(jobKey(record.user.uid, id), job);
  await store.ctx.storage.put(rKey, { ...reservation, status: 'committed', jobId: id, committedAt: Date.now() });
  return json({ ok: true, jobId: id, job });
}

async function getJob(store, request) {
  const record = await authenticated(store, request);
  if (!record) return json({ ok: false, code: 'AUTH_REQUIRED', message: 'Accedi per usare SONARA Video AI.' }, 401);
  const id = String(new URL(request.url).searchParams.get('id') || '').trim();
  const job = id ? await store.ctx.storage.get(jobKey(record.user.uid, id)) : null;
  return job ? json({ ok: true, jobId: id, job }) : json({ ok: false, code: 'VIDEO_JOB_NOT_FOUND', message: 'Job video non trovato.' }, 404);
}

async function patchJob(store, request) {
  const record = await authenticated(store, request);
  if (!record) return json({ ok: false, code: 'AUTH_REQUIRED', message: 'Accedi per usare SONARA Video AI.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, code: 'INVALID_JSON', message: 'Richiesta non valida.' }, 400); }
  const id = String(body?.jobId || '').trim();
  const key = jobKey(record.user.uid, id);
  const job = id ? await store.ctx.storage.get(key) : null;
  if (!job) return json({ ok: false, code: 'VIDEO_JOB_NOT_FOUND', message: 'Job video non trovato.' }, 404);
  const updates = body?.updates && typeof body.updates === 'object' ? body.updates : {};
  const protectedKeys = new Set(['uid', 'planId', 'credits', 'createdAt']);
  for (const [name, value] of Object.entries(updates)) {
    if (protectedKeys.has(name)) continue;
    if (value && typeof value === 'object' && value.__sonaraDelete === true) delete job[name];
    else job[name] = value;
  }
  job.updatedAt = Date.now();
  if (JSON.stringify(job).length > 240_000) return json({ ok: false, code: 'VIDEO_JOB_TOO_LARGE', message: 'Aggiornamento Video AI troppo grande.' }, 413);
  await store.ctx.storage.put(key, job);
  return json({ ok: true, jobId: id, job });
}

async function refundJob(store, request) {
  const record = await authenticated(store, request);
  if (!record) return json({ ok: false, code: 'AUTH_REQUIRED', message: 'Accedi per usare SONARA Video AI.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, code: 'INVALID_JSON', message: 'Richiesta non valida.' }, 400); }
  const id = String(body?.jobId || '').trim();
  const key = jobKey(record.user.uid, id);
  const job = id ? await store.ctx.storage.get(key) : null;
  if (!job) return json({ ok: false, code: 'VIDEO_JOB_NOT_FOUND', message: 'Job video non trovato.' }, 404);
  if (job.status !== 'FAILED' || job.refunded) return json({ ok: true, refunded: Boolean(job.refunded), billing: billingSnapshot(record.user) });
  record.user.videoCreditsUsed = Math.max(0, Number(record.user.videoCreditsUsed || 0) - Number(job.credits || 0));
  job.refunded = true;
  job.updatedAt = Date.now();
  await store.ctx.storage.put(record.userKey, record.user);
  await store.ctx.storage.put(key, job);
  return json({ ok: true, refunded: true, billing: billingSnapshot(record.user) });
}

export async function handleSonaraNativeVideoState(store, request) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/video/status') return status(store, request);
  if (request.method === 'POST' && url.pathname.endsWith('/video-reserve')) return reserve(store, request);
  if (request.method === 'POST' && url.pathname.endsWith('/video-reservation/cancel')) return cancelReservation(store, request);
  if (request.method === 'POST' && url.pathname.endsWith('/video-job/refund')) return refundJob(store, request);
  if (request.method === 'POST' && url.pathname.endsWith('/video-job')) return createJob(store, request);
  if (request.method === 'GET' && url.pathname.endsWith('/video-job')) return getJob(store, request);
  if (request.method === 'PATCH' && url.pathname.endsWith('/video-job')) return patchJob(store, request);
  return null;
}
