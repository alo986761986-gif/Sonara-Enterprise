import {
  EMBER_MAX_MESSAGE_LENGTH,
  EMBER_MAX_SPEECH_LENGTH,
  EmberConversationMessage,
  EmberService,
  EmberServiceError,
  EmberStudioContext
} from '../../backend/src/services/EmberService';

const RATE_WINDOW_MS = 5 * 60 * 1000;
const limits = new Map<string, { startedAt: number; chat: number; speech: number }>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sendError(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
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

function rateLimited(userId: string, kind: 'chat' | 'speech'): boolean {
  const now = Date.now();
  const current = limits.get(userId);
  const entry = !current || current.startedAt + RATE_WINDOW_MS <= now
    ? { startedAt: now, chat: 0, speech: 0 }
    : current;
  const maximum = kind === 'chat' ? 20 : 10;
  if (entry[kind] >= maximum) return true;
  entry[kind] += 1;
  limits.set(userId, entry);
  return false;
}

async function authenticatedUserId(req: any): Promise<string | null> {
  const authorization = String(req.headers?.authorization || '');
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  const firebaseApiKey = String(
    process.env.VITE_FIREBASE_API_KEY || process.env.SONARA_FIREBASE_API_KEY || ''
  ).trim();
  if (!token || !firebaseApiKey) return null;

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

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (String(req.headers?.['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
    return sendError(res, 403, 'EMBER_CROSS_SITE_REJECTED', 'Cross-site requests are not allowed.');
  }

  const userId = await authenticatedUserId(req);
  if (!userId) {
    return sendError(res, 401, 'AUTH_TOKEN_INVALID', 'A valid Firebase session is required.');
  }

  const rawPath = req.query?.path;
  const action = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '');

  if (req.method === 'GET' && action === 'config') {
    return res.status(200).json({
      chatEnabled: EmberService.isConfigured(),
      voiceEnabled: EmberService.voiceEnabled(),
      voice: String(process.env.EMBER_TTS_VOICE || '').trim() || 'alloy'
    });
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
      if (error instanceof EmberServiceError && error.code === 'NOT_CONFIGURED') {
        return sendError(res, 503, 'EMBER_NOT_CONFIGURED', 'Ember API is not configured on the server.');
      }
      return sendError(res, 502, 'EMBER_UPSTREAM_ERROR', 'Ember is temporarily unavailable.');
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
    } catch {
      return sendError(res, 502, 'EMBER_VOICE_UPSTREAM_ERROR', 'Ember Voice is temporarily unavailable.');
    }
  }

  res.setHeader('Allow', action === 'config' ? 'GET' : 'POST');
  return sendError(res, 404, 'EMBER_ROUTE_NOT_FOUND', 'Ember route not found.');
}
