const VERSION = 'sonara-firebase-auth-edge-v2';
const STATE_NAME = '__sonara_firebase_web_key_v2';
const FIREBASE_PROJECT_FALLBACK = 'sonara-enterprise';
const REQUIRED_DOMAINS = [
  'sonaraenterprise.com',
  'www.sonaraenterprise.com',
  'sonaraenterprice.com',
  'sonara-enterprise.vercel.app',
  'sonara-enterprise-sonaramusicai86-2765s-projects.vercel.app',
  'sonara-enterprise-git-main-sonaramusicai86-2765s-projects.vercel.app'
];
const REQUIRED_REFERRERS = [
  'https://sonaraenterprise.com/*',
  'https://*.sonaraenterprise.com/*',
  'https://www.sonaraenterprise.com/*',
  'https://sonaraenterprice.com/*',
  'https://*.sonaraenterprice.com/*',
  'https://sonara-enterprise.vercel.app/*',
  'https://*.vercel.app/*'
];
const FIREBASE_KEY_RE = /AIza[0-9A-Za-z_-]{30,50}/g;

let memoryState = null;
let repairPromise = null;

function safeJson(text) {
  try { return JSON.parse(text); } catch { return {}; }
}

async function readJson(response) {
  const text = await response.text();
  return text ? safeJson(text) : {};
}

function statusJson(data, status = 200) {
  return new Response(JSON.stringify({ version: VERSION, ...data }), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store, max-age=0',
      'x-sonara-firebase-auth-edge': VERSION
    }
  });
}

function placeholder(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return ['[sensitive]', 'sensitive', '[redacted]', 'redacted', 'undefined', 'null'].includes(text.toLowerCase());
}

function parseServiceAccount(env) {
  const candidates = [
    ['vertex', env?.SONARA_VERTEX_SERVICE_ACCOUNT_JSON],
    ['firebase', env?.FIREBASE_SERVICE_ACCOUNT_JSON]
  ];

  for (const [source, rawValue] of candidates) {
    if (placeholder(rawValue)) continue;
    const raw = String(rawValue).trim();
    const parsed = safeJson(raw);
    if (parsed?.client_email && parsed?.private_key) {
      return {
        source,
        account: parsed,
        projectId: String(
          env?.SONARA_FIREBASE_PROJECT_ID ||
          env?.FIREBASE_PROJECT_ID ||
          parsed.project_id ||
          FIREBASE_PROJECT_FALLBACK
        ).trim()
      };
    }
  }
  return null;
}

function stateStub(env) {
  try {
    if (!env?.SONARA_JOB_STATE) return null;
    return env.SONARA_JOB_STATE.get(env.SONARA_JOB_STATE.idFromName(STATE_NAME));
  } catch {
    return null;
  }
}

async function loadState(env) {
  if (memoryState?.key) return memoryState;
  const stub = stateStub(env);
  if (!stub) return null;
  try {
    const response = await stub.fetch('https://sonara.internal/state');
    if (!response.ok) return null;
    const state = await response.json();
    if (state?.key) {
      memoryState = state;
      return state;
    }
  } catch {}
  return null;
}

async function saveState(env, state) {
  memoryState = state;
  const stub = stateStub(env);
  if (!stub) return;
  try {
    await stub.fetch('https://sonara.internal/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...state, persistent: true })
    });
  } catch {}
}

function base64Url(bytes) {
  let binary = '';
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < data.length; i += 1) binary += String.fromCharCode(data[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemBytes(pem) {
  const clean = String(pem || '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function serviceAccountToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64Url(encoder.encode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })));
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemBytes(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(signingInput));
  const assertion = `${signingInput}.${base64Url(signature)}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString()
  });
  const body = await readJson(response);
  const token = String(body?.access_token || '').trim();
  if (!response.ok || !token) {
    const description = String(body?.error_description || body?.error || `HTTP ${response.status}`);
    throw new Error(`oauth:${description.slice(0, 180)}`);
  }
  return token;
}

async function adminRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await readJson(response);
  if (!response.ok) {
    const message = String(body?.error?.message || body?.message || `HTTP ${response.status}`);
    throw new Error(`admin:${response.status}:${message.slice(0, 220)}`);
  }
  return body;
}

async function ensureEmailPasswordAndDomains(projectId, token) {
  const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/config`;
  const current = await adminRequest(base, token);
  const existingDomains = Array.isArray(current?.authorizedDomains)
    ? current.authorizedDomains.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  const authorizedDomains = [...new Set([...existingDomains, ...REQUIRED_DOMAINS])];
  const emailEnabled = current?.signIn?.email?.enabled === true;
  const passwordRequired = current?.signIn?.email?.passwordRequired !== false;
  const domainsReady = REQUIRED_DOMAINS.every(domain => authorizedDomains.includes(domain));
  if (emailEnabled && passwordRequired && domainsReady && existingDomains.length === authorizedDomains.length) {
    return { emailEnabled: true, domainsReady: true, changed: false };
  }

  await adminRequest(
    `${base}?updateMask=authorizedDomains,signIn.email.enabled,signIn.email.passwordRequired`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({
        name: current?.name || `projects/${projectId}/config`,
        authorizedDomains,
        signIn: {
          ...(current?.signIn || {}),
          email: {
            ...(current?.signIn?.email || {}),
            enabled: true,
            passwordRequired: true
          }
        }
      })
    }
  );
  return { emailEnabled: true, domainsReady: true, changed: true };
}

async function probeFirebaseKey(key) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Origin: 'https://sonaraenterprise.com',
      Referer: 'https://sonaraenterprise.com/'
    },
    body: JSON.stringify({
      email: `sonara-probe-${Date.now()}@example.invalid`,
      password: 'not-a-real-sonara-password',
      returnSecureToken: true
    })
  });
  const body = await readJson(response);
  const code = String(body?.error?.message || body?.message || '').toUpperCase();
  const raw = JSON.stringify(body);
  if (/CONSUMER_SUSPENDED|HAS BEEN SUSPENDED|API-KEY[^\n]*SUSPEND|API_KEY[^\n]*SUSPEND/i.test(raw)) {
    return { ok: false, reason: 'consumer_suspended', code };
  }
  if (/API_KEY_INVALID|API_KEY_SERVICE_BLOCKED|API_KEY_HTTP_REFERRER_BLOCKED|PERMISSION_DENIED/i.test(raw)) {
    return { ok: false, reason: 'key_rejected', code };
  }
  if (/OPERATION_NOT_ALLOWED|PASSWORD_LOGIN_DISABLED/i.test(raw)) {
    return { ok: false, reason: 'email_password_disabled', code };
  }
  if (
    /INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD|USER_DISABLED|TOO_MANY_ATTEMPTS|TOO_MANY_REQUESTS/i.test(raw) ||
    response.status === 400
  ) {
    return { ok: true, reason: 'firebase_auth_accepted', code };
  }
  return { ok: response.ok, reason: response.ok ? 'firebase_auth_accepted' : 'unknown_rejection', code };
}

async function apiKeyRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await readJson(response);
  if (!response.ok) {
    const message = String(body?.error?.message || body?.message || `HTTP ${response.status}`);
    throw new Error(`apikeys:${response.status}:${message.slice(0, 240)}`);
  }
  return body;
}

function keyLooksForSonara(resource) {
  const restrictions = resource?.restrictions || {};
  const refs = restrictions?.browserKeyRestrictions?.allowedReferrers || [];
  const targets = restrictions?.apiTargets || [];
  const siteAllowed = !refs.length || refs.some(value => /sonaraenterprise\.com|vercel\.app/i.test(String(value || '')));
  const identityAllowed = !targets.length || targets.some(target => String(target?.service || '') === 'identitytoolkit.googleapis.com');
  return siteAllowed && identityAllowed && String(resource?.state || 'ACTIVE').toUpperCase() !== 'DELETED';
}

async function findExistingKey(projectId, token) {
  let pageToken = '';
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ pageSize: '100' });
    if (pageToken) query.set('pageToken', pageToken);
    const data = await apiKeyRequest(
      `https://apikeys.googleapis.com/v2/projects/${encodeURIComponent(projectId)}/locations/global/keys?${query.toString()}`,
      token
    );
    const keys = Array.isArray(data?.keys) ? data.keys.filter(keyLooksForSonara) : [];
    for (const resource of keys) {
      const name = String(resource?.name || '').trim();
      if (!name) continue;
      try {
        const payload = await apiKeyRequest(`https://apikeys.googleapis.com/v2/${name}/keyString`, token);
        const key = String(payload?.keyString || '').trim();
        if (!key) continue;
        const probe = await probeFirebaseKey(key);
        if (probe.ok) return { key, keyName: name, source: 'existing_key', probe };
      } catch {}
    }
    pageToken = String(data?.nextPageToken || '').trim();
    if (!pageToken) break;
  }
  return null;
}

async function createReplacementKey(projectId, token) {
  const parent = `projects/${projectId}/locations/global`;
  let operation = await apiKeyRequest(
    `https://apikeys.googleapis.com/v2/${parent}/keys`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        displayName: `sonara-web-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}`,
        restrictions: {
          browserKeyRestrictions: { allowedReferrers: REQUIRED_REFERRERS },
          apiTargets: [
            { service: 'identitytoolkit.googleapis.com' },
            { service: 'securetoken.googleapis.com' }
          ]
        }
      })
    }
  );

  for (let attempt = 0; attempt < 30 && !operation?.done; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 500));
    operation = await apiKeyRequest(`https://apikeys.googleapis.com/v2/${operation.name}`, token);
  }
  if (!operation?.done) throw new Error('apikeys:operation_timeout');
  if (operation?.error) throw new Error(`apikeys:operation:${JSON.stringify(operation.error).slice(0, 200)}`);
  const keyName = String(operation?.response?.name || '').trim();
  if (!keyName) throw new Error('apikeys:missing_key_resource');
  const payload = await apiKeyRequest(`https://apikeys.googleapis.com/v2/${keyName}/keyString`, token);
  const key = String(payload?.keyString || '').trim();
  if (!key) throw new Error('apikeys:empty_key');
  const probe = await probeFirebaseKey(key);
  if (!probe.ok) throw new Error(`firebase_probe:${probe.reason}:${probe.code || ''}`);
  return { key, keyName, source: 'created_key', probe };
}

function publicReason(error) {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (/oauth:.*invalid_grant|account not found/i.test(raw)) return 'service_account_invalid';
  if (/apikeys:403|permission denied|permission_denied/i.test(raw)) return 'api_keys_permission_denied';
  if (/admin:403/i.test(raw)) return 'firebase_admin_permission_denied';
  if (/consumer_suspended|has been suspended/i.test(raw)) return 'google_consumer_suspended';
  if (/operation_timeout/i.test(raw)) return 'api_key_creation_timeout';
  if (/firebase_probe/i.test(raw)) return 'replacement_key_rejected';
  return 'repair_failed';
}

async function repairFirebaseAuth(env, force = false) {
  if (!force) {
    const cached = await loadState(env);
    if (cached?.key) {
      const probe = await probeFirebaseKey(cached.key);
      if (probe.ok) return { ...cached, probe, ok: true };
      memoryState = null;
    }
  }

  const credential = parseServiceAccount(env);
  if (!credential) throw new Error('service_account_unavailable');
  const token = await serviceAccountToken(credential.account);
  let config = { emailEnabled: false, domainsReady: false, changed: false };
  try {
    config = await ensureEmailPasswordAndDomains(credential.projectId, token);
  } catch (error) {
    config = { emailEnabled: false, domainsReady: false, changed: false, warning: publicReason(error) };
  }

  let resolved = await findExistingKey(credential.projectId, token);
  if (!resolved) resolved = await createReplacementKey(credential.projectId, token);

  const state = {
    key: resolved.key,
    keyName: resolved.keyName,
    source: resolved.source,
    credentialSource: credential.source,
    projectId: credential.projectId,
    emailEnabled: config.emailEnabled,
    domainsReady: config.domainsReady,
    configWarning: config.warning || null,
    updatedAt: Date.now()
  };
  await saveState(env, state);
  return { ...state, probe: resolved.probe, ok: true };
}

async function getRepair(env, force = false) {
  if (force) repairPromise = null;
  if (!repairPromise) {
    repairPromise = repairFirebaseAuth(env, force).finally(() => {
      repairPromise = null;
    });
  }
  return repairPromise;
}

async function bundleRepair(response, env) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('javascript') && !type.includes('text/plain')) return response;

  let repair;
  try {
    repair = await getRepair(env, false);
  } catch (error) {
    const headers = new Headers(response.headers);
    headers.set('x-sonara-firebase-auth-edge', VERSION);
    headers.set('x-sonara-firebase-auth-status', publicReason(error));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  const text = await response.text();
  const candidates = [...new Set(text.match(FIREBASE_KEY_RE) || [])];
  const suspended = [];
  for (const candidate of candidates) {
    if (candidate === repair.key) continue;
    try {
      const probe = await probeFirebaseKey(candidate);
      if (probe.reason === 'consumer_suspended') suspended.push(candidate);
    } catch {}
  }

  let rewritten = text;
  for (const badKey of suspended) rewritten = rewritten.split(badKey).join(repair.key);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('content-type', 'application/javascript; charset=UTF-8');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-firebase-auth-edge', VERSION);
  headers.set('x-sonara-firebase-auth-status', suspended.length ? 'repaired' : 'ready');
  headers.set('x-sonara-firebase-key-replacements', String(suspended.length));
  return new Response(rewritten, { status: response.status, statusText: response.statusText, headers });
}

export async function handleFirebaseAuthEdge(request, env, response) {
  const url = new URL(request.url);
  if (url.pathname === '/__sonara_internal/firebase-auth-status') {
    try {
      const force = url.searchParams.get('repair') === '1';
      const state = await getRepair(env, force);
      return statusJson({
        ok: true,
        projectId: state.projectId,
        source: state.source,
        credentialSource: state.credentialSource,
        emailEnabled: state.emailEnabled,
        domainsReady: state.domainsReady,
        configWarning: state.configWarning || null,
        firebaseProbe: state.probe?.reason || 'accepted',
        hasKey: Boolean(state.key),
        updatedAt: state.updatedAt
      });
    } catch (error) {
      return statusJson({ ok: false, reason: publicReason(error), hasKey: false }, 503);
    }
  }

  if (request.method === 'GET' && /^\/assets\/index-[^/]+\.js$/.test(url.pathname)) {
    return bundleRepair(response, env);
  }
  return null;
}
