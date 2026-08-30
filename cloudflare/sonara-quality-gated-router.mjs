import runtime from './sonara-music-taxonomy-lock-router.mjs';
import { analyzeAudioCandidate, rankQualityReports } from './sonara-audio-quality-engine.mjs';
export { SonaraJobState } from './sonara-music-taxonomy-lock-router.mjs';

const VERSION = 'sonara-quality-gate-v1';
const CONTEXT_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/quality-context/';
const REPORT_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/quality-report/';
const TTL = 3 * 60 * 60;
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const JOB_PATH = /^\/api\/music\/job\/([^/]+)$/;

const clean = value => String(value ?? '').trim();
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;

function cacheRequest(prefix, id) {
  return new Request(`${prefix}${encodeURIComponent(String(id))}`);
}

async function cachePut(prefix, id, value) {
  try {
    if (typeof caches === 'undefined' || !caches.default || !id) return;
    await caches.default.put(cacheRequest(prefix, id), new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${TTL}` }
    }));
  } catch {}
}

async function cacheGet(prefix, id) {
  try {
    if (typeof caches === 'undefined' || !caches.default || !id) return null;
    const response = await caches.default.match(cacheRequest(prefix, id));
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

async function requestContext(request) {
  if (request.method !== 'POST') return null;
  const url = new URL(request.url);
  if (!GENERATE_PATHS.has(url.pathname)) return null;
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return null;
  try {
    const body = await request.clone().json();
    return {
      bpm: numeric(body.sonaraExactRequestedBpm ?? body.requestedBpm ?? body.targetBpm ?? body.bpm),
      key: clean(body.key || body.key_scale),
      family: clean(body.sonaraSelectedFamily || body.genreFamily || body.genre_family),
      genre: clean(body.sonaraSelectedGenre || body.genre),
      subgenre: clean(body.sonaraSelectedSubgenre || body.subgenre),
      atmosphere: clean(body.sonaraSelectedMood || body.mood || body.atmosphere),
      vocalMode: clean(body.vocalMode || body.vocal_mode),
      requestedAt: Date.now()
    };
  } catch {
    return null;
  }
}

function extractJobId(data) {
  const candidates = [
    data?.jobId,
    data?.job_id,
    data?.id,
    data?.data?.jobId,
    data?.data?.job_id,
    data?.data?.id,
    data?.metadata?.jobId
  ];
  return clean(candidates.find(Boolean));
}

function isComplete(data) {
  const status = clean(data?.status || data?.state || data?.data?.status || data?.data?.state).toLowerCase();
  return ['completed', 'complete', 'success', 'succeeded', 'done', 'finished', 'ready'].includes(status);
}

function candidateArray(data) {
  for (const value of [data?.candidates, data?.outputs, data?.data?.candidates, data?.data?.outputs, data?.result?.candidates]) {
    if (Array.isArray(value) && value.length) return value;
  }
  return [];
}

function audioUrl(candidate) {
  if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return candidate;
  if (!candidate || typeof candidate !== 'object') return '';
  for (const value of [candidate.audioUrl, candidate.audio_url, candidate.url, candidate.downloadUrl, candidate.download_url, candidate.file]) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  }
  return '';
}

function withRankedCandidates(data, rankedCandidates, reports, context) {
  const quality = {
    engine: VERSION,
    measuredFromRealWav: reports.some(report => report.measuredFromRealWav === true),
    requestedBpm: context?.bpm ?? null,
    requestedKey: context?.key || null,
    bestScore: reports[0]?.qualityScore ?? null,
    bestDetectedBpm: reports[0]?.detectedBpm ?? null,
    bpmVerified: reports[0]?.bpmPassed === true,
    keyVerified: reports[0]?.keyComparable ? reports[0]?.keyPassed === true : null,
    candidateCount: reports.length,
    reports
  };

  const next = { ...data, sonaraQualityJudge: quality };
  if (Array.isArray(data?.candidates)) next.candidates = rankedCandidates;
  else if (Array.isArray(data?.outputs)) next.outputs = rankedCandidates;
  else if (data?.data && typeof data.data === 'object') {
    next.data = { ...data.data, sonaraQualityJudge: quality };
    if (Array.isArray(data.data.candidates)) next.data.candidates = rankedCandidates;
    else if (Array.isArray(data.data.outputs)) next.data.outputs = rankedCandidates;
  }
  next.metadata = { ...(data?.metadata || {}), sonaraQualityJudge: quality, recommendedCandidate: reports[0]?.candidateIndex ?? 0 };
  return next;
}

async function analyzeCompletedJob(data, jobId, context) {
  if (!isComplete(data)) return data;
  const candidates = candidateArray(data);
  if (!candidates.length) return data;

  const cached = await cacheGet(REPORT_PREFIX, jobId);
  if (cached?.reports?.length) {
    const byIndex = new Map(cached.reports.map(report => [report.candidateIndex, report]));
    const ranked = [...candidates].sort((a, b) => {
      const ai = candidates.indexOf(a);
      const bi = candidates.indexOf(b);
      const ar = byIndex.get(ai);
      const br = byIndex.get(bi);
      if (!ar && !br) return 0;
      if (!ar) return 1;
      if (!br) return -1;
      return rankQualityReports([ar, br])[0] === ar ? -1 : 1;
    });
    return withRankedCandidates(data, ranked, cached.reports, context);
  }

  const analysis = await Promise.all(candidates.slice(0, 4).map(async (candidate, index) => {
    const url = audioUrl(candidate);
    if (!url) return null;
    try {
      const report = await analyzeAudioCandidate(url, { bpm: context?.bpm, key: context?.key });
      return { ...report, candidateIndex: index, audioUrl: url };
    } catch (error) {
      return {
        analyzer: VERSION,
        candidateIndex: index,
        audioUrl: url,
        measuredFromRealWav: false,
        qualityScore: 0,
        qualityGatePassed: false,
        bpmPassed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }));

  const usable = analysis.filter(Boolean);
  if (!usable.length) return data;
  const rankedReports = rankQualityReports(usable);
  const order = rankedReports.map(report => report.candidateIndex);
  const rankedCandidates = order.map(index => candidates[index]).filter(Boolean);
  for (let i = 0; i < candidates.length; i += 1) if (!order.includes(i)) rankedCandidates.push(candidates[i]);

  await cachePut(REPORT_PREFIX, jobId, { reports: rankedReports, createdAt: Date.now() });
  return withRankedCandidates(data, rankedCandidates, rankedReports, context);
}

async function transformJsonResponse(response, transform) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) return response;
  try {
    const data = await response.clone().json();
    const next = await transform(data);
    if (next === data) return response;
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json; charset=UTF-8');
    headers.set('x-sonara-quality-gate', VERSION);
    return new Response(JSON.stringify(next), { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const generationContext = await requestContext(request);
    let response = await runtime.fetch(request, env, ctx);

    if (generationContext && response.ok) {
      response = await transformJsonResponse(response, async data => {
        const jobId = extractJobId(data);
        if (jobId) await cachePut(CONTEXT_PREFIX, jobId, generationContext);
        return {
          ...data,
          metadata: {
            ...(data?.metadata || {}),
            sonaraQualityGate: VERSION,
            qualityJudgeWillAnalyzeRealWav: true,
            requestedBpmForVerification: generationContext.bpm,
            requestedKeyForVerification: generationContext.key || null
          }
        };
      });
      return response;
    }

    const match = url.pathname.match(JOB_PATH);
    if (request.method === 'GET' && match && response.ok) {
      const jobId = decodeURIComponent(match[1]);
      const context = await cacheGet(CONTEXT_PREFIX, jobId);
      return transformJsonResponse(response, data => analyzeCompletedJob(data, jobId, context));
    }

    if (response.ok && ['/api/health', '/api/engine/ready', '/api/molab/ready'].includes(url.pathname)) {
      return transformJsonResponse(response, data => ({
        ...data,
        audioQualityJudge: VERSION,
        actualWavAnalysis: true,
        actualBpmVerification: true,
        automaticCandidateRanking: true,
        clippingAndSilenceGate: true,
        dynamicsGate: true,
        approximateKeyVerification: true
      }));
    }

    return response;
  }
};
