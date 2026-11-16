// Authenticated read-only bridge for ACE-Step R2 jobs started by the Creator.
// /api/billing/job is not implemented by the legacy Vercel billing handler.
// Only intercept jobs that actually exist under the ACE-Step R2 namespace.
// Other jobs (including OpenModel and Remix Pro) keep their existing handlers.
const JOB_ID = /^sr2_[0-9a-f-]{36}$/;
const json = (data, status) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store', 'x-content-type-options':'nosniff' }
});

export async function bridgeAceR2BillingJob(request, env, ctx, deps) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/billing/job' ||
      !['sonaraenterprise.com','www.sonaraenterprise.com'].includes(url.hostname) ||
      env?.SONARA_R2_RELAY_ENABLED !== 'true') return null;
  const jobId = String(url.searchParams.get('jobId') || '').trim();
  if (!JOB_ID.test(jobId)) return null;
  const bucket = env?.SONARA_AUDIO_BUCKET;
  if (!bucket) return json({ error:'Relay storage unavailable' }, 503);
  let found;
  try { found = await bucket.head('relay-v1/jobs/' + jobId + '.json'); }
  catch { return json({ error:'Relay state unavailable' }, 503); }
  if (!found) return null;

  const sessionHeaders = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) sessionHeaders.set('cookie', cookie);
  // Never pass an unverified caller's UID or internal token to the relay.
  const sessionRequest = new Request(new URL('/api/sonara-auth/session', url.origin), {
    method:'GET', headers:sessionHeaders, redirect:'manual'
  });
  let session;
  try {
    const reply = await deps.sessionAuth(sessionRequest, env);
    if (!reply?.ok) return json({ error:'Sessione SONARA non valida' }, 401);
    session = await reply.json();
  } catch {
    return json({ error:'Verifica sessione non disponibile' }, 503);
  }
  const uid = String(session?.user?.uid || '').trim();
  if (session?.authenticated !== true || !uid || uid.length > 128) {
    return json({ error:'Accedi per vedere il tuo brano' }, 401);
  }
  try {
    const key = await deps.deriveKey(env);
    const headers = new Headers({
      'X-Sonara-Internal-Secret':key,
      'X-Sonara-User-Uid':uid,
      'cache-control':'no-store'
    });
    const target = new URL('/api/sonara-relay/job/' + jobId, url.origin);
    const result = await deps.relayRuntime.fetch(new Request(target, {
      method:'GET', headers, redirect:'manual'
    }), { ...env, SONARA_INTERNAL_PROXY_SECRET:key }, ctx);
    const outputHeaders = new Headers(result.headers);
    outputHeaders.set('cache-control','private, no-store');
    outputHeaders.set('x-sonara-job-route','authenticated-ace-r2');
    return new Response(result.body, {
      status:result.status, statusText:result.statusText, headers:outputHeaders
    });
  } catch {
    return json({ error:'Stato R2 temporaneamente non disponibile' }, 503);
  }
}
