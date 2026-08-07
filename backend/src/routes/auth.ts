import crypto from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import { verifyFirebaseIdToken } from '../auth/FirebaseAuth';

const router = Router();
const SESSION_COOKIE = 'sonara_session';
const SPOTIFY_STATE_COOKIE = 'sonara_spotify_state';
const SPOTIFY_VERIFIER_COOKIE = 'sonara_spotify_verifier';
const SPOTIFY_RETURN_COOKIE = 'sonara_spotify_return';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_MAX_AGE_MS = 10 * 60 * 1000;

interface SonaraSession {
  sub: string;
  email?: string;
  displayName?: string;
  photoUrl?: string;
  provider: 'google' | 'apple' | 'facebook' | 'spotify' | 'firebase';
  issuedAt: number;
  expiresAt: number;
}

function getAuthSecret(): string {
  return String(process.env.SONARA_AUTH_SECRET || '');
}

function isSecureRequest(req: Request): boolean {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function cookieOptions(req: Request, maxAge: number, path = '/') {
  return {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: 'lax' as const,
    maxAge,
    path
  };
}

function parseCookies(req: Request): Record<string, string> {
  return String(req.headers.cookie || '')
    .split(';')
    .map(entry => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, entry) => {
      const separator = entry.indexOf('=');
      if (separator < 0) return cookies;
      const key = entry.slice(0, separator).trim();
      const value = entry.slice(separator + 1).trim();
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

function signSession(session: SonaraSession): string {
  const secret = getAuthSecret();
  if (!secret) throw new Error('SONARA_AUTH_SECRET is not configured.');
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readSession(value: string): SonaraSession | null {
  const secret = getAuthSecret();
  if (!secret || !value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SonaraSession;
    if (!session.sub || !session.provider || Date.now() >= Number(session.expiresAt || 0)) return null;
    return session;
  } catch {
    return null;
  }
}

function sanitizeReturnTo(value: unknown): string {
  const returnTo = String(value || '/');
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) return '/';
  return returnTo;
}

function publicFirebaseConfig() {
  const config = {
    apiKey: process.env.SONARA_FIREBASE_API_KEY || '',
    authDomain: process.env.SONARA_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.SONARA_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.SONARA_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.SONARA_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.SONARA_FIREBASE_APP_ID || ''
  };
  const configured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
  return { configured, config: configured ? config : null };
}

function spotifyRedirectUri(req: Request): string {
  const configured = String(process.env.SPOTIFY_REDIRECT_URI || '').trim();
  if (configured) return configured;
  const protocol = isSecureRequest(req) ? 'https' : 'http';
  return `${protocol}://${req.get('host')}/api/auth/spotify/callback`;
}

function providerName(decodedProvider: string): SonaraSession['provider'] {
  if (decodedProvider.includes('google')) return 'google';
  if (decodedProvider.includes('apple')) return 'apple';
  if (decodedProvider.includes('facebook')) return 'facebook';
  return 'firebase';
}

export function requireSonaraAuthentication(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (process.env.SONARA_REQUIRE_AUTH !== 'true') return next();
  const session = readSession(parseCookies(req)[SESSION_COOKIE]);
  if (!session) {
    return res.status(401).json({
      status: 'error',
      code: 'AUTH_SESSION_REQUIRED',
      error: 'An authenticated Sonara session is required.'
    });
  }
  res.locals.sonaraUser = session;
  return next();
}

router.get('/config', (_req, res) => {
  const firebase = publicFirebaseConfig();
  const authRequired = process.env.SONARA_REQUIRE_AUTH === 'true';
  const guestAllowed = process.env.SONARA_ALLOW_GUEST === 'true' ||
    (!authRequired && process.env.SONARA_ALLOW_GUEST !== 'false');
  const spotifyReady = Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
    process.env.SPOTIFY_REDIRECT_URI &&
    getAuthSecret()
  );
  return res.json({
    status: 'success',
    authRequired,
    guestAllowed,
    firebaseConfig: firebase.config,
    providers: {
      google: firebase.configured && process.env.SONARA_AUTH_GOOGLE_ENABLED === 'true',
      apple: firebase.configured && process.env.SONARA_AUTH_APPLE_ENABLED === 'true',
      facebook: firebase.configured && process.env.SONARA_AUTH_FACEBOOK_ENABLED === 'true',
      spotify: spotifyReady
    }
  });
});

router.get('/session', (req, res) => {
  const session = readSession(parseCookies(req)[SESSION_COOKIE]);
  return res.json({
    status: 'success',
    authenticated: Boolean(session),
    user: session
      ? {
          id: session.sub,
          email: session.email,
          displayName: session.displayName,
          photoUrl: session.photoUrl,
          provider: session.provider
        }
      : null
  });
});

router.post('/firebase/session', async (req, res) => {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  if (!token) return res.status(401).json({ status: 'error', error: 'Firebase ID token missing.' });
  if (!getAuthSecret()) {
    return res.status(503).json({ status: 'error', error: 'SONARA_AUTH_SECRET is not configured.' });
  }

  try {
    const decoded = await verifyFirebaseIdToken(token);
    const session: SonaraSession = {
      sub: decoded.uid,
      email: decoded.email,
      displayName: decoded.name || decoded.email || 'Sonara Artist',
      photoUrl: decoded.picture,
      provider: providerName(decoded.firebase?.sign_in_provider || ''),
      issuedAt: Date.now(),
      expiresAt: Date.now() + SESSION_MAX_AGE_MS
    };
    res.cookie(SESSION_COOKIE, signSession(session), cookieOptions(req, SESSION_MAX_AGE_MS));
    return res.json({ status: 'success', authenticated: true, user: {
      id: session.sub,
      email: session.email,
      displayName: session.displayName,
      photoUrl: session.photoUrl,
      provider: session.provider
    }});
  } catch (error) {
    console.error('[AUTH] Firebase session exchange failed:', error);
    return res.status(401).json({ status: 'error', error: 'Firebase authentication failed.' });
  }
});

router.get('/spotify/start', (req, res) => {
  const clientId = String(process.env.SPOTIFY_CLIENT_ID || '').trim();
  if (!clientId || !getAuthSecret()) {
    return res.status(503).json({ status: 'error', error: 'Spotify authentication is not configured.' });
  }

  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(64).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const returnTo = sanitizeReturnTo(req.query.returnTo);
  const oauthCookieOptions = cookieOptions(req, OAUTH_MAX_AGE_MS, '/api/auth/spotify');
  res.cookie(SPOTIFY_STATE_COOKIE, state, oauthCookieOptions);
  res.cookie(SPOTIFY_VERIFIER_COOKIE, verifier, oauthCookieOptions);
  res.cookie(SPOTIFY_RETURN_COOKIE, returnTo, oauthCookieOptions);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'user-read-email user-read-private',
    redirect_uri: spotifyRedirectUri(req),
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    show_dialog: 'true'
  });
  return res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

router.get('/spotify/callback', async (req, res) => {
  const cookies = parseCookies(req);
  const state = String(req.query.state || '');
  const code = String(req.query.code || '');
  const returnTo = sanitizeReturnTo(cookies[SPOTIFY_RETURN_COOKIE]);
  const clearOptions = { ...cookieOptions(req, 0, '/api/auth/spotify'), maxAge: 0 };

  res.clearCookie(SPOTIFY_STATE_COOKIE, clearOptions);
  res.clearCookie(SPOTIFY_VERIFIER_COOKIE, clearOptions);
  res.clearCookie(SPOTIFY_RETURN_COOKIE, clearOptions);

  if (
    !state ||
    !code ||
    !cookies[SPOTIFY_STATE_COOKIE] ||
    state !== cookies[SPOTIFY_STATE_COOKIE] ||
    !cookies[SPOTIFY_VERIFIER_COOKIE]
  ) {
    return res.redirect(`${returnTo}?auth_error=spotify_state_validation_failed`);
  }

  try {
    const clientId = String(process.env.SPOTIFY_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.SPOTIFY_CLIENT_SECRET || '').trim();
    const tokenHeaders: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (clientSecret) {
      tokenHeaders.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    }
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: tokenHeaders,
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: spotifyRedirectUri(req),
        client_id: clientId,
        code_verifier: cookies[SPOTIFY_VERIFIER_COOKIE]
      })
    });
    const tokenData = await tokenResponse.json() as { access_token?: string; error_description?: string };
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || `Spotify token exchange failed (${tokenResponse.status}).`);
    }

    const profileResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await profileResponse.json() as Record<string, any>;
    if (!profileResponse.ok || !profile.id) throw new Error('Spotify profile lookup failed.');

    const session: SonaraSession = {
      sub: String(profile.id),
      email: profile.email ? String(profile.email) : undefined,
      displayName: String(profile.display_name || profile.email || 'Spotify Artist'),
      photoUrl: Array.isArray(profile.images) ? profile.images[0]?.url : undefined,
      provider: 'spotify',
      issuedAt: Date.now(),
      expiresAt: Date.now() + SESSION_MAX_AGE_MS
    };
    res.cookie(SESSION_COOKIE, signSession(session), cookieOptions(req, SESSION_MAX_AGE_MS));
    return res.redirect(returnTo);
  } catch (error) {
    console.error('[AUTH] Spotify callback failed:', error);
    return res.redirect(`${returnTo}?auth_error=spotify_authentication_failed`);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(req, 0), maxAge: 0 });
  return res.json({ status: 'success', authenticated: false });
});

export default router;
