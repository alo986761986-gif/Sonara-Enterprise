import { authenticatedVideoUser } from '../../../src/server/video/auth';

export const config = { api: { responseLimit: false } };

function json(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function fail(res: any, status: number, code: string, message: string) {
  return json(res, status, { error: { code, message } });
}

function isMp4(bytes: Buffer) {
  if (bytes.length < 12) return false;
  return bytes.subarray(4, 8).toString('ascii') === 'ftyp';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Metodo non consentito.');
  }

  const user = await authenticatedVideoUser(req);
  if (!user) return fail(res, 401, 'AUTH_REQUIRED', 'Accedi a SONARA per vedere il video.');

  const rawId = String(req.query?.id || '').trim().replace(/\.mp4$/i, '');
  if (!/^[A-Za-z0-9_-]{8,180}$/.test(rawId)) {
    return fail(res, 400, 'VIDEO_FILE_REQUIRED', 'File video non valido.');
  }

  const base = String(process.env.SONARA_MOLAB_VIDEO_URL || '').trim().replace(/\/+$/, '');
  const token = String(process.env.SONARA_MOLAB_VIDEO_TOKEN || '').trim();
  if (!base || !token) {
    return fail(res, 503, 'VIDEO_PROVIDER_NOT_CONFIGURED', 'Il motore Video AI non è configurato.');
  }

  try {
    const upstream = await fetch(`${base}/file/${encodeURIComponent(rawId)}.mp4`, {
      method: 'GET',
      headers: {
        'x-sonara-token': token,
        Accept: 'video/mp4',
        'Cache-Control': 'no-cache'
      },
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000)
    });

    if (!upstream.ok) {
      return fail(res, upstream.status === 404 ? 404 : 502, 'VIDEO_FILE_UNAVAILABLE', `File Video AI non disponibile (HTTP ${upstream.status}).`);
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!isMp4(bytes)) {
      const preview = bytes.subarray(0, 160).toString('utf8').replace(/\s+/g, ' ');
      console.error('[SONARA VIDEO] upstream file is not MP4', { jobId: rawId, contentType: upstream.headers.get('content-type'), preview });
      return fail(res, 502, 'VIDEO_FILE_NOT_MP4', 'Il motore Video AI non ha restituito un MP4 valido.');
    }

    res.status(200);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Content-Disposition', `inline; filename="sonara-${rawId}.mp4"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'HEAD') return res.end();
    return res.send(bytes);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error('[SONARA VIDEO] MP4 proxy failure', { jobId: rawId, message });
    return fail(res, 502, 'VIDEO_FILE_PROXY_FAILED', message || 'Download MP4 non riuscito.');
  }
}
