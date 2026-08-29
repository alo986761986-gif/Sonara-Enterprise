import { createHash } from 'node:crypto';

const DEFAULT_ENGINE_URL = 'https://api.sonaraenterprise.com';
const TOKEN_CACHE_MS = 60_000;
const MAX_TOKEN_CACHE_ENTRIES = 256;
const verifiedTokenCache = new Map<string, number>();

export const config = { maxDuration: 180 };

function queryValue(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function headerValue(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function bearerToken(req: any): string {
  return headerValue(req.headers?.authorization).match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function rememberVerifiedToken(fingerprint: string): void {
  if (verifiedTokenCache.size >= MAX_TOKEN_CACHE_ENTRIES) {
    const now = Date.now();
    for (const [key, expiresAt] of verifiedTokenCache) {
      if (expiresAt <= now) verifiedTokenCache.delete(key);
    }
    while (verifiedTokenCache.size >= MAX_TOKEN_CACHE_ENTRIES) {
      const oldest = verifiedTokenCache.keys().next().value as string | undefined;
      if (!oldest) break;
      verifiedTokenCache.delete(oldest);
    }
  }
  verifiedTokenCache.set(fingerprint, Date.now() + TOKEN_CACHE_MS);
}

async function firebaseTokenValid(token: string): Promise<boolean> {
  if (!token) return false;
  const fingerprint = tokenFingerprint(token);
  const cachedUntil = verifiedTokenCache.get(fingerprint) || 0;
  if (cachedUntil > Date.now()) return true;
  if (cachedUntil) verifiedTokenCache.delete(fingerprint);

  const apiKey = String(process.env.VITE_FIREBASE_API_KEY || process.env.SONARA_FIREBASE_API_KEY || '').trim();
  if (!apiKey) return false;

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
        signal: AbortSignal.timeout(10_000)
      }
    );
    if (!response.ok) return false;
    const payload = await response.json() as { users?: Array<{ localId?: string }> };
    const valid = Boolean(payload.users?.[0]?.localId);
    if (valid) rememberVerifiedToken(fingerprint);
    return valid;
  } catch {
    return false;
  }
}

function sendJson(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Sonara-Job-Bridge', 'vercel');
  return res.status(status).json(body);
}

function validJobId(jobId: string): boolean {
  return /^(?:d6_|d9pair_|d16pair_)[A-Za-z0-9-]{16,}$/.test(jobId);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const internalSecret = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  const suppliedSecret = headerValue(req.headers?.['x-sonara-internal-secret']).trim();
  const internalRequest = Boolean(internalSecret && suppliedSecret === internalSecret);
  const authenticatedClient = internalRequest ? true : await firebaseTokenValid(bearerToken(req));
  if (!authenticatedClient) {
    return sendJson(res, 401, {
      status: 'FAILED',
      progress: 0,
      error: 'Accedi con un account SONARA valido per controllare la generazione.'
    });
  }

  const jobId = queryValue(req.query?.jobId).trim();
  if (!validJobId(jobId)) {
    return sendJson(res, 400, {
      jobId,
      status: 'FAILED',
      progress: 0,
      error: 'Invalid SONARA generation job ID.'
    });
  }

  const engineBaseUrl = String(process.env.SONARA_ENGINE_API_URL || DEFAULT_ENGINE_URL).replace(/\/$/, '');
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Sonara-Job-Bridge': 'vercel'
  };
  if (internalSecret) headers['X-Sonara-Internal-Secret'] = internalSecret;

  try {
    const engineResponse = await fetch(
      `${engineBaseUrl}/api/music/job/${encodeURIComponent(jobId)}`,
      {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(150_000)
      }
    );

    const raw = await engineResponse.text();
    try {
      const payload = raw ? JSON.parse(raw) : {};
      console.info('[SONARA JOB RESULT]', JSON.stringify({
        jobId,
        upstreamStatus: engineResponse.status,
        status: String(payload?.status || payload?.job?.status || payload?.data?.status || ''),
        progress: Number(payload?.progress ?? payload?.job?.progress ?? payload?.data?.progress ?? 0),
        performanceProfile: String(payload?.metadata?.performanceProfile || payload?.job?.metadata?.performanceProfile || payload?.data?.metadata?.performanceProfile || ''),
        error: String(payload?.error?.message || payload?.error || payload?.message || '').slice(0, 500)
      }));
    } catch {
      console.warn('[SONARA JOB RESULT]', JSON.stringify({ jobId, upstreamStatus: engineResponse.status, invalidJson: true }));
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', engineResponse.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Sonara-Job-Bridge', 'vercel');
    res.setHeader('X-Sonara-Job-Region', 'iad1');
    return res.status(engineResponse.status).send(raw);
  } catch (error) {
    console.error('[SONARA JOB BRIDGE]', error instanceof Error ? error.message : String(error));
    return sendJson(res, 502, {
      jobId,
      status: 'PROCESSING',
      progress: 15,
      retryable: true,
      metadata: {
        engine: 'SONARA',
        currentStage: 'SONARA: reconnecting to the generation session'
      }
    });
  }
}
