const VERSION = 'sonara-firebase-public-config-edge-v1';
const PROJECT_ID = 'sonara-enterprise';
const KEY_RE = /AIza[0-9A-Za-z_-]{30,50}/g;
let cache = null;

async function json(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

async function probe(key) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: 'https://sonaraenterprise.com' },
    body: JSON.stringify({ email: `sonara-public-probe-${Date.now()}@example.invalid`, password: 'not-a-real-password', returnSecureToken: true })
  });
  const body = await json(response);
  const raw = JSON.stringify(body);
  const code = String(body?.error?.message || '').toUpperCase();
  if (/CONSUMER_SUSPENDED|HAS BEEN SUSPENDED|API-KEY[^\n]*SUSPEND|API_KEY[^\n]*SUSPEND/i.test(raw)) return { ok: false, reason: 'consumer_suspended', code };
  if (/API_KEY_INVALID|API_KEY_SERVICE_BLOCKED|API_KEY_HTTP_REFERRER_BLOCKED|PERMISSION_DENIED/i.test(raw)) return { ok: false, reason: 'key_rejected', code };
  if (/OPERATION_NOT_ALLOWED|PASSWORD_LOGIN_DISABLED/i.test(raw)) return { ok: false, reason: 'email_password_disabled', code };
  if (/INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD|USER_DISABLED|TOO_MANY_ATTEMPTS|TOO_MANY_REQUESTS/i.test(raw) || response.status === 400) {
    return { ok: true, reason: 'firebase_auth_accepted', code };
  }
  return { ok: response.ok, reason: response.ok ? 'firebase_auth_accepted' : 'unknown_rejection', code };
}

async function publicConfig() {
  if (cache?.key && Date.now() - cache.at < 5 * 60 * 1000) return cache;
  const origins = [
    `https://${PROJECT_ID}.firebaseapp.com/__/firebase/init.json`,
    `https://${PROJECT_ID}.web.app/__/firebase/init.json`
  ];
  const attempts = [];
  for (const url of origins) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
      const body = await json(response);
      const key = String(body?.apiKey || '').trim();
      if (!response.ok || !key) {
        attempts.push({ host: new URL(url).hostname, http: response.status, reason: 'config_unavailable' });
        continue;
      }
      const keyProbe = await probe(key);
      attempts.push({ host: new URL(url).hostname, http: response.status, reason: keyProbe.reason });
      if (keyProbe.ok) {
        cache = { key, at: Date.now(), source: new URL(url).hostname, probe: keyProbe, attempts };
        return cache;
      }
    } catch {
      attempts.push({ host: new URL(url).hostname, http: 0, reason: 'fetch_failed' });
    }
  }
  return { key: '', at: Date.now(), source: null, probe: null, attempts };
}

function status(data, http = 200) {
  return new Response(JSON.stringify({ version: VERSION, ...data }), {
    status: http,
    headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store', 'x-sonara-firebase-public-config': VERSION }
  });
}

export async function handleFirebasePublicConfigEdge(request, response) {
  const url = new URL(request.url);
  if (url.pathname === '/__sonara_internal/firebase-public-config-status') {
    const result = await publicConfig();
    return status({
      ok: Boolean(result.key),
      source: result.source,
      probe: result.probe?.reason || null,
      attempts: result.attempts,
      hasKey: Boolean(result.key)
    }, result.key ? 200 : 503);
  }

  if (request.method !== 'GET' || !/^\/assets\/index-[^/]+\.js$/.test(url.pathname)) return null;
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('javascript') && !type.includes('text/plain')) return null;
  const result = await publicConfig();
  if (!result.key) {
    const headers = new Headers(response.headers);
    headers.set('x-sonara-firebase-public-config', VERSION);
    headers.set('x-sonara-firebase-public-status', result.attempts.map(a => a.reason).join(','));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  const text = await response.text();
  const candidates = [...new Set(text.match(KEY_RE) || [])];
  let rewritten = text;
  let replaced = 0;
  for (const candidate of candidates) {
    if (candidate === result.key) continue;
    try {
      const candidateProbe = await probe(candidate);
      if (candidateProbe.reason === 'consumer_suspended') {
        rewritten = rewritten.split(candidate).join(result.key);
        replaced += 1;
      }
    } catch {}
  }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('content-type', 'application/javascript; charset=UTF-8');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-firebase-public-config', VERSION);
  headers.set('x-sonara-firebase-public-status', 'firebase_auth_accepted');
  headers.set('x-sonara-firebase-public-replacements', String(replaced));
  return new Response(rewritten, { status: response.status, statusText: response.statusText, headers });
}
