import runtime from './sonara-music-taxonomy-lock-router.mjs';
import { analyzeAudioCandidate, rankQualityReports } from './sonara-audio-quality-engine.mjs';
export { SonaraJobState } from './sonara-music-taxonomy-lock-router.mjs';

const VERSION = 'sonara-quality-gate-v2';
const RELEASE_STANDARD = 'sonara-release-standard-v1';
const MIN_RELEASE_SCORE = 82;
const CONTEXT_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/quality-context/';
const REPORT_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/quality-report/';
const TTL = 3 * 60 * 60;
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const JOB_PATH = /^\/api\/music\/job\/([^/]+)$/;

const clean = value => String(value ?? '').trim();
const cleanUrl = value => clean(value).replace(/\/$/, '');
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;
const molabUrl = env => cleanUrl(env.SONARA_MOLAB_XL_URL || env.MOLAB_ACESTEP_URL || '');

function authHeaders(env, extra = {}) {
  const headers = { ...extra };
  const key = clean(env.ACE_STEP_API_KEY || env.ACESTEP_API_KEY);
  if (key) {
    headers.Authorization = `Bearer ${key}`;
    headers['X-API-Key'] = key;
  }
  return headers;
}

function directAudioFetch(baseUrl, env) {
  return async (input, init = {}) => {
    try {
      const inputUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(inputUrl, 'https://api.sonaraenterprise.com');
      if ((url.hostname === 'api.sonaraenterprise.com' || url.hostname === 'molab.sonaraenterprise.com') && (url.pathname === '/api/molab/audio' || url.pathname === '/v1/audio')) {
        const path = clean(url.searchParams.get('path'));
        if (path) {
          const headers = new Headers(init.headers || {});
          for (const [key, value] of Object.entries(authHeaders(env))) if (!headers.has(key)) headers.set(key, value);
          return fetch(`${baseUrl}/v1/audio?path=${encodeURIComponent(path)}`, { ...init, headers });
        }
      }
    } catch {}
    return fetch(input, init);
  };
}

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
      selectedInstruments: Array.isArray(body.selectedInstruments) ? body.selectedInstruments.map(clean).filter(Boolean) : [],
      requestedAt: Date.now()
    };
  } catch {
    return null;
  }
}

function extractJobId(data) {
  const candidates = [data?.jobId, data?.job_id, data?.id, data?.data?.jobId, data?.data?.job_id, data?.data?.id, data?.metadata?.jobId];
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

function releaseDecision(report) {
  const reasons = [];
  if (!report) reasons.push('missing-quality-report');
  if (report && report.measuredFromRealWav !== true) reasons.push('not-measured-from-real-wav');
  if (!Number.isFinite(Number(report?.qualityScore)) || Number(report?.qualityScore) < MIN_RELEASE_SCORE) reasons.push('quality-score-below-release-standard');
  if (report?.bpmPassed === false) reasons.push('bpm-lock-not-verified');
  if (Number.isFinite(Number(report?.clippingRatio)) && Number(report.clippingRatio) > 0.0005) reasons.push('excessive-clipping');
  if (Number.isFinite(Number(report?.silenceRatio)) && Number(report.silenceRatio) > 0.28) reasons.push('excessive-silence');
  if (Number.isFinite(Number(report?.dcOffset)) && Math.abs(Number(report.dcOffset)) > 0.02) reasons.push('dc-offset');
  if (clean(report?.error)) reasons.push('analysis-error');
  return {
    version: RELEASE_STANDARD,
    minimumQualityScore: MIN_RELEASE_SCORE,
    publishable: reasons.length === 0,
    autoRepairRecommended: reasons.length > 0,
    reasons
  };
}

function withRankedCandidates(data, rankedCandidates, reports, context) {
  const bestReport = reports[0] || null;
  const sonaraReleaseGate = releaseDecision(bestReport);
  const quality = {
    engine: VERSION,
    releaseStandard: RELEASE_STANDARD,
    measuredFromRealWav: reports.some(report => report.measuredFromRealWav === true),
    requestedBpm: context?.bpm ?? null,
    requestedKey: context?.key || null,
    requestedInstruments: context?.selectedInstruments || [],
    bestScore: bestReport?.qualityScore ?? null,
    bestDetectedBpm: bestReport?.detectedBpm ?? null,
    bpmVerified: bestReport?.bpmPassed === true,
    keyVerified: bestReport?.keyComparable ? bestReport?.keyPassed === true : null,
    candidateCount: reports.length,
    releaseGate: sonaraReleaseGate,
    reports
  };

  const next = { ...data, sonaraQualityJudge: quality, sonaraReleaseGate };
  if (Array.isArray(data?.candidates)) next.candidates = rankedCandidates;
  else if (Array.isArray(data?.outputs)) next.outputs = rankedCandidates;
  else if (data?.data && typeof data.data === 'object') {
    next.data = { ...data.data, sonaraQualityJudge: quality, sonaraReleaseGate };
    if (Array.isArray(data.data.candidates)) next.data.candidates = rankedCandidates;
    else if (Array.isArray(data.data.outputs)) next.data.outputs = rankedCandidates;
  }
  next.metadata = {
    ...(data?.metadata || {}),
    sonaraQualityJudge: quality,
    sonaraReleaseGate,
    recommendedCandidate: bestReport?.candidateIndex ?? 0,
    autoRepairRecommended: sonaraReleaseGate.autoRepairRecommended
  };
  return next;
}

async function analyzeCompletedJob(data, jobId, context, env) {
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

  const baseUrl = molabUrl(env);
  const audioFetch = baseUrl ? directAudioFetch(baseUrl, env) : fetch;
  const analysis = await Promise.all(candidates.slice(0, 4).map(async (candidate, index) => {
    const url = audioUrl(candidate);
    if (!url) return null;
    try {
      const report = await analyzeAudioCandidate(url, { bpm: context?.bpm, key: context?.key }, audioFetch);
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
    headers.set('x-sonara-release-standard', RELEASE_STANDARD);
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
            sonaraReleaseStandard: RELEASE_STANDARD,
            qualityJudgeWillAnalyzeRealWav: true,
            requestedBpmForVerification: generationContext.bpm,
            requestedKeyForVerification: generationContext.key || null,
            requestedInstruments: generationContext.selectedInstruments
          }
        };
      });
      return response;
    }

    const match = url.pathname.match(JOB_PATH);
    if (request.method === 'GET' && match && response.ok) {
      const jobId = decodeURIComponent(match[1]);
      const context = await cacheGet(CONTEXT_PREFIX, jobId);
      return transformJsonResponse(response, data => analyzeCompletedJob(data, jobId, context, env));
    }

    if (response.ok && ['/api/health', '/api/engine/ready', '/api/molab/ready'].includes(url.pathname)) {
      return transformJsonResponse(response, data => ({
        ...data,
        audioQualityJudge: VERSION,
        releaseStandard: RELEASE_STANDARD,
        minimumReleaseScore: MIN_RELEASE_SCORE,
        actualWavAnalysis: true,
        actualBpmVerification: true,
        automaticCandidateRanking: true,
        automaticReleaseDecision: true,
        automaticRepairRecommendation: true,
        clippingAndSilenceGate: true,
        dynamicsGate: true,
        approximateKeyVerification: true
      }));
    }

    return response;
  }
};
