const BENCHMARK_TOKEN = 'sonara-speed-20260824-b0f2da936c7e4f73';
const DEFAULT_ENGINE_URL = 'https://api.sonaraenterprise.com';

export const config = { maxDuration: 180 };

function queryValue(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function benchmarkRequest() {
  const rawPrompt = 'Create a focused fast benchmark club track.';
  const prompt = [
    'USER INTENT',
    rawPrompt,
    'MUSICAL IDENTITY',
    'Family: Electronic / Dance',
    'Genre: House',
    'Subgenre: Tech House',
    'Mood: Energetic',
    'TECHNICAL PARAMETERS',
    'Tempo: exactly 126 BPM',
    'Key: F minor',
    'Duration: exactly 30 seconds',
    'VOCALS',
    'Strictly instrumental: do not generate sung, spoken, whispered or sampled words.'
  ].join('\n');

  return {
    prompt,
    rawPrompt,
    genreFamily: 'Electronic / Dance',
    genre: 'House',
    subgenre: 'Tech House',
    mood: 'Energetic',
    bpm: 126,
    key: 'F minor',
    durationSec: 30,
    duration: 30,
    vocalMode: 'instrumental',
    lyrics: '',
    title: 'SONARA Speed Benchmark',
    outputFormat: 'wav',
    audioQuality: 'lossless',
    engineId: 'sonara_ace_step_v15_modal'
  };
}

async function parseResponse(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (queryValue(req.query?.token) !== BENCHMARK_TOKEN) return res.status(403).json({ error: 'FORBIDDEN' });

  const action = queryValue(req.query?.action).toLowerCase();
  const engineBaseUrl = String(process.env.SONARA_ENGINE_API_URL || DEFAULT_ENGINE_URL).replace(/\/$/, '');
  const internalSecret = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  if (!internalSecret) return res.status(503).json({ error: 'INTERNAL_SECRET_MISSING' });

  try {
    if (action === 'start') {
      const startedAt = Date.now();
      const response = await fetch(`${engineBaseUrl}/api/engine/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sonara-Internal-Secret': internalSecret
        },
        body: JSON.stringify(benchmarkRequest()),
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000)
      });
      const payload = await parseResponse(response);
      return res.status(response.status).json({ startedAt, receivedAt: Date.now(), payload });
    }

    if (action === 'poll') {
      const jobId = queryValue(req.query?.jobId);
      const startedAt = Number(queryValue(req.query?.startedAt));
      if (!/^d6_[A-Za-z0-9-]{16,}$/.test(jobId)) return res.status(400).json({ error: 'INVALID_JOB_ID' });
      const response = await fetch(`${engineBaseUrl}/api/music/job/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Sonara-Internal-Secret': internalSecret,
          'X-Sonara-Job-Bridge': 'vercel'
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(150_000)
      });
      const payload = await parseResponse(response);
      return res.status(response.status).json({
        startedAt,
        checkedAt: Date.now(),
        elapsedMs: Number.isFinite(startedAt) ? Date.now() - startedAt : null,
        payload
      });
    }

    return res.status(400).json({ error: 'INVALID_ACTION' });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : String(error),
      checkedAt: Date.now()
    });
  }
}
