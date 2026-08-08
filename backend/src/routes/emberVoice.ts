import { Request, Response, Router } from 'express';
import { requireSonaraAuthentication } from './auth';
import { EMBER_VOICE_MAX_TEXT_LENGTH, EmberVoiceError, EmberVoiceService } from '../services/EmberVoiceService';
import { EmberVoiceConfig, EmberVoiceSpeechRequest } from '../types/emberVoice';

const router = Router();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;

interface RateLimitEntry {
  count: number;
  windowStartedAt: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function getConfig(): EmberVoiceConfig {
  return {
    enabled: EmberVoiceService.isEnabled(),
    providerConfigured: EmberVoiceService.isProviderConfigured(),
    capabilities: { speech: true, realtime: false }
  };
}

function sendError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (entry.windowStartedAt + RATE_LIMIT_WINDOW_MS <= now) rateLimits.delete(key);
  }

  const current = rateLimits.get(userId);
  if (!current || current.windowStartedAt + RATE_LIMIT_WINDOW_MS <= now) {
    rateLimits.set(userId, { count: 1, windowStartedAt: now });
    return false;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) return true;
  current.count += 1;
  return false;
}

function parseSpeechRequest(value: unknown): EmberVoiceSpeechRequest | null {
  if (!isPlainObject(value) || Object.keys(value).some(key => key !== 'text') || typeof value.text !== 'string') return null;
  const text = value.text.trim();
  if (!text || text.length > EMBER_VOICE_MAX_TEXT_LENGTH) return null;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F<>]/.test(text)) return null;
  return { text };
}

function rejectsCrossSiteRequest(req: Request): boolean {
  return String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site';
}

router.get('/config', requireSonaraAuthentication, (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  if (rejectsCrossSiteRequest(req)) {
    return sendError(res, 403, 'EMBER_CROSS_SITE_REJECTED', 'Cross-site Ember requests are not allowed.');
  }
  return res.status(200).json(getConfig());
});

router.post('/speech', requireSonaraAuthentication, async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  if (rejectsCrossSiteRequest(req)) {
    return sendError(res, 403, 'EMBER_CROSS_SITE_REJECTED', 'Cross-site Ember requests are not allowed.');
  }
  if (!req.is('application/json')) {
    return sendError(res, 400, 'EMBER_VOICE_INVALID_REQUEST', 'Ember Voice requests must use application/json.');
  }

  const userId = typeof res.locals.sonaraUser?.sub === 'string' ? res.locals.sonaraUser.sub : '';
  if (!userId) {
    return sendError(res, 401, 'AUTH_SESSION_REQUIRED', 'An authenticated Sonara session is required.');
  }
  const payload = parseSpeechRequest(req.body);
  if (!payload) {
    return sendError(res, 400, 'EMBER_VOICE_INVALID_REQUEST', 'Ember Voice request data is invalid.');
  }
  if (!EmberVoiceService.isEnabled()) {
    return sendError(res, 503, 'EMBER_VOICE_DISABLED', 'Ember Voice is not enabled on this server.');
  }
  if (!EmberVoiceService.isProviderConfigured()) {
    return sendError(res, 503, 'EMBER_VOICE_NOT_CONFIGURED', 'Ember Voice is not configured on this server.');
  }
  if (isRateLimited(userId)) {
    return sendError(res, 429, 'EMBER_VOICE_RATE_LIMITED', 'Too many Ember Voice requests. Please try again later.');
  }

  try {
    const audio = await EmberVoiceService.synthesize(payload.text);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    res.setHeader('Content-Disposition', 'inline; filename="ember.mp3"');
    return res.status(200).send(audio);
  } catch (error) {
    if (error instanceof EmberVoiceError) {
      return sendError(res, 502, 'EMBER_VOICE_UPSTREAM_ERROR', 'Ember Voice is temporarily unavailable.');
    }
    console.error('[EMBER VOICE] Unexpected route failure.');
    return sendError(res, 500, 'EMBER_VOICE_INTERNAL_ERROR', 'Ember Voice could not create audio.');
  }
});

export default router;