const DEFAULT_ENGINE_URL = 'https://api.sonaraenterprise.com';

export const config = { maxDuration: 30 };

function queryValue(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function sendJson(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Sonara-Job-Bridge', 'vercel');
  return res.status(status).json(body);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const jobId = queryValue(req.query?.jobId).trim();
  if (!/^d6_[A-Za-z0-9-]{16,}$/.test(jobId)) {
    return sendJson(res, 400, {
      jobId,
      status: 'FAILED',
      progress: 0,
      error: 'Invalid SONARA generation job ID.'
    });
  }

  const engineBaseUrl = String(process.env.SONARA_ENGINE_API_URL || DEFAULT_ENGINE_URL).replace(/\/$/, '');
  const headers: Record<string, string> = { Accept: 'application/json' };
  const internalSecret = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  if (internalSecret) headers['X-Sonara-Internal-Secret'] = internalSecret;

  try {
    const engineResponse = await fetch(
      `${engineBaseUrl}/api/music/job/${encodeURIComponent(jobId)}`,
      {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(25_000)
      }
    );

    const raw = await engineResponse.text();
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', engineResponse.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Sonara-Job-Bridge', 'vercel');
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
