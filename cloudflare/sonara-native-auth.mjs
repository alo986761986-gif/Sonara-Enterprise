const VERSION = 'sonara-native-auth-v2';
const COOKIE_NAME = 'sonara_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const PASSWORD_ITERATIONS = 100000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

// One-time legacy Studio restoration. Only the SHA-256 digest is stored in source;
// the claim secret itself is never committed to the repository.
const STUDIO_RESTORE_HASH = '68db00c1d44d6615f47d76678bfe5706ae9c2f0637dfa2e1b5ec770ac371577f';
const STUDIO_RESTORE_KEY = `claim:studio-year:${STUDIO_RESTORE_HASH}`;

const PLAN_LIMITS = {
  free: {
    planId: 'free',
    planName: 'Free',
    includedSeconds: 10 * 60,
    maxTrackSeconds: 60,
    commercialUse: false,
    videoCreditsPerMonth: 1,
    videoClipSeconds: 8,
    videoResolutions: ['720p'],
    videoModelTier: 'lite'
  },
  studio: {
    planId: 'studio',
    planName: 'Studio',
    includedSeconds: 500 * 60,
    maxTrackSeconds: 480,
    commercialUse: true,
    videoCreditsPerMonth: 60,
    videoClipSeconds: 480,
    videoResolutions: ['720p', '1080p', '4k'],
    videoModelTier: 'fast'
  }
};

const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store, max-age=0',
      'x-sonara-auth': VERSION,
      ...headers
    }
  });
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(email) {
  return email.length >= 5 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

function bytesToBase64(bytes) {
  let binary = '';
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < data.length; i += 1) binary += String.fromCharCode(data[i]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function passwordDigest(password, saltBytes, iterations = PASSWORD_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(left, right) {
  const a = left instanceof Uint8Array ? left : new Uint8Array(left);
  const b = right instanceof Uint8Array ? right : new Uint8Array(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function allowedOrigin(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return true;
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === 'sonaraenterprise.com' || host === 'www.sonaraenterprise.com' || host.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

function monthPeriod(now = Date.now()) {
  const date = new Date(now);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return { start, end };
}

function addOneYear(now = Date.now()) {
  const date = new Date(now);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.getTime();
}

function activeStudioEntitlement(user, now = Date.now()) {
  const entitlement = user?.entitlement;
  return Boolean(
    entitlement?.planId === 'studio' &&
    entitlement?.cadence === 'yearly' &&
    entitlement?.status === 'active' &&
    Number(entitlement?.expiresAt || 0) > now
  );
}

function publicUser(user) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || '',
    createdAt: user.createdAt,
    planId: activeStudioEntitlement(user) ? 'studio' : 'free'
  };
}

function billingSnapshot(user, now = Date.now()) {
  const isStudio = activeStudioEntitlement(user, now);
  const plan = isStudio ? PLAN_LIMITS.studio : PLAN_LIMITS.free;
  const period = monthPeriod(now);
  const storedStart = Number(user?.usagePeriodStart || 0);
  const storedEnd = Number(user?.usagePeriodEnd || 0);
  const periodMatches = storedStart === period.start && storedEnd === period.end;
  const usedSeconds = periodMatches ? Math.max(0, Number(user?.usageSeconds || 0)) : 0;
  const videoCreditsUsed = periodMatches ? Math.max(0, Number(user?.videoCreditsUsed || 0)) : 0;
  const entitlementEndsAt = isStudio ? Number(user?.entitlement?.expiresAt || 0) : 0;

  return {
    planId: plan.planId,
    planName: plan.planName,
    cadence: isStudio ? 'yearly' : null,
    subscriptionStatus: isStudio ? 'active' : 'free',
    cancelAtPeriodEnd: false,
    usedSeconds,
    includedSeconds: plan.includedSeconds,
    remainingSeconds: Math.max(0, plan.includedSeconds - usedSeconds),
    maxTrackSeconds: plan.maxTrackSeconds,
    commercialUse: plan.commercialUse,
    periodStart: new Date(period.start).toISOString(),
    periodEnd: new Date(period.end).toISOString(),
    checkoutReady: false,
    billingConfigured: true,
    portalAvailable: false,
    enforcementMode: 'enforce',
    limitsEnforced: true,
    termsUrl: 'https://sonaraenterprise.com/terms',
    privacyUrl: 'https://sonaraenterprise.com/privacy',
    entitlementEndsAt: entitlementEndsAt ? new Date(entitlementEndsAt).toISOString() : null,
    videoCreditsPerMonth: plan.videoCreditsPerMonth,
    videoCreditsUsed,
    videoCreditsRemaining: Math.max(0, plan.videoCreditsPerMonth - videoCreditsUsed),
    videoClipSeconds: plan.videoClipSeconds,
    videoResolutions: plan.videoResolutions,
    videoModelTier: plan.videoModelTier,
    providerConfigured: true
  };
}

export class SonaraAuthStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async userKey(email) {
    return `user:${await sha256(normalizeEmail(email))}`;
  }

  async rateKey(email) {
    return `rate:login:${await sha256(normalizeEmail(email))}`;
  }

  async sessionKey(token) {
    return `session:${await sha256(token)}`;
  }

  async checkRate(email) {
    const key = await this.rateKey(email);
    const now = Date.now();
    const state = await this.ctx.storage.get(key);
    if (!state || now - Number(state.windowStart || 0) > LOGIN_WINDOW_MS) {
      return { key, count: 0, windowStart: now, blocked: false };
    }
    return {
      key,
      count: Number(state.count || 0),
      windowStart: Number(state.windowStart || now),
      blocked: Number(state.count || 0) >= LOGIN_MAX_ATTEMPTS
    };
  }

  async recordFailure(rate) {
    await this.ctx.storage.put(rate.key, {
      count: Number(rate.count || 0) + 1,
      windowStart: Number(rate.windowStart || Date.now())
    });
  }

  async clearRate(rate) {
    await this.ctx.storage.delete(rate.key);
  }

  async createSession(user) {
    const token = randomToken(32);
    const key = await this.sessionKey(token);
    const now = Date.now();
    await this.ctx.storage.put(key, {
      uid: user.uid,
      userKey: await this.userKey(user.email),
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS
    });
    return token;
  }

  async authenticatedSession(request) {
    const token = parseCookies(request.headers.get('cookie'))[COOKIE_NAME];
    if (!token) return null;
    const sessionKey = await this.sessionKey(token);
    const session = await this.ctx.storage.get(sessionKey);
    if (!session || Number(session.expiresAt || 0) <= Date.now()) {
      if (session) await this.ctx.storage.delete(sessionKey);
      return null;
    }
    const userKey = String(session.userKey || '');
    const user = userKey ? await this.ctx.storage.get(userKey) : null;
    if (!user || user.status !== 'active') {
      await this.ctx.storage.delete(sessionKey);
      return null;
    }
    return { token, sessionKey, session, userKey, user };
  }

  async normalizeUsageWindow(record) {
    const period = monthPeriod();
    if (
      Number(record.user.usagePeriodStart || 0) !== period.start ||
      Number(record.user.usagePeriodEnd || 0) !== period.end
    ) {
      record.user.usagePeriodStart = period.start;
      record.user.usagePeriodEnd = period.end;
      record.user.usageSeconds = 0;
      record.user.videoCreditsUsed = 0;
      await this.ctx.storage.put(record.userKey, record.user);
    }
    return record;
  }

  async register(request) {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, code: 'INVALID_JSON', message: 'Richiesta non valida.' }, 400); }
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || '');
    if (!validEmail(email)) return json({ ok: false, code: 'INVALID_EMAIL', message: 'Inserisci un indirizzo email valido.' }, 400);
    if (!validPassword(password)) return json({ ok: false, code: 'WEAK_PASSWORD', message: 'La password deve contenere almeno 6 caratteri.' }, 400);

    const key = await this.userKey(email);
    const existing = await this.ctx.storage.get(key);
    if (existing) return json({ ok: false, code: 'EMAIL_EXISTS', message: 'Questa email è già registrata.' }, 409);

    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const digest = await passwordDigest(password, salt, PASSWORD_ITERATIONS);
    const period = monthPeriod();
    const user = {
      uid: crypto.randomUUID(),
      email,
      displayName: String(body?.displayName || '').trim().slice(0, 80),
      passwordHash: bytesToBase64(digest),
      passwordSalt: bytesToBase64(salt),
      passwordIterations: PASSWORD_ITERATIONS,
      createdAt: Date.now(),
      status: 'active',
      usagePeriodStart: period.start,
      usagePeriodEnd: period.end,
      usageSeconds: 0,
      videoCreditsUsed: 0
    };
    await this.ctx.storage.put(key, user);
    const token = await this.createSession(user);
    return json({ ok: true, user: publicUser(user) }, 201, { 'set-cookie': sessionCookie(token) });
  }

  async login(request) {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, code: 'INVALID_JSON', message: 'Richiesta non valida.' }, 400); }
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || '');
    if (!validEmail(email) || !validPassword(password)) {
      return json({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Email o password non corretti.' }, 401);
    }

    const rate = await this.checkRate(email);
    if (rate.blocked) {
      return json({ ok: false, code: 'TOO_MANY_ATTEMPTS', message: 'Troppi tentativi. Riprova tra qualche minuto.' }, 429);
    }

    const user = await this.ctx.storage.get(await this.userKey(email));
    let valid = false;
    if (user?.status === 'active' && user?.passwordHash && user?.passwordSalt) {
      const digest = await passwordDigest(password, base64ToBytes(user.passwordSalt), Number(user.passwordIterations || PASSWORD_ITERATIONS));
      valid = timingSafeEqual(digest, base64ToBytes(user.passwordHash));
    }

    if (!valid) {
      await this.recordFailure(rate);
      return json({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Email o password non corretti.' }, 401);
    }

    await this.clearRate(rate);
    const token = await this.createSession(user);
    return json({ ok: true, user: publicUser(user) }, 200, { 'set-cookie': sessionCookie(token) });
  }

  async session(request) {
    const record = await this.authenticatedSession(request);
    if (!record) return json({ ok: true, authenticated: false, user: null }, 200, { 'set-cookie': clearSessionCookie() });
    await this.normalizeUsageWindow(record);
    return json({ ok: true, authenticated: true, user: publicUser(record.user) });
  }

  async billingStatus(request, compatibility = false) {
    const record = await this.authenticatedSession(request);
    if (!record) {
      return json({ ok: false, code: 'AUTH_REQUIRED', message: 'Accedi per visualizzare il piano SONARA.' }, 401, { 'set-cookie': clearSessionCookie() });
    }
    await this.normalizeUsageWindow(record);
    const billing = billingSnapshot(record.user);
    return compatibility ? json({ billing }) : json({ ok: true, billing });
  }

  async videoStatus(request) {
    const record = await this.authenticatedSession(request);
    if (!record) {
      return json({ ok: false, code: 'AUTH_REQUIRED', message: 'Accedi per usare SONARA Video AI.' }, 401, { 'set-cookie': clearSessionCookie() });
    }
    await this.normalizeUsageWindow(record);
    const billing = billingSnapshot(record.user);
    return json({
      planId: billing.planId,
      planName: billing.planName,
      videoCreditsPerMonth: billing.videoCreditsPerMonth,
      videoCreditsUsed: billing.videoCreditsUsed,
      videoCreditsRemaining: billing.videoCreditsRemaining,
      videoClipSeconds: billing.videoClipSeconds,
      videoResolutions: billing.videoResolutions,
      providerConfigured: billing.providerConfigured,
      entitlementEndsAt: billing.entitlementEndsAt
    });
  }

  async restoreStudio(request) {
    const record = await this.authenticatedSession(request);
    if (!record) {
      return json({ ok: false, code: 'AUTH_REQUIRED', message: 'Accedi al tuo account SONARA prima di ripristinare Studio.' }, 401, { 'set-cookie': clearSessionCookie() });
    }

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, code: 'INVALID_JSON', message: 'Richiesta non valida.' }, 400); }
    const code = String(body?.code || '').trim();
    if (!code || await sha256(code) !== STUDIO_RESTORE_HASH) {
      return json({ ok: false, code: 'INVALID_RESTORE_CODE', message: 'Codice di ripristino Studio non valido.' }, 403);
    }

    const existingClaim = await this.ctx.storage.get(STUDIO_RESTORE_KEY);
    if (existingClaim && String(existingClaim.uid || '') !== String(record.user.uid || '')) {
      return json({ ok: false, code: 'RESTORE_ALREADY_USED', message: 'Questo ripristino Studio è già stato utilizzato.' }, 409);
    }

    const now = Date.now();
    const expiresAt = existingClaim?.expiresAt && String(existingClaim.uid || '') === String(record.user.uid || '')
      ? Number(existingClaim.expiresAt)
      : addOneYear(now);
    const period = monthPeriod(now);

    record.user.entitlement = {
      planId: 'studio',
      cadence: 'yearly',
      status: 'active',
      grantedAt: existingClaim?.claimedAt || now,
      expiresAt,
      source: 'legacy-studio-restoration-2026-08-31'
    };
    record.user.usagePeriodStart = period.start;
    record.user.usagePeriodEnd = period.end;
    record.user.usageSeconds = Math.max(0, Number(record.user.usageSeconds || 0));
    record.user.videoCreditsUsed = Math.max(0, Number(record.user.videoCreditsUsed || 0));

    await this.ctx.storage.put(record.userKey, record.user);
    await this.ctx.storage.put(STUDIO_RESTORE_KEY, {
      uid: record.user.uid,
      claimedAt: existingClaim?.claimedAt || now,
      expiresAt
    });

    return json({
      ok: true,
      message: 'SONARA Studio annuale ripristinato.',
      user: publicUser(record.user),
      billing: billingSnapshot(record.user)
    });
  }

  async logout(request) {
    const token = parseCookies(request.headers.get('cookie'))[COOKIE_NAME];
    if (token) await this.ctx.storage.delete(await this.sessionKey(token));
    return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
  }

  async fetch(request) {
    if (!allowedOrigin(request)) return json({ ok: false, code: 'ORIGIN_DENIED', message: 'Origine non autorizzata.' }, 403);
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname.endsWith('/register')) return this.register(request);
    if (request.method === 'POST' && url.pathname.endsWith('/login')) return this.login(request);
    if (request.method === 'GET' && url.pathname.endsWith('/session')) return this.session(request);
    if (request.method === 'GET' && url.pathname.endsWith('/entitlement')) return this.billingStatus(request, false);
    if (request.method === 'POST' && url.pathname.endsWith('/restore-studio')) return this.restoreStudio(request);
    if (request.method === 'GET' && url.pathname === '/api/billing/status') return this.billingStatus(request, true);
    if (request.method === 'GET' && url.pathname === '/api/video/status') return this.videoStatus(request);
    if (request.method === 'POST' && url.pathname.endsWith('/logout')) return this.logout(request);
    if (request.method === 'POST' && url.pathname.endsWith('/reset')) {
      return json({ ok: false, code: 'RESET_EMAIL_NOT_CONFIGURED', message: 'Recupero password via email momentaneamente non disponibile.' }, 503);
    }
    if (request.method === 'GET' && url.pathname.endsWith('/health')) {
      return json({ ok: true, service: VERSION });
    }
    return json({ ok: false, code: 'NOT_FOUND', message: 'Endpoint auth non trovato.' }, 404);
  }
}

export async function handleSonaraNativeAuth(request, env) {
  const url = new URL(request.url);
  const nativePath = url.pathname.startsWith('/api/sonara-auth/');
  const billingStatusPath = url.pathname === '/api/billing/status';
  const videoStatusPath = url.pathname === '/api/video/status';
  if (!nativePath && !billingStatusPath && !videoStatusPath) return null;
  if (!env?.SONARA_AUTH) return json({ ok: false, code: 'AUTH_STORE_UNAVAILABLE', message: 'Servizio account SONARA non disponibile.' }, 503);
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'cache-control': 'no-store, max-age=0',
        'x-sonara-auth': VERSION
      }
    });
  }
  const id = env.SONARA_AUTH.idFromName('sonara-auth-global-v1');
  const stub = env.SONARA_AUTH.get(id);
  try {
    return await stub.fetch(request);
  } catch (error) {
    const diagnostic = String(error?.name || 'Error') + ': ' + String(error?.message || error || 'unknown').slice(0, 300);
    return json({ ok: false, code: 'AUTH_INTERNAL_ERROR', message: 'Errore interno autenticazione SONARA.', diagnostic }, 500);
  }
}