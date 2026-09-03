import {
  EMBER_MAX_MESSAGE_LENGTH,
  EMBER_MAX_SDP_LENGTH,
  EMBER_MAX_SPEECH_LENGTH,
  EmberConversationMessage,
  EmberService,
  EmberServiceError,
  EmberStudioContext
} from '../../backend/src/services/EmberService';

const RATE_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_APP_URL = 'https://sonaraenterprise.com';
const NATIVE_SESSION_MARKER = 'sonara-native-session';
const limits = new Map<string, { startedAt: number; chat: number; speech: number; realtime: number }>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sendError(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function sendServiceError(res: any, error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (!(error instanceof EmberServiceError)) return sendError(res, 502, fallbackCode, fallbackMessage);
  if (error.code === 'NOT_CONFIGURED') return sendError(res, 503, 'EMBER_NOT_CONFIGURED', 'Ember API is not configured on the server.');
  if (error.code === 'OPENAI_AUTH') return sendError(res, 503, 'EMBER_OPENAI_AUTH_ERROR', 'The configured OpenAI API key is not authorized.');
  if (error.code === 'OPENAI_QUOTA') return sendError(res, 503, 'EMBER_OPENAI_QUOTA_ERROR', 'The OpenAI project has no available credit or quota.');
  if (error.code === 'MODEL_UNAVAILABLE') return sendError(res, 503, 'EMBER_REALTIME_MODEL_UNAVAILABLE', 'The Realtime model is not available for this OpenAI project.');
  return sendError(res, 502, fallbackCode, fallbackMessage);
}

function requestBody(req: any): Record<string, unknown> {
  if (isPlainObject(req.body)) return req.body;
  if (typeof req.body !== 'string') return {};
  try {
    const parsed = JSON.parse(req.body);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function requestText(req: any): Promise<string> {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (!req.body && req?.[Symbol.asyncIterator]) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > EMBER_MAX_SDP_LENGTH) return '';
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  return '';
}

function normalizeAction(value: unknown): string {
  const joined = (Array.isArray(value) ? value : [value])
    .filter(part => typeof part === 'string')
    .map(part => String(part).trim())
    .filter(Boolean)
    .join('/');
  const segments = joined.split('/').filter(Boolean);
  const emberIndex = segments.lastIndexOf('ember');
  return (emberIndex >= 0 ? segments.slice(emberIndex + 1) : segments).join('/').toLowerCase();
}

export function resolveEmberAction(req: any): string {
  const queryAction = normalizeAction(req.query?.path);
  if (queryAction) return queryAction;

  for (const candidate of [req.url, req.originalUrl]) {
    const pathname = String(candidate || '').split(/[?#]/, 1)[0];
    const match = pathname.match(/\/api\/ember(?:\/(.*))?\/?$/i);
    const urlAction = normalizeAction(match?.[1]);
    if (urlAction) return urlAction;
  }
  return '';
}

function rateLimited(userId: string, kind: 'chat' | 'speech' | 'realtime'): boolean {
  const now = Date.now();
  const current = limits.get(userId);
  const entry = !current || current.startedAt + RATE_WINDOW_MS <= now
    ? { startedAt: now, chat: 0, speech: 0, realtime: 0 }
    : current;
  const maximum = kind === 'chat' ? 20 : kind === 'speech' ? 10 : 6;
  if (entry[kind] >= maximum) return true;
  entry[kind] += 1;
  limits.set(userId, entry);
  return false;
}

function bearerToken(req: any): string {
  return String(req.headers?.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

async function authenticateWithFirebaseRest(token: string): Promise<string | null> {
  const firebaseApiKey = String(
    process.env.VITE_FIREBASE_API_KEY || process.env.SONARA_FIREBASE_API_KEY || ''
  ).trim();
  if (!token || !firebaseApiKey || token === NATIVE_SESSION_MARKER) return null;

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token })
      }
    );
    if (!response.ok) return null;
    const payload = await response.json() as { users?: Array<{ localId?: string }> };
    return String(payload.users?.[0]?.localId || '').trim() || null;
  } catch {
    return null;
  }
}

async function authenticateWithNativeSession(req: any): Promise<string | null> {
  const cookie = String(req.headers?.cookie || '').trim();
  if (!cookie || !/(?:^|;\s*)sonara_session=/.test(cookie)) return null;

  const authBase = String(process.env.SONARA_NATIVE_AUTH_URL || DEFAULT_APP_URL).replace(/\/$/, '');
  try {
    const response = await fetch(`${authBase}/api/sonara-auth/session`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Cookie: cookie
      },
      redirect: 'manual'
    });
    if (!response.ok) return null;
    const payload = await response.json() as {
      authenticated?: boolean;
      user?: { uid?: string } | null;
    };
    if (!payload?.authenticated) return null;
    return String(payload.user?.uid || '').trim() || null;
  } catch {
    return null;
  }
}

async function authenticatedUserId(req: any): Promise<string | null> {
  const token = bearerToken(req);
  if (token && token !== NATIVE_SESSION_MARKER) {
    const firebaseUserId = await authenticateWithFirebaseRest(token);
    if (firebaseUserId) return firebaseUserId;
  }
  return authenticateWithNativeSession(req);
}

function emberConfig() {
  return {
    chatEnabled: EmberService.isConfigured(),
    voiceEnabled: EmberService.voiceEnabled(),
    realtimeEnabled: EmberService.realtimeEnabled(),
    voice: String(process.env.EMBER_TTS_VOICE || '').trim() || 'alloy',
    realtimeVoice: String(process.env.EMBER_REALTIME_VOICE || '').trim() || 'marin',
    authMode: 'sonara-native-or-firebase'
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (String(req.headers?.['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
    return sendError(res, 403, 'EMBER_CROSS_SITE_REJECTED', 'Cross-site requests are not allowed.');
  }

  const action = resolveEmberAction(req);
  if (req.method === 'GET' && action === 'config') {
    return res.status(200).json(emberConfig());
  }

  const userId = await authenticatedUserId(req);
  if (!userId) {
    return sendError(res, 401, 'AUTH_SESSION_INVALID', 'A valid SONARA or Firebase session is required.');
  }

  if (req.method === 'POST' && action === 'chat') {
    const body = requestBody(req);
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const history = Array.isArray(body.history) ? body.history : [];
    const studioContext = isPlainObject(body.studioContext) ? body.studioContext : {};
    if (!message || message.length > EMBER_MAX_MESSAGE_LENGTH) {
      return sendError(res, 400, 'EMBER_INVALID_MESSAGE', 'The message is empty or too long.');
    }
    if (rateLimited(userId, 'chat')) {
      return sendError(res, 429, 'EMBER_RATE_LIMITED', 'Too many Ember requests. Please try again later.');
    }

    try {
      const reply = await EmberService.chat({
        message,
        history: history as EmberConversationMessage[],
        studioContext: studioContext as EmberStudioContext
      });
      return res.status(200).json({ reply });
    } catch (error) {
      return sendServiceError(res, error, 'EMBER_UPSTREAM_ERROR', 'Ember is temporarily unavailable.');
    }
  }

  if (req.method === 'POST' && action === 'speech') {
    const body = requestBody(req);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > EMBER_MAX_SPEECH_LENGTH || /[\u0000-\u0008\u000B\u000C\u000E-\u001F<>]/.test(text)) {
      return sendError(res, 400, 'EMBER_VOICE_INVALID_TEXT', 'The speech text is invalid or too long.');
    }
    if (!EmberService.voiceEnabled()) {
      return sendError(res, 503, 'EMBER_VOICE_NOT_CONFIGURED', 'Ember Voice is not configured on the server.');
    }
    if (rateLimited(userId, 'speech')) {
      return sendError(res, 429, 'EMBER_VOICE_RATE_LIMITED', 'Too many voice requests. Please try again later.');
    }

    try {
      const audio = await EmberService.speak(text);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', String(audio.length));
      res.setHeader('Content-Disposition', 'inline; filename="ember.mp3"');
      return res.status(200).send(audio);
    } catch (error) {
      return sendServiceError(res, error, 'EMBER_VOICE_UPSTREAM_ERROR', 'Ember Voice is temporarily unavailable.');
    }
  }

  if (req.method === 'POST' && action === 'realtime-token') {
    if (!EmberService.realtimeEnabled()) {
      return sendError(res, 503, 'EMBER_REALTIME_NOT_CONFIGURED', 'Ember Realtime is not configured on the server.');
    }
    if (rateLimited(userId, 'realtime')) {
      return sendError(res, 429, 'EMBER_REALTIME_RATE_LIMITED', 'Too many realtime sessions. Please try again later.');
    }
    const body = requestBody(req);
    const source = isPlainObject(body.studioContext) ? body.studioContext : {};
    const studioContext: EmberStudioContext = {
      genre: String(source.genre || '').slice(0, 100),
      subgenre: String(source.subgenre || '').slice(0, 100),
      mood: String(source.mood || '').slice(0, 100),
      bpm: Number(source.bpm) || undefined,
      keySignature: String(source.keySignature || '').slice(0, 40),
      hasAudio: Boolean(source.hasAudio)
    };
    try {
      const secret = await EmberService.createRealtimeClientSecret({ userId, studioContext });
      return res.status(200).json(secret);
    } catch (error) {
      return sendServiceError(res, error, 'EMBER_REALTIME_UPSTREAM_ERROR', 'Ember Realtime is temporarily unavailable.');
    }
  }

  if (req.method === 'POST' && action === 'realtime') {
    if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/sdp')) {
      return sendError(res, 415, 'EMBER_REALTIME_INVALID_CONTENT_TYPE', 'An SDP offer is required.');
    }
    if (!EmberService.realtimeEnabled()) {
      return sendError(res, 503, 'EMBER_REALTIME_NOT_CONFIGURED', 'Ember Realtime is not configured on the server.');
    }
    const sdp = (await requestText(req)).trim();
    if (!sdp.startsWith('v=0') || sdp.length > EMBER_MAX_SDP_LENGTH) {
      return sendError(res, 400, 'EMBER_REALTIME_INVALID_SDP', 'The realtime audio offer is invalid.');
    }
    if (rateLimited(userId, 'realtime')) {
      return sendError(res, 429, 'EMBER_REALTIME_RATE_LIMITED', 'Too many realtime sessions. Please try again later.');
    }

    const studioContext: EmberStudioContext = {
      genre: String(req.query?.genre || '').slice(0, 100),
      subgenre: String(req.query?.subgenre || '').slice(0, 100),
      mood: String(req.query?.mood || '').slice(0, 100),
      bpm: Number(req.query?.bpm) || undefined,
      keySignature: String(req.query?.keySignature || '').slice(0, 40),
      hasAudio: String(req.query?.hasAudio || '') === 'true'
    };
    try {
      const answer = await EmberService.openRealtimeSession({ sdp, userId, studioContext });
      res.setHeader('Content-Type', 'application/sdp');
      return res.status(200).send(answer);
    } catch (error) {
      return sendServiceError(res, error, 'EMBER_REALTIME_UPSTREAM_ERROR', 'Ember Realtime is temporarily unavailable.');
    }
  }

  res.setHeader('Allow', action === 'config' ? 'GET' : 'POST');
  return sendError(res, 404, 'EMBER_ROUTE_NOT_FOUND', 'Ember route not found.');
}
