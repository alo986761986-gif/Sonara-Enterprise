export const config = { maxDuration: 30 };

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const response = await fetch('https://api.sonaraenterprise.com/api/health', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000)
    });
    const text = await response.text();
    let engine: unknown = text;
    try { engine = JSON.parse(text); } catch {}
    return res.status(response.status).json({ ok: response.ok, engine });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
