import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-real-music-v2-edge.mjs';
import { buildVocalLyricsV3Body, prepareVocalLyricsV3, VOCAL_LYRICS_DIRECTOR_V3 } from './sonara-vocal-lyrics-director-v3.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-vocal-lyrics-v3-edge-1';
const STATE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/vocal-lyrics-v3/';
const STATE_TTL = 6 * 60 * 60;
const JOB_RE = /^\/api\/music\/job\/([^/]+)$/;
const ASR_TIMEOUT = 180_000;

const clean = value => String(value ?? '').trim();
const cleanUrl = value => clean(value).replace(/\/$/, '');
const molabUrl = env => cleanUrl(env.SONARA_MOLAB_XL_URL || env.MOLAB_ACESTEP_URL || '');

function stateRequest(jobId) {
  return new Request(`${STATE_PREFIX}${encodeURIComponent(jobId)}`);
}

function stateStub(env, jobId) {
  try {
    const ns = env?.SONARA_JOB_STATE;
    if (!ns?.idFromName || !ns?.get) return null;
    return ns.get(ns.idFromName(`vocal-lyrics-v3:${jobId}`));
  } catch { return null; }
}

async function saveState(env, jobId, state) {
  const next = { ...state, updatedAt: Date.now() };
  const stub = stateStub(env, jobId);
  if (stub) {
    try {
      const response = await stub.fetch('https://sonara.internal/state', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next)
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
      const response = await stub.fetch('https://sonara.internal/state');
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
  headers.set('x-sonara-vocal-lyrics', VERSION);
  return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
}

function firstJobId(payload = {}) {
  return clean(payload.jobId || payload.job_id || payload?.job?.jobId || payload?.data?.jobId);
}

function originalLyricsFrom(body = {}) {
  return clean(body.sonaraOriginalLyrics || body.sonaraLyricsDisplay || body.lyrics);
}

function proxiedPath(audioUrl) {
  try {
    const url = new URL(audioUrl);
    if (url.pathname === '/api/molab/audio' || url.pathname === '/v1/audio') return clean(url.searchParams.get('path'));
  } catch {}
  return '';
}

async function verifyCandidate(env, candidate, state) {
  const baseUrl = molabUrl(env);
  const audioUrl = clean(candidate?.audioUrl || candidate?.url);
  const path = proxiedPath(audioUrl);
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
      language: clean(data.language || state.language),
      durationSec: Number(data.duration_sec || 0) || undefined
    };
  } catch { return null; }
}

function rankCandidates(candidates, verifications) {
  return candidates.map((candidate, index) => ({
    candidate,
    verification: verifications[index] || null,
    index
  })).sort((a, b) => {
    const av = a.verification;
    const bv = b.verification;
    if (av?.available && !bv?.available) return -1;
    if (!av?.available && bv?.available) return 1;
    if (av?.available && bv?.available) {
      const scoreDelta = Number(bv.score || 0) - Number(av.score || 0);
      if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;
      return Number(av.wordErrorRate || 1) - Number(bv.wordErrorRate || 1);
    }
    return a.index - b.index;
  });
}

function recommendRepair(verification) {
  if (!verification?.available || Number(verification.score || 0) >= 0.94) return null;
  const ranges = Array.isArray(verification.mismatchRanges) ? verification.mismatchRanges : [];
  const first = ranges.find(item => Number.isFinite(Number(item?.start)) && Number.isFinite(Number(item?.end)));
  if (!first) return null;
  const start = Math.max(0, Number(first.start) - 0.35);
  const end = Math.max(start + 1, Number(first.end) + 0.45);
  return {
    recommended: true,
    operation: 'repaint',
    endpoint: '/api/studio/repaint',
    start: Number(start.toFixed(2)),
    end: Number(end.toFixed(2)),
    reason: 'lyric-mismatch',
    prompt: 'Repair only the selected vocal phrase. Preserve singer identity, melody, timing, BPM, key, arrangement and instrumental exactly. Sing the supplied lyric words clearly and in the original order.'
  };
}

async function prepareGeneration(request, env, ctx) {
  let body;
  try { body = await request.clone().json(); }
  catch { return runtime.fetch(request, env, ctx); }

  let prepared;
  let nextBody;
  try {
    prepared = prepareVocalLyricsV3(body);
    nextBody = buildVocalLyricsV3Body(body);
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'FAILED',
      error: error instanceof Error ? error.message : String(error),
      code: 'SONARA_VOCAL_LYRICS_V3_REJECTED'
    }), { status: 422, headers: { 'content-type': 'application/json; charset=UTF-8', 'x-sonara-vocal-lyrics': VERSION } });
  }

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-vocal-lyrics', VERSION);

  const response = await runtime.fetch(new Request(request.url, {
    method: 'POST', headers, body: JSON.stringify(nextBody), cache: 'no-store'
  }), env, ctx);

  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!type.includes('application/json')) return response;
  let payload;
  try { payload = await response.clone().json(); }
  catch { return response; }

  const jobId = firstJobId(payload);
  if (jobId && prepared?.enabled) {
    await saveState(env, jobId, {
      jobId,
      version: VOCAL_LYRICS_DIRECTOR_V3,
      originalLyrics: prepared.originalLyrics,
      performanceLyrics: prepared.performanceLyrics,
      language: prepared.language,
      prosody: prepared.prosody,
      pronunciationGuide: prepared.pronunciationGuide,
      wordCount: prepared.wordCount,
      createdAt: Date.now(),
      verified: false
    });
  }

  return jsonResponse(response, {
    ...payload,
    vocalLyricsV3: prepared,
    metadata: {
      ...(payload.metadata || {}),
      vocalLyricsDirector: VOCAL_LYRICS_DIRECTOR_V3,
      vocalLyricsPrepared: prepared?.enabled === true,
      lyricWordsPreserved: prepared?.wordsPreserved !== false,
      lyricVerificationPending: Boolean(jobId && prepared?.enabled)
    }
  });
}

async function decorateCompletedJob(request, env, ctx, jobId) {
  const response = await runtime.fetch(request, env, ctx);
  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!response.ok || !type.includes('application/json')) return response;
  let payload;
  try { payload = await response.clone().json(); }
  catch { return response; }

  const status = clean(payload.status || payload?.job?.status || payload?.data?.status).toUpperCase();
  const state = await loadState(env, jobId);
  if (!state || status !== 'COMPLETED') return response;
  if (state.completedPayload) return jsonResponse(response, state.completedPayload);

  const candidates = Array.isArray(payload.candidates) && payload.candidates.length
    ? payload.candidates
    : Array.isArray(payload.audioUrls)
      ? payload.audioUrls.map((audioUrl, index) => ({ id: index === 0 ? 'A' : `C${index + 1}`, audioUrl }))
      : payload.audioUrl ? [{ id: 'A', audioUrl: payload.audioUrl }] : [];

  const verifications = await Promise.all(candidates.map(candidate => verifyCandidate(env, candidate, state)));
  const anyAvailable = verifications.some(item => item?.available);
  const ranked = anyAvailable ? rankCandidates(candidates, verifications) : candidates.map((candidate, index) => ({ candidate, verification: verifications[index] || null, index }));
  const ordered = ranked.map((item, rank) => ({
    ...item.candidate,
    vocalRank: rank + 1,
    lyricVerification: item.verification
  }));
  const best = ordered[0] || null;
  const bestVerification = ranked[0]?.verification || null;
  const repair = recommendRepair(bestVerification);
  const result = {
    ...payload,
    ...(best?.audioUrl ? { audioUrl: best.audioUrl } : {}),
    audioUrls: ordered.map(item => item.audioUrl).filter(Boolean),
    candidates: ordered,
    lyricVerification: {
      version: VOCAL_LYRICS_DIRECTOR_V3,
      available: anyAvailable,
      originalLyrics: state.originalLyrics,
      language: state.language,
      bestAccuracy: bestVerification?.available ? bestVerification.score : null,
      bestWordErrorRate: bestVerification?.available ? bestVerification.wordErrorRate : null,
      passed: bestVerification?.available ? bestVerification.score >= 0.94 : null,
      repair
    },
    metadata: {
      ...(payload.metadata || {}),
      vocalLyricsDirector: VOCAL_LYRICS_DIRECTOR_V3,
      lyricVerificationAvailable: anyAvailable,
      lyricAccuracy: bestVerification?.available ? bestVerification.score : null,
      vocalCandidateReranked: anyAvailable && ordered.length > 1,
      targetedVocalRepairRecommended: Boolean(repair)
    }
  };
  state.completedPayload = result;
  state.verified = anyAvailable;
  await saveState(env, jobId, state);
  return jsonResponse(response, result);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/api/engine/generate') return prepareGeneration(request, env, ctx);
    const match = request.method === 'GET' ? url.pathname.match(JOB_RE) : null;
    if (match) return decorateCompletedJob(request, env, ctx, decodeURIComponent(match[1]));
    return runtime.fetch(request, env, ctx);
  }
};
