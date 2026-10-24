// Verify the site's private API key using a public SHA-256 fingerprint.
// No API key is committed, returned, or stored in a client-side variable.
// Internal audio-signing material is derived from the existing Worker-only
// relay secret with domain separation; the public fingerprint is NEVER a key.
const enc = new TextEncoder();
const REVISION = 'sonara-gateway-fingerprint-v1';
const DOMAIN = 'SONARA private relay gateway v1 | api.sonaraenterprise.com';
const INTERNAL_HEADER = 'X-Sonara-Internal-Secret';
const JOB = 'sr2_[0-9a-f-]{36}';
const musicJob = new RegExp('^/api/music/job/' + JOB + '$');
const relayJob = new RegExp('^/api/sonara-relay/job/' + JOB + '$');
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const fingerprint = env => String(env.SONARA_GATEWAY_SHA256 || '').trim().toLowerCase();
const configured = env => /^[0-9a-f]{64}$/.test(fingerprint(env));

function sameHex(a, b) {
  if (a.length !== 64 || b.length !== 64) return false;
  let diff = 0;
  for (let i = 0; i < 64; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authenticated(request, env) {
  if (!configured(env)) return false;
  const supplied = request.headers.get(INTERNAL_HEADER) || '';
  if (supplied.length < 32 || supplied.length > 512) return false;
  return sameHex(hex(await crypto.subtle.digest('SHA-256', enc.encode(supplied))), fingerprint(env));
}

async function internalKey(env) {
  const root = String(env.SONARA_RELAY_TOKEN || '');
  if (root.length < 32) throw new Error('Relay signing root unavailable');
  const key = await crypto.subtle.importKey('raw', enc.encode(root), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(DOMAIN)));
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-sonara-gateway-verifier': REVISION,
    },
  });
}

export function withGatewayVerifier(runtime) {
  return {
    async fetch(request, env, ctx) {
      const path = new URL(request.url).pathname;
      const usable = configured(env) && String(env.SONARA_RELAY_TOKEN || '').length >= 32;
      if (path === '/api/sonara-relay/gateway-auth') {
        if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
        if (!usable) return json({ service: 'sonara-gateway', authenticated: false, error: 'Gateway not configured' }, 503);
        if (!(await authenticated(request, env))) return json({ error: 'Unauthorized' }, 401);
        return json({
          service: 'sonara-gateway',
          authenticated: true,
          revision: REVISION,
          storageConfigured: Boolean(env.SONARA_AUDIO_BUCKET),
          relayEnabled: env.SONARA_R2_RELAY_ENABLED === 'true',
        });
      }

      // Preserve all existing site, billing, login and legacy engine behavior.
      // The public relay switch is not changed or implicitly enabled here.
      const engineRequest = path === '/api/engine/generate' && request.method === 'POST';
      const pollingRequest = musicJob.test(path) && request.method === 'GET';
      const relayRequest = path.startsWith('/api/sonara-relay/') ||
        (env.SONARA_R2_RELAY_ENABLED === 'true' && (engineRequest || pollingRequest));
      if (!relayRequest || !usable) return runtime.fetch(request, env, ctx);
      if (request.method === 'OPTIONS') return runtime.fetch(request, env, ctx);

      const accepted = await authenticated(request, env);
      const needsGateway = engineRequest || pollingRequest ||
        (path === '/api/sonara-relay/enqueue' && request.method === 'POST') ||
        (relayJob.test(path) && request.method === 'GET');
      if (needsGateway && !accepted) return json({ error: 'Unauthorized music gateway' }, 401);

      const derived = await internalKey(env);
      const headers = new Headers(request.headers);
      // Never trust an externally supplied internal/derived header.
      headers.delete(INTERNAL_HEADER);
      if (accepted) headers.set(INTERNAL_HEADER, derived);
      // The original relay handles agent-token auth, leases and signed audio.
      // A stable private derived key keeps signed URLs verifiable on later GETs.
      const scopedEnv = { ...env, SONARA_INTERNAL_PROXY_SECRET: derived };
      return runtime.fetch(new Request(request, { headers }), scopedEnv, ctx);
    },
  };
}
