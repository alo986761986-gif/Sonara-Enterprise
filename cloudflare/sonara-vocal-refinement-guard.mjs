import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-studio-transient-poll-guard.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-vocal-refinement-1';
const SAFE_GATE_VERSION = 'sonara-vocal-safe-gate-1';
const ENDPOINT = '/api/studio/vocal-refine';
const SAFE_ENDPOINT = '/api/studio/vocal-refine-safe';
const DIRECTOR_JOB_RE = /^\/api\/music\/job\/(director-v3-[A-Za-z0-9_-]+)$/;
const SAFE_JOB_RE = /^\/api\/studio\/job\/(vocal-safe-[A-Za-z0-9_-]+)$/;
const MIN_RELEASE_SCORE = 88;
const MAX_TECHNICAL_REGRESSION = 1;
const MAX_QUALITY_ATTEMPTS = 4;
const DEFAULT_ISSUES = [
  'metallic or phasey vocal artifacts',
  'harsh sibilance and brittle consonants',
  'unstable formants or synthetic vowel tone',
  'poor lyric intelligibility',
  'unnatural breath or phrase transitions',
  'singer identity inconsistency',
  'vocal masking against the instrumental'
];

const clean = value => String(value ?? '').trim();

function json(request, data, status = 200, extraHeaders = {}) {
  const origin = clean(request.headers.get('origin'));
  const allowed = new Set([
    'https://sonaraenterprise.com',
    'https://www.sonaraenterprise.com',
    'https://api.sonaraenterprise.com'
  ]);
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-vocal-refinement': VERSION,
      'access-control-allow-origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'Authorization,Content-Type,Cache-Control,Pragma,X-Sonara-Internal-Secret',
      vary: 'Origin',
      ...extraHeaders
    }
  });
}

function normalizeIssues(value) {
  const custom = Array.isArray(value)
    ? value.map(clean).filter(Boolean)
    : typeof value === 'string'
      ? value.split(',').map(clean).filter(Boolean)
      : [];
  const selected = custom.length ? custom : DEFAULT_ISSUES;
  return [...new Set(selected)].slice(0, 12);
}

function rankedUrls(data) {
  const source = data?.job || data?.data || data || {};
  const candidates = Array.isArray(source.candidates) ? source.candidates : Array.isArray(source.outputs) ? source.outputs : [];
  return candidates
    .slice()
    .sort((a, b) => Number(a?.directorRank || 999) - Number(b?.directorRank || 999))
    .map(item => clean(item?.audioUrl || item?.url))
    .filter(Boolean);
}

function audioUrlsFrom(data) {
  const source = data?.job || data?.data || data || {};
  const urls = [];
  const add = value => {
    const text = clean(value);
    if (text && !urls.includes(text)) urls.push(text);
  };
  add(source.audioUrl);
  for (const value of Array.isArray(source.audioUrls) ? source.audioUrls : []) add(value);
  for (const item of Array.isArray(source.candidates) ? source.candidates : []) add(item?.audioUrl || item?.url);
  for (const item of Array.isArray(source.outputs) ? source.outputs : []) add(item?.audioUrl || item?.url);
  return urls;
}

function statusOf(data) {
  return clean(data?.job?.status || data?.data?.status || data?.status).toUpperCase();
}

function safeStateStub(env, jobId) {
  try {
    const ns = env?.SONARA_JOB_STATE;
    if (!ns?.idFromName || !ns?.get) return null;
    return ns.get(ns.idFromName(`vocal-safe:${jobId}`));
  } catch { return null; }
}

async function loadSafeState(env, jobId) {
  const stub = safeStateStub(env, jobId);
  if (!stub) return null;
  try {
    const response = await stub.fetch('https://sonara.internal/state', { method: 'GET' });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

async function saveSafeState(env, jobId, state) {
  const stub = safeStateStub(env, jobId);
  if (!stub) return false;
  try {
    const response = await stub.fetch('https://sonara.internal/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...state, updatedAt: Date.now() })
    });
    return response.ok;
  } catch { return false; }
}

async function readJsonSafe(response) {
  try { return await response.clone().json(); }
  catch { return null; }
}

async function normalizeDirectorResult(request, response) {
  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!response.ok || !type.includes('application/json')) return response;

  let payload;
  try { payload = await response.clone().json(); }
  catch { return response; }

  const source = payload?.job || payload?.data || payload || {};
  if (clean(source.status).toUpperCase() !== 'COMPLETED') return response;

  const urls = rankedUrls(payload);
  if (!urls.length) return response;
  const recommended = urls[0];

  const normalizeObject = object => object && typeof object === 'object' ? {
    ...object,
    audioUrl: recommended,
    audioUrls: urls,
    recommendedAudioUrl: recommended,
    directorRecommendedAudioUrl: recommended,
    metadata: {
      ...(object.metadata || {}),
      recommendedAudioUrl: recommended,
      topLevelAudioAlignedWithDirectorRank: true
    }
  } : object;

  let next = normalizeObject(payload);
  if (next.job && typeof next.job === 'object') next.job = normalizeObject(next.job);
  if (next.data && typeof next.data === 'object') next.data = normalizeObject(next.data);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=UTF-8');
  headers.set('cache-control', 'private, no-store');
  headers.set('x-sonara-director-audio-alignment', 'rank-1');
  return new Response(JSON.stringify(next), { status: response.status, statusText: response.statusText, headers });
}

function buildRefinementBody(body, sourceAudioUrl) {
  const preserveStrength = Math.max(0.82, Math.min(0.96, Number(body.preserveStrength || 0.91)));
  const issues = normalizeIssues(body.issues);
  return {
    preserveStrength,
    issues,
    body: {
      ...body,
      sourceAudioUrl,
      audioUrl: sourceAudioUrl,
      preserveStrength,
      issues,
      sonaraVocalRefinement: VERSION,
      sonaraVocalIdentityLock: true,
      sonaraLyricsLock: true,
      sonaraArrangementLock: true,
      prompt: clean(body.prompt) || 'Refine only the lead vocal quality. Preserve lyrics word-for-word, singer identity, melody, timing, BPM, key, arrangement and instrumental production. Improve natural vocal timbre, articulation, breaths, formants and mix integration without changing the song.'
    }
  };
}

async function submitRefinement(request, env, ctx, body) {
  const sourceAudioUrl = clean(body.sourceAudioUrl || body.audioUrl || body.sourceUrl);
  if (!sourceAudioUrl) return { error: 'sourceAudioUrl mancante.', status: 400 };

  const built = buildRefinementBody(body, sourceAudioUrl);
  const url = new URL(request.url);
  url.pathname = '/api/studio/repair';
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-vocal-refinement', VERSION);

  const response = await runtime.fetch(new Request(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(built.body),
    cache: 'no-store'
  }), env, ctx);
  const data = await readJsonSafe(response);
  return { response, data, sourceAudioUrl, preserveStrength: built.preserveStrength, issues: built.issues };
}

function decorateRefinementData(result, originalBody) {
  return {
    ...(result.data || {}),
    requestedOperation: 'vocal-refine',
    vocalRefinement: {
      version: VERSION,
      preserveStrength: result.preserveStrength,
      lyricsLocked: true,
      singerIdentityLocked: true,
      arrangementLocked: true,
      issues: result.issues,
      customIssuesAuthoritative: Array.isArray(originalBody.issues) || typeof originalBody.issues === 'string'
    }
  };
}

async function vocalRefine(request, env, ctx) {
  let body;
  try { body = await request.clone().json(); }
  catch { return json(request, { status: 'FAILED', error: 'Vocal Refinement richiede un payload JSON valido.' }, 400); }

  const result = await submitRefinement(request, env, ctx, body);
  if (result.error) return json(request, { status: 'FAILED', error: result.error }, result.status || 400);
  if (!result.data) return result.response;

  const outHeaders = new Headers(result.response.headers);
  outHeaders.delete('content-length');
  outHeaders.set('content-type', 'application/json; charset=UTF-8');
  outHeaders.set('x-sonara-vocal-refinement', VERSION);
  return new Response(JSON.stringify(decorateRefinementData(result, body)), {
    status: result.response.status,
    statusText: result.response.statusText,
    headers: outHeaders
  });
}

function newSafeJobId() {
  return `vocal-safe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function vocalRefineSafe(request, env, ctx) {
  let body;
  try { body = await request.clone().json(); }
  catch { return json(request, { status: 'FAILED', error: 'Vocal Safe Gate richiede un payload JSON valido.' }, 400); }

  const result = await submitRefinement(request, env, ctx, body);
  if (result.error) return json(request, { status: 'FAILED', error: result.error }, result.status || 400);
  if (!result.response?.ok || !result.data) {
    const data = result.data || { error: `Refinement HTTP ${result.response?.status || 502}` };
    return json(request, { ...data, status: 'FAILED', vocalSafeGate: { version: SAFE_GATE_VERSION } }, result.response?.status || 502);
  }

  const childJobId = clean(result.data?.jobId || result.data?.job_id || result.data?.job?.jobId || result.data?.data?.jobId);
  if (!childJobId) return json(request, { status: 'FAILED', error: 'Vocal Refinement non ha restituito un jobId.' }, 502);

  const jobId = newSafeJobId();
  const state = {
    jobId,
    childJobId,
    sourceAudioUrl: result.sourceAudioUrl,
    preserveStrength: result.preserveStrength,
    issues: result.issues,
    bpm: Number(body.bpm || 0) || undefined,
    key: clean(body.key || body.keySignature),
    durationSec: Number(body.durationSec || body.duration || 0) || undefined,
    qualityAttempts: 0,
    createdAt: Date.now(),
    completedResult: null
  };
  const stored = await saveSafeState(env, jobId, state);
  if (!stored) return json(request, { status: 'FAILED', error: 'Impossibile inizializzare lo stato Vocal Safe Gate.' }, 503);

  return json(request, {
    jobId,
    status: 'QUEUED',
    progress: 5,
    requestedOperation: 'vocal-refine-safe',
    childJobId,
    vocalSafeGate: {
      version: SAFE_GATE_VERSION,
      minimumReleaseScore: MIN_RELEASE_SCORE,
      maxTechnicalRegression: MAX_TECHNICAL_REGRESSION,
      originalAlwaysAvailable: true,
      preserveStrength: result.preserveStrength,
      issues: result.issues
    }
  }, 202, { 'x-sonara-vocal-safe-gate': SAFE_GATE_VERSION });
}

async function pollChildJob(request, env, ctx, childJobId) {
  const url = new URL(request.url);
  url.pathname = `/api/studio/job/${encodeURIComponent(childJobId)}`;
  const headers = new Headers(request.headers);
  headers.set('cache-control', 'no-cache');
  return runtime.fetch(new Request(url.toString(), { method: 'GET', headers, cache: 'no-store' }), env, ctx);
}

function criticalHardFailure(report) {
  const reasons = Array.isArray(report?.hardFailureReasons) ? report.hardFailureReasons : [];
  return reasons.some(reason => ['analysis-error', 'real-wav-analysis-missing', 'clipping', 'excessive-silence', 'dc-offset'].includes(clean(reason)));
}

async function qualityPair(request, env, ctx, state, refinedAudioUrl) {
  const url = new URL(request.url);
  url.pathname = '/api/studio/quality-v2';
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('cache-control', 'no-cache');
  const response = await runtime.fetch(new Request(url.toString(), {
    method: 'POST',
    headers,
    cache: 'no-store',
    body: JSON.stringify({
      audioUrls: [state.sourceAudioUrl, refinedAudioUrl],
      bpm: state.bpm,
      key: state.key,
      durationSec: state.durationSec
    })
  }), env, ctx);
  return { response, data: await readJsonSafe(response) };
}

function safeCompleted(request, state, selectedAudioUrl, refinedAudioUrl, gate) {
  const alternate = selectedAudioUrl === state.sourceAudioUrl ? refinedAudioUrl : state.sourceAudioUrl;
  return {
    jobId: state.jobId,
    status: 'COMPLETED',
    progress: 100,
    audioUrl: selectedAudioUrl,
    audioUrls: [selectedAudioUrl, alternate].filter(Boolean),
    originalAudioUrl: state.sourceAudioUrl,
    refinedAudioUrl: refinedAudioUrl || null,
    selectedVersion: gate.selected,
    fallbackUsed: gate.selected !== 'refined',
    requestedOperation: 'vocal-refine-safe',
    vocalSafeGate: {
      version: SAFE_GATE_VERSION,
      minimumReleaseScore: MIN_RELEASE_SCORE,
      maxTechnicalRegression: MAX_TECHNICAL_REGRESSION,
      preserveStrength: state.preserveStrength,
      issues: state.issues,
      ...gate
    },
    metadata: {
      vocalSafeGate: true,
      selectedVersion: gate.selected,
      fallbackUsed: gate.selected !== 'refined',
      originalAudioUrl: state.sourceAudioUrl,
      refinedAudioUrl: refinedAudioUrl || null
    }
  };
}

async function vocalSafeJob(request, env, ctx, jobId) {
  const state = await loadSafeState(env, jobId);
  if (!state) return json(request, { jobId, status: 'NOT_FOUND', error: 'Vocal Safe Gate job non trovato o scaduto.' }, 404);
  if (state.completedResult) return json(request, state.completedResult, 200, { 'x-sonara-vocal-safe-gate': SAFE_GATE_VERSION });

  const childResponse = await pollChildJob(request, env, ctx, state.childJobId);
  const childData = await readJsonSafe(childResponse);
  const childStatus = statusOf(childData || {});

  if (!childData || !childResponse.ok && !['FAILED', 'ERROR', 'CANCELLED'].includes(childStatus)) {
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 75,
      stage: 'Vocal Safe Gate: attesa refinement',
      vocalSafeGate: { version: SAFE_GATE_VERSION, childJobId: state.childJobId }
    }, 200, { 'retry-after': '4', 'x-sonara-vocal-safe-gate': SAFE_GATE_VERSION });
  }

  if (['FAILED', 'ERROR', 'CANCELLED'].includes(childStatus)) {
    const completed = safeCompleted(request, state, state.sourceAudioUrl, null, {
      selected: 'original',
      reason: 'refinement-child-failed',
      originalScore: null,
      refinedScore: null,
      technicalScoreDelta: null,
      releaseSafe: true
    });
    state.completedResult = completed;
    await saveSafeState(env, jobId, state);
    return json(request, completed, 200, { 'x-sonara-vocal-safe-gate': SAFE_GATE_VERSION });
  }

  if (!['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'DONE'].includes(childStatus)) {
    const progress = Number(childData?.progress || childData?.job?.progress || childData?.data?.progress || 0);
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: Math.min(92, Math.max(10, 55 + progress * 0.37)),
      stage: 'Vocal Safe Gate: refinement controllato',
      vocalSafeGate: { version: SAFE_GATE_VERSION, childJobId: state.childJobId }
    }, 200, { 'retry-after': '4', 'x-sonara-vocal-safe-gate': SAFE_GATE_VERSION });
  }

  const refinedAudioUrl = audioUrlsFrom(childData)[0];
  if (!refinedAudioUrl) {
    const completed = safeCompleted(request, state, state.sourceAudioUrl, null, {
      selected: 'original',
      reason: 'refinement-audio-missing',
      originalScore: null,
      refinedScore: null,
      technicalScoreDelta: null,
      releaseSafe: true
    });
    state.completedResult = completed;
    await saveSafeState(env, jobId, state);
    return json(request, completed, 200, { 'x-sonara-vocal-safe-gate': SAFE_GATE_VERSION });
  }

  const quality = await qualityPair(request, env, ctx, state, refinedAudioUrl);
  const qualityUnavailable = !quality.data || !quality.response.ok;
  if (qualityUnavailable) {
    state.qualityAttempts = Number(state.qualityAttempts || 0) + 1;
    await saveSafeState(env, jobId, state);
    if (state.qualityAttempts <= MAX_QUALITY_ATTEMPTS) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 96,
        stage: 'Vocal Safe Gate: validazione Quality 2.0',
        vocalSafeGate: {
          version: SAFE_GATE_VERSION,
          qualityAttempt: state.qualityAttempts,
          maxQualityAttempts: MAX_QUALITY_ATTEMPTS
        }
      }, 200, { 'retry-after': '4', 'x-sonara-vocal-safe-gate': SAFE_GATE_VERSION });
    }
    const completed = safeCompleted(request, state, state.sourceAudioUrl, refinedAudioUrl, {
      selected: 'original',
      reason: 'quality-gate-unavailable',
      originalScore: null,
      refinedScore: null,
      technicalScoreDelta: null,
      releaseSafe: true
    });
    state.completedResult = completed;
    await saveSafeState(env, jobId, state);
    return json(request, completed, 200, { 'x-sonara-vocal-safe-gate': SAFE_GATE_VERSION });
  }

  const reports = Array.isArray(quality.data?.reports) ? quality.data.reports : [];
  const originalReport = reports[0] || {};
  const refinedReport = reports[1] || {};
  const originalScore = Number(originalReport?.professionalScore || 0);
  const refinedScore = Number(refinedReport?.professionalScore || 0);
  const delta = Number((refinedScore - originalScore).toFixed(1));
  const measured = refinedReport?.measuredFromRealWav === true;
  const releaseSafe = measured && refinedScore >= MIN_RELEASE_SCORE && delta >= -MAX_TECHNICAL_REGRESSION && !criticalHardFailure(refinedReport);
  const selected = releaseSafe ? 'refined' : 'original';
  const selectedAudioUrl = releaseSafe ? refinedAudioUrl : state.sourceAudioUrl;
  const completed = safeCompleted(request, state, selectedAudioUrl, refinedAudioUrl, {
    selected,
    reason: releaseSafe ? 'refined-passed-safe-gate' : 'refined-rejected-safe-gate',
    originalScore,
    refinedScore,
    technicalScoreDelta: delta,
    refinedMeasuredFromRealWav: measured,
    releaseSafe,
    originalReport,
    refinedReport
  });
  state.completedResult = completed;
  await saveSafeState(env, jobId, state);
  return json(request, completed, 200, { 'x-sonara-vocal-safe-gate': SAFE_GATE_VERSION });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if ((url.pathname === ENDPOINT || url.pathname === SAFE_ENDPOINT) && request.method === 'OPTIONS') {
      return json(request, { ok: true, version: VERSION, safeGateVersion: SAFE_GATE_VERSION }, 200);
    }
    if (url.pathname === ENDPOINT && request.method === 'POST') {
      return vocalRefine(request, env, ctx);
    }
    if (url.pathname === SAFE_ENDPOINT && request.method === 'POST') {
      return vocalRefineSafe(request, env, ctx);
    }
    const safeMatch = request.method === 'GET' ? url.pathname.match(SAFE_JOB_RE) : null;
    if (safeMatch) {
      return vocalSafeJob(request, env, ctx, safeMatch[1]);
    }
    const response = await runtime.fetch(request, env, ctx);
    if (request.method === 'GET' && DIRECTOR_JOB_RE.test(url.pathname)) {
      return normalizeDirectorResult(request, response);
    }
    return response;
  }
};
