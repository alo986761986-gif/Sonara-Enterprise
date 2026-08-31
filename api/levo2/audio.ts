const DEFAULT_LEVO2_URL = 'https://symbols-readily-boolean-personalized.trycloudflare.com';

export const config = { maxDuration: 60 };

function queryValue(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const audioPath = queryValue(req.query?.path).trim();
  if (!audioPath.startsWith('/audio/') || audioPath.includes('..')) {
    return res.status(400).json({ error: 'Invalid LeVo 2 audio path.' });
  }

  const baseUrl = String(process.env.LEVO2_RESEARCH_API_URL || DEFAULT_LEVO2_URL).replace(/\/$/, '');
  const apiKey = String(process.env.LEVO2_RESEARCH_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({ error: 'LeVo 2 preview credential is not configured.' });
  }

  try {
    const upstream = await fetch(`${baseUrl}${audioPath}`, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'audio/*,*/*;q=0.8'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000)
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({
        error: `LeVo 2 audio upstream HTTP ${upstream.status}`,
        detail: detail.slice(0, 300)
      });
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/flac');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('X-Sonara-Music-Provider', 'levo2-research');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(bytes);
  } catch (error) {
    return res.status(502).json({
      error: 'SONARA cannot reach the LeVo 2 research audio worker.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}
