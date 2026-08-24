import { Request, Response, Router } from 'express';
import { AuthenticatedRequest, verifyFirebaseToken } from '../auth/FirebaseAuth';
import {
  EMBER_MAX_MESSAGE_LENGTH,
  EMBER_MAX_SPEECH_LENGTH,
  EmberConversationMessage,
  EmberService,
  EmberServiceError,
  EmberStudioContext
} from '../services/EmberService';

const router = Router();
const RATE_WINDOW_MS = 5 * 60 * 1000;
const limits = new Map<string, { startedAt: number; chat: number; speech: number }>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rejectCrossSite(req: Request): boolean {
  return String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site';
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

function sendError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

router.get('/config', verifyFirebaseToken, (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  if (rejectCrossSite(req)) return sendError(res, 403, 'EMBER_CROSS_SITE_REJECTED', 'Cross-site requests are not allowed.');
  return res.json({
    chatEnabled: EmberService.isConfigured(),
    voiceEnabled: EmberService.voiceEnabled(),
    voice: String(process.env.EMBER_TTS_VOICE || '').trim() || 'alloy'
  });
});

router.post('/chat', verifyFirebaseToken, async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  if (rejectCrossSite(req)) return sendError(res, 403, 'EMBER_CROSS_SITE_REJECTED', 'Cross-site requests are not allowed.');
  if (!req.is('application/json') || !isPlainObject(req.body)) {
    return sendError(res, 400, 'EMBER_INVALID_REQUEST', 'Invalid Ember request.');
  }

  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  const history = Array.isArray(req.body.history) ? req.body.history : [];
  const studioContext = isPlainObject(req.body.studioContext) ? req.body.studioContext : {};
  if (!message || message.length > EMBER_MAX_MESSAGE_LENGTH) {
    return sendError(res, 400, 'EMBER_INVALID_MESSAGE', 'The message is empty or too long.');
  }
  if (rateLimited(req.user!.uid, 'chat')) {
    return sendError(res, 429, 'EMBER_RATE_LIMITED', 'Too many Ember requests. Please try again later.');
  }

  try {
    const reply = await EmberService.chat({
      message,
      history: history as EmberConversationMessage[],
      studioContext: studioContext as EmberStudioContext
    });
    return res.json({ reply });
  } catch (error) {
    if (error instanceof EmberServiceError && error.code === 'NOT_CONFIGURED') {
      return sendError(res, 503, 'EMBER_NOT_CONFIGURED', 'Ember API is not configured on the server.');
    }
    return sendError(res, 502, 'EMBER_UPSTREAM_ERROR', 'Ember is temporarily unavailable.');
  }
});

router.post('/speech', verifyFirebaseToken, async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  if (rejectCrossSite(req)) return sendError(res, 403, 'EMBER_CROSS_SITE_REJECTED', 'Cross-site requests are not allowed.');
  if (!req.is('application/json') || !isPlainObject(req.body)) {
    return sendError(res, 400, 'EMBER_VOICE_INVALID_REQUEST', 'Invalid Ember Voice request.');
  }

  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!text || text.length > EMBER_MAX_SPEECH_LENGTH || /[\u0000-\u0008\u000B\u000C\u000E-\u001F<>]/.test(text)) {
    return sendError(res, 400, 'EMBER_VOICE_INVALID_TEXT', 'The speech text is invalid or too long.');
  }
  if (!EmberService.voiceEnabled()) {
    return sendError(res, 503, 'EMBER_VOICE_NOT_CONFIGURED', 'Ember Voice is not configured on the server.');
  }
  if (rateLimited(req.user!.uid, 'speech')) {
    return sendError(res, 429, 'EMBER_VOICE_RATE_LIMITED', 'Too many voice requests. Please try again later.');
  }

  try {
    const audio = await EmberService.speak(text);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(audio.length));
    res.setHeader('Content-Disposition', 'inline; filename="ember.mp3"');
    return res.send(audio);
  } catch {
    return sendError(res, 502, 'EMBER_VOICE_UPSTREAM_ERROR', 'Ember Voice is temporarily unavailable.');
  }
});

export default router;
