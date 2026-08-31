const VERSION = 'sonara-native-auth-v1';
const COOKIE_NAME = 'sonara_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const PASSWORD_ITERATIONS = 100000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

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

function publicUser(user) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || '',
    createdAt: user.createdAt
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
    const user = {
      uid: crypto.randomUUID(),
      email,
      displayName: String(body?.displayName || '').trim().slice(0, 80),
      passwordHash: bytesToBase64(digest),
      passwordSalt: bytesToBase64(salt),
      passwordIterations: PASSWORD_ITERATIONS,
      createdAt: Date.now(),
      status: 'active'
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
    const token = parseCookies(request.headers.get('cookie'))[COOKIE_NAME];
    if (!token) return json({ ok: true, authenticated: false, user: null });
    const key = await this.sessionKey(token);
    const session = await this.ctx.storage.get(key);
    if (!session || Number(session.expiresAt || 0) <= Date.now()) {
      if (session) await this.ctx.storage.delete(key);
      return json({ ok: true, authenticated: false, user: null }, 200, { 'set-cookie': clearSessionCookie() });
    }
    const user = await this.ctx.storage.get(session.userKey);
    if (!user || user.status !== 'active') {
      await this.ctx.storage.delete(key);
      return json({ ok: true, authenticated: false, user: null }, 200, { 'set-cookie': clearSessionCookie() });
    }
    return json({ ok: true, authenticated: true, user: publicUser(user) });
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
  if (!url.pathname.startsWith('/api/sonara-auth/')) return null;
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
  return stub.fetch(request);
}
