import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-real-music-v2-edge.mjs';
import { buildVocalLyricsV3Body, prepareVocalLyricsV3, VOCAL_LYRICS_DIRECTOR_V3 } from './sonara-vocal-lyrics-director-v3.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-speed-v4.1-quality-ultra-fast';
const STATE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/speed-v4/';
const STATE_TTL = 6 * 60 * 60;
const JOB_RE = /^\/api\/music\/job\/([^/]+)$/;
const GENERATE_PATHS = new Set(['/api/engine/generate', '/api/billing/generate']);
const ASR_TIMEOUT = 180_000;
const QUALITY_STEPS = 6;
const ULTRA_STEPS = 8;

const clean = value => String(value ?? '').trim();
const cleanUrl = value => clean(value).replace(/\/$/, '');
const molabUrl = env => cleanUrl(env.SONARA_MOLAB_XL_URL || env.MOLAB_ACESTEP_URL || '');

function requestedProfile(body = {}) {
  const raw = clean(body.generationProfileV3 || body.renderProfile || body.generationProfile || body.qualityProfile || 'quality').toLowerCase();
  if (['ultra', 'maximum', 'max', 'studio', 'master'].includes(raw)) return 'ultra';
  if (['fast', 'speed', 'preview'].includes(raw)) return 'fast';
  return 'quality';
}

function stateRequest(jobId) {
  return new Request(`${STATE_PREFIX}${encodeURIComponent(jobId)}`);
}

function stateStub(env, jobId) {
  try {
    const ns = env?.SONARA_JOB_STATE;
    if (!ns?.idFromName || !ns?.get) return null;
    return ns.get(ns.idFromName(`speed-v4:${jobId}`));
  } catch { return null; }
}

async function saveState(env, jobId, state) {
  const next = { ...state, updatedAt: Date.now() };
  const stub = stateStub(env, jobId);
  if (stub) {
    try {
      const response = await stub.fetch('https://sonara.internal/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next)
      });
      if (response.ok) return;
    } catch {}
  }
  try {
    await caches.default.put(stateRequest(jobId), new Response(JSON.stringify(next), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${STATE_TTL}` }
    }));
  } catch {}
}

async function loadState(env, jobId) {
  const stub = stateStub(env, jobId);
  if (stub) {
    try {
      const response = await stub.fetch('https://sonara.internal/state', { method: 'GET' });
      if (response.ok) return await response.json();
    } catch {}
  }
  try {
    const response = await caches.default.match(stateRequest(jobId));
    return response ? await response.json() : null;
  } catch { return null; }
}

function authHeaders(env, extra = {}) {
  const headers = { ...extra };
  const key = clean(env.ACE_STEP_API_KEY || env.ACESTEP_API_KEY);
  if (key) {
    headers.Authorization = `Bearer ${key}`;
    headers['X-API-Key'] = key;
  }
  return headers;
}

function jsonResponse(response, data) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=UTF-8');
  headers.set('x-sonara-speed-profile', VERSION);
  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function firstJobId(payload = {}) {
  return clean(payload.jobId || payload.job_id || payload?.job?.jobId || payload?.data?.jobId || payload?.data?.job_id);
}

function statusOf(payload = {}) {
  return clean(payload.status || payload?.job?.status || payload?.data?.status).toUpperCase();
}

function candidateArray(payload = {}) {
  if (Array.isArray(payload.candidates) && payload.candidates.length) return payload.candidates;
  if (Array.isArray(payload.audioUrls) && payload.audioUrls.length) {
    return payload.audioUrls.map((audioUrl, index) => ({ id: index === 0 ? 'A' : `C${index + 1}`, audioUrl }));
  }
  return payload.audioUrl ? [{ id: 'A', audioUrl: payload.audioUrl }] : [];
}

function proxiedPath(audioUrl) {
  try {
    const url = new URL(clean(audioUrl));
    if (url.pathname === '/api/molab/audio' || url.pathname === '/v1/audio') return clean(url.searchParams.get('path'));
  } catch {}
  return '';
}

async function verifyFirstCandidate(env, payload, state) {
  const baseUrl = molabUrl(env);
  const candidate = candidateArray(payload)[0] || null;
  const path = proxiedPath(candidate?.audioUrl || candidate?.url);
  if (!baseUrl || !path || !state?.originalLyrics) return null;
  try {
    const response = await fetch(`${baseUrl}/v1/sonara/transcribe`, {
      method: 'POST',
      headers: authHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify({
        path,
        language: state.language || 'auto',
        expected_lyrics: state.originalLyrics,
        word_timestamps: true
      }),
      signal: AbortSignal.timeout(ASR_TIMEOUT)
    });
    if (!response.ok) return null;
    const raw = await response.json();
    const data = raw?.data || raw || {};
    if (data?.ok === false) return null;
    return {
      available: true,
      score: Number(data.lyric_accuracy ?? data.accuracy ?? 0),
      wordErrorRate: Number(data.word_error_rate ?? data.wer ?? 1),
      transcript: clean(data.transcript),
      missingWords: Array.isArray(data.missing_words) ? data.missing_words : [],
      extraWords: Array.isArray(data.extra_words) ? data.extra_words : [],
      mismatchRanges: Array.isArray(data.mismatch_ranges) ? data.mismatch_ranges : [],
      language: clean(data.language || state.language)
    };
  } catch { return null; }
}

async function runDeferredVerification(env, jobId, payload, state) {
  try {
    const verification = await verifyFirstCandidate(env, payload, state);
    const completed = {
      ...payload,
      lyricVerification: {
        version: VOCAL_LYRICS_DIRECTOR_V3,
        mode: 'deferred-first-candidate',
        available: verification?.available === true,
        bestAccuracy: verification?.available ? verification.score : null,
        bestWordErrorRate: verification?.available ? verification.wordErrorRate : null,
        passed: verification?.available ? verification.score >= 0.94 : null,
        result: verification
      },
      metadata: {
        ...(payload.metadata || {}),
        speedProfile: VERSION,
        lyricVerificationDeferred: true,
        lyricVerificationPending: false,
        lyricVerificationAvailable: verification?.available === true
      }
    };
    await saveState(env, jobId, { ...state, completedPayload: completed, verifying: false, verified: verification?.available === true });
  } catch {
    await saveState(env, jobId, { ...state, verifying: false, verified: false });
  }
}

function speedBody(body, profile) {
  if (profile === 'ultra') {
    return {
      ...body,
      generationProfileV3: 'ultra',
      renderProfile: 'ultra',
      generationProfile: 'ultra',
      qualityProfile: 'ultra',
      candidateCount: 2,
      candidate_count: 2,
      dualFast: true,
      sonaraDirectorBypass: true,
      sonaraAutoRepair: false,
      sonaraSpeedV4: VERSION,
      sonaraFastUltra: true,
      sonaraSpeedInferenceSteps: ULTRA_STEPS,
      sonaraSpeedSampler: 'euler',
      sonaraSpeedExecutionProfile: 'ultra-fast-single-batch',
      sonaraRequestedGenerationProfile: profile,
      sonaraAutomaticCandidateRanking: true,
      sonaraVisibleCandidateTarget: 2,
      sonaraInternalCandidateTarget: 2
    };
  }

  return {
    ...body,
    generationProfileV3: 'fast',
    renderProfile: 'fast',
    generationProfile: 'fast',
    qualityProfile: 'fast',
    candidateCount: 2,
    candidate_count: 2,
    dualFast: true,
    sonaraDirectorBypass: true,
    sonaraRealMusic: false,
    sonara_real_music: false,
    sonaraAutoRepair: false,
    sonaraSpeedV4: VERSION,
    sonaraSpeedInferenceSteps: QUALITY_STEPS,
    sonaraSpeedSampler: 'euler',
    sonaraSpeedExecutionProfile: 'quality-fast-single-batch',
    sonaraRequestedGenerationProfile: profile,
    sonaraAutomaticCandidateRanking: true,
    sonaraVisibleCandidateTarget: 2,
    sonaraInternalCandidateTarget: 2
  };
}

async function prepareGeneration(request, env, ctx) {
  let body;
  try { body = await request.clone().json(); }
  catch { return runtime.fetch(request, env, ctx); }

  const profile = requestedProfile(body);
  let prepared;
  let vocalBody;
  try {
    prepared = prepareVocalLyricsV3(body);
    vocalBody = buildVocalLyricsV3Body(body);
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'FAILED',
      error: error instanceof Error ? error.message : String(error),
      code: 'SONARA_VOCAL_LYRICS_V3_REJECTED'
    }), {
      status: 422,
      headers: { 'content-type': 'application/json; charset=UTF-8', 'x-sonara-speed-profile': VERSION }
    });
  }

  const nextBody = speedBody(vocalBody, profile);
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-speed-profile', VERSION);

  const response = await runtime.fetch(new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(nextBody),
    cache: 'no-store'
  }), env, ctx);

  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!type.includes('application/json')) return response;
  let payload;
  try { payload = await response.clone().json(); }
  catch { return response; }

  const jobId = firstJobId(payload);
  const verifyAfter = prepared?.enabled === true && (body?.verifyLyrics === true || body?.sonaraLyricsVerification === true);
  const executionProfile = profile === 'ultra' ? 'ultra-fast-single-batch' : 'quality-fast-single-batch';
  const inferenceSteps = profile === 'ultra' ? ULTRA_STEPS : QUALITY_STEPS;
  if (jobId && prepared?.enabled) {
    await saveState(env, jobId, {
      jobId,
      originalLyrics: prepared.originalLyrics,
      performanceLyrics: prepared.performanceLyrics,
      language: prepared.language,
      requestedProfile: profile,
      executionProfile,
      inferenceSteps,
      verifyAfter,
      createdAt: Date.now(),
      verifying: false,
      completedPayload: null
    });
  }

  return jsonResponse(response, {
    ...payload,
    vocalLyricsV3: prepared,
    metadata: {
      ...(payload.metadata || {}),
      speedProfile: VERSION,
      requestedGenerationProfile: profile,
      executionProfile,
      inferenceSteps,
      samplerMode: 'euler',
      singleGpuBatch: true,
      visibleCandidateTarget: 2,
      automaticSecondBatch: false,
      lmThinking: profile === 'ultra',
      lyricVerificationMode: verifyAfter ? 'deferred' : 'on-demand',
      lyricVerificationPending: false
    }
  });
}

async function decorateJob(request, env, ctx, jobId) {
  const response = await runtime.fetch(request, env, ctx);
  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!response.ok || !type.includes('application/json')) return response;
  let payload;
  try { payload = await response.clone().json(); }
  catch { return response; }

  const state = await loadState(env, jobId);
  if (!state) return response;
  if (state.completedPayload) return jsonResponse(response, state.completedPayload);
  if (statusOf(payload) !== 'COMPLETED') return jsonResponse(response, {
    ...payload,
    metadata: {
      ...(payload.metadata || {}),
      speedProfile: VERSION,
      executionProfile: state.executionProfile,
      inferenceSteps: state.inferenceSteps,
      samplerMode: 'euler'
    }
  });

  const immediate = {
    ...payload,
    metadata: {
      ...(payload.metadata || {}),
      speedProfile: VERSION,
      executionProfile: state.executionProfile,
      inferenceSteps: state.inferenceSteps,
      samplerMode: 'euler',
      lyricVerificationMode: state.verifyAfter ? 'deferred' : 'on-demand',
      lyricVerificationPending: state.verifyAfter === true
    }
  };

  if (state.verifyAfter === true && state.verifying !== true) {
    const nextState = { ...state, verifying: true };
    await saveState(env, jobId, nextState);
    ctx.waitUntil(runDeferredVerification(env, jobId, payload, nextState));
  }

  return jsonResponse(response, immediate);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'POST' && GENERATE_PATHS.has(url.pathname)) return prepareGeneration(request, env, ctx);
    const match = request.method === 'GET' ? url.pathname.match(JOB_RE) : null;
    if (match) return decorateJob(request, env, ctx, decodeURIComponent(match[1]));
    return runtime.fetch(request, env, ctx);
  }
};
