import { Request, Response, Router } from 'express';
import { requireSonaraAuthentication } from './auth';
import { EmberAgentError, EmberAgentService } from '../services/EmberAgentService';
import { EmberMessageRequest, EmberStudioContext } from '../types/ember';

const router = Router();
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

interface RateLimitEntry {
  count: number;
  windowStartedAt: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, allowed: string[]): boolean =>
  Object.keys(value).every(key => allowed.includes(key));

const validOptionalString = (value: unknown, maximum: number): value is string | undefined =>
  value === undefined || (typeof value === 'string' && value.length <= maximum);

function parseStudioContext(value: unknown): EmberStudioContext | undefined | null {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) return null;
  const allowed = ['prompt', 'genre', 'subgenre', 'mood', 'bpm', 'currentJobId', 'hasAudio', 'recommendedEqPresetId'];
  if (!hasOnlyKeys(value, allowed)) return null;

  if (!validOptionalString(value.prompt, 2_000) ||
      !validOptionalString(value.genre, 80) ||
      !validOptionalString(value.subgenre, 80) ||
      !validOptionalString(value.mood, 80) ||
      !validOptionalString(value.currentJobId, 128) ||
      !validOptionalString(value.recommendedEqPresetId, 80)) {
    return null;
  }
  if (value.currentJobId !== undefined && !JOB_ID_PATTERN.test(value.currentJobId)) return null;
  if (value.bpm !== undefined && (typeof value.bpm !== 'number' || !Number.isFinite(value.bpm) || value.bpm < 30 || value.bpm > 300)) {
    return null;
  }
  if (value.hasAudio !== undefined && typeof value.hasAudio !== 'boolean') return null;

  return {
    prompt: value.prompt,
    genre: value.genre,
    subgenre: value.subgenre,
    mood: value.mood,
    bpm: value.bpm,
    currentJobId: value.currentJobId,
    hasAudio: value.hasAudio,
    recommendedEqPresetId: value.recommendedEqPresetId
  };
}

function parseMessageRequest(value: unknown): EmberMessageRequest | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ['message', 'studioContext'])) return null;
  if (typeof value.message !== 'string') return null;
  const message = value.message.trim();
  if (!message || message.length > 4_000) return null;
  const studioContext = parseStudioContext(value.studioContext);
  if (studioContext === null) return null;
  return { message, studioContext };
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

function sendError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

router.post(
  '/conversations/:conversationId/messages',
  requireSonaraAuthentication,
  async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');

    if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
      return sendError(res, 403, 'EMBER_CROSS_SITE_REJECTED', 'Cross-site Ember requests are not allowed.');
    }
    if (!req.is('application/json')) {
      return sendError(res, 400, 'EMBER_INVALID_REQUEST', 'Ember requests must use application/json.');
    }

    const userId = typeof res.locals.sonaraUser?.sub === 'string' ? res.locals.sonaraUser.sub : '';
    if (!userId) {
      return sendError(res, 401, 'AUTH_SESSION_REQUIRED', 'An authenticated Sonara session is required.');
    }

    const conversationId = req.params.conversationId;
    if (!CONVERSATION_ID_PATTERN.test(conversationId)) {
      return sendError(res, 400, 'EMBER_INVALID_REQUEST', 'Conversation ID is invalid.');
    }

    const payload = parseMessageRequest(req.body);
    if (!payload) {
      return sendError(res, 400, 'EMBER_INVALID_REQUEST', 'Ember request data is invalid.');
    }
    if (isRateLimited(userId)) {
      return sendError(res, 429, 'EMBER_RATE_LIMITED', 'Too many Ember messages. Please try again later.');
    }

    try {
      const result = await EmberAgentService.respond({
        userId,
        conversationId,
        message: payload.message,
        studioContext: payload.studioContext || {}
      });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof EmberAgentError) {
        if (error.code === 'EMBER_NOT_CONFIGURED') {
          return sendError(res, 503, error.code, 'Ember AI is not configured on this server.');
        }
        if (error.code === 'EMBER_TOOL_LIMIT_REACHED') {
          return sendError(res, 502, error.code, 'Ember reached its read-only tool limit. Please try a simpler request.');
        }
        return sendError(res, 502, 'EMBER_UPSTREAM_ERROR', 'Ember is temporarily unavailable.');
      }
      console.error('[EMBER] Unexpected route failure.');
      return sendError(res, 500, 'EMBER_INTERNAL_ERROR', 'Ember could not process this request.');
    }
  }
);

export default router;
