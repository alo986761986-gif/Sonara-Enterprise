import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-native-auth-main.mjs';
import {
  QUALITY_DIRECTOR_VERSION,
  PROFESSIONAL_RELEASE_SCORE,
  analyzeProfessionalCandidate,
  summarizeProfessionalReports
} from './sonara-quality-director-v2.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-music-director-v3';
const PROFILE_KEY = 'sonara.generation.profile.v3';
const STATE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/music-director-v3/';
const STATE_TTL = 6 * 60 * 60;
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const JOB_RE = /^\/api\/(?:music|studio)\/job\/(director-v3-[A-Za-z0-9_-]+)$/;
const HEALTH_PATHS = new Set(['/api/health', '/api/engine/ready', '/api/molab/ready', '/api/studio/capabilities', '/api/studio/release-status']);
const ALLOWED_AUDIO_HOSTS = new Set(['sonaraenterprise.com', 'www.sonaraenterprise.com', 'api.sonaraenterprise.com', 'molab.sonaraenterprise.com']);

const clean = value => String(value ?? '').trim();
const clamp = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;

function profileOf(body = {}) {
  const raw = clean(body.generationProfileV3 || body.renderProfile || body.generationProfile || body.qualityProfile || 'quality').toLowerCase();
  if (['fast', 'speed', 'preview'].includes(raw)) return 'fast';
  if (['ultra', 'max', 'studio', 'master'].includes(raw)) return 'ultra';
  return 'quality';
}

function profileSpec(profile) {
  if (profile === 'fast') return { profile, internalBatches: 1, candidatesPerBatch: 2, targetScore: 82, autoRepair: false, downstreamProfile: 'fast' };
  if (profile === 'ultra') return { profile, internalBatches: 2, candidatesPerBatch: 2, targetScore: 92, autoRepair: true, downstreamProfile: 'quality' };
  return { profile: 'quality', internalBatches: 2, candidatesPerBatch: 2, targetScore: PROFESSIONAL_RELEASE_SCORE, autoRepair: true, downstreamProfile: 'quality' };
}

function requested(body = {}) {
  return {
    bpm: numeric(body.sonaraExactRequestedBpm ?? body.requestedBpm ?? body.bpm),
    key: clean(body.key || body.key_scale || body.keySignature),
    durationSec: numeric(body.durationSec ?? body.duration ?? body.audio_duration)
  };
}

function creatorText(body = {}) {
  return clean(
    body.sonaraUserPromptOriginal ||
    body.sonaraCreatorPromptAuthoritative ||
    body.sonaraOriginalCreatorBrief ||
    body.rawPrompt ||
    body.creatorPrompt ||
    body.creator_prompt ||
    body.musicPrompt ||
    body.prompt
  );
}

function selectedInstruments(body = {}) {
  const source = body.selectedInstruments || body.instruments || [];
  if (Array.isArray(source)) return source.map(clean).filter(Boolean).slice(0, 12);
  return clean(source).split(',').map(clean).filter(Boolean).slice(0, 12);
}

function sectionPlan(durationSec, vocalMode, hasLyrics) {
  const duration = clamp(durationSec, 180, 30, 600);
  const vocal = !/instrumental|no vocals|senza voce/i.test(clean(vocalMode)) || hasLyrics;
  if (duration <= 75) return vocal
    ? '8-bar intro; verse; pre-hook; memorable chorus; short contrast; final chorus; composed ending.'
    : '8-bar intro; groove A; hook/drop; contrast B; final hook; composed ending.';
  if (duration <= 210) return vocal
    ? 'Intro; verse 1; pre-chorus; chorus; verse 2 variation; pre-chorus lift; chorus; bridge/breakdown; final chorus with development; deliberate outro.'
    : 'Intro; groove A; motif statement; build; main hook/drop; contrast/breakdown; developed return; final peak; deliberate outro.';
  return vocal
    ? 'Long-form song arc with intro, two developed verses, recurring chorus identity, bridge/breakdown, late-song variation, final chorus climax and a clean ending; no copy-paste looping.'
    : 'Long-form arrangement with evolving intro, groove development, recurring motif identity, multiple tension/release cycles, breakdown, final peak and composed outro; no static looping.';
}

function buildBlueprint(body, profile, variantIndex) {
  const req = requested(body);
  const taxonomy = [body.sonaraSelectedFamily || body.genreFamily || body.genre_family, body.sonaraSelectedGenre || body.genre, body.sonaraSelectedSubgenre || body.subgenre].map(clean).filter(Boolean).join(' > ');
  const mood = clean(body.sonaraSelectedMood || body.mood || body.atmosphere);
  const vocalMode = clean(body.vocalMode || body.vocal_mode || (body.lyrics ? 'vocal' : 'instrumental'));
  const instruments = selectedInstruments(body);
  const structure = sectionPlan(req.durationSec, vocalMode, Boolean(clean(body.lyrics)));
  const variant = variantIndex === 0
    ? 'Candidate direction A: prioritize hook memorability, groove authority, clean section identity and strong first-listen impact.'
    : 'Candidate direction B: preserve the same style/BPM/key/lyrics but use different melody, voicing, transitions, fills, texture movement and timbral balance.';
  const fidelity = profile === 'ultra'
    ? 'ULTRA fidelity: maximize arrangement detail, human micro-variation, vocal intelligibility, transient realism, depth and release-ready polish. Avoid plastic timbres, phasey vocals, generic filler and repeated copy-paste sections.'
    : profile === 'quality'
      ? 'QUALITY fidelity: prioritize coherent songwriting, authentic genre language, human groove, strong musical transitions, natural dynamics and release-ready balance.'
      : 'FAST preview: preserve the requested musical identity and core hook while minimizing unnecessary complexity.';
  const locks = [
    req.bpm ? `Exact tempo lock: ${Math.round(req.bpm)} BPM for the entire song.` : '',
    req.key ? `Tonal lock: ${req.key}.` : '',
    req.durationSec ? `Target duration: ${Math.round(req.durationSec)} seconds with a real musical ending.` : '',
    taxonomy ? `Style identity lock: ${taxonomy}.` : '',
    mood ? `Atmosphere: ${mood}.` : '',
    instruments.length ? `Requested instrumentation: ${instruments.join(', ')}.` : '',
    /instrumental|no vocals|senza voce/i.test(vocalMode) ? 'Instrumental only: do not invent lead vocals or sung lyrics.' : `Vocal mode: ${vocalMode}; preserve supplied lyrics and one stable singer identity.`
  ].filter(Boolean).join(' ');

  return [
    `SONARA MUSIC DIRECTOR V3 — ${profile.toUpperCase()} MASTER BLUEPRINT.`,
    locks,
    `Arrangement blueprint: ${structure}`,
    variant,
    fidelity,
    'Mix/master target: controlled low end, clean transients, intelligible mids, non-harsh highs, stereo depth, musical crest factor, no clipping, no DC offset, no broken silence gaps, and a confident but dynamic final master.'
  ].filter(Boolean).join('\n');
}

function enrichBody(body, profile, variantIndex) {
  const spec = profileSpec(profile);
  const original = creatorText(body).slice(0, 2600);
  const blueprint = buildBlueprint(body, profile, variantIndex).slice(0, 2200);
  const authoritative = [original, blueprint].filter(Boolean).join('\n\n').slice(0, 4800);
  const baseSeed = Number(body.seed) > 0 ? Math.floor(Number(body.seed)) : Math.floor(Date.now() % 1_900_000_000);
  return {
    ...body,
    sonaraUserPromptOriginal: original,
    sonaraMusicDirectorV3: VERSION,
    sonaraMusicDirectorProfile: profile,
    sonaraMusicDirectorVariant: variantIndex,
    sonaraMusicDirectorBlueprint: blueprint,
    sonaraCreatorPromptAuthoritative: authoritative,
    sonaraOriginalCreatorBrief: authoritative,
    rawPrompt: authoritative,
    creatorPrompt: authoritative,
    prompt: authoritative,
    candidateCount: spec.candidatesPerBatch,
    candidate_count: spec.candidatesPerBatch,
    dualFast: spec.candidatesPerBatch === 2,
    qualityProfile: spec.downstreamProfile,
    generationProfile: spec.downstreamProfile,
    seed: Math.max(1, baseSeed + variantIndex * 104729),
    sonaraAutomaticCandidateRanking: true,
    sonaraAutoRepair: spec.autoRepair,
    sonaraTargetProfessionalScore: spec.targetScore,
    sonaraInternalCandidateTarget: spec.internalBatches * spec.candidatesPerBatch,
    sonaraVisibleCandidateTarget: 2
  };
}

function stateRequest(id) {
  return new Request(`${STATE_PREFIX}${encodeURIComponent(id)}`);
}

function stateStub(env, id) {
  try {
    const ns = env?.SONARA_JOB_STATE;
    return ns?.get && ns?.idFromName ? ns.get(ns.idFromName(`director-v3:${id}`)) : null;
  } catch { return null; }
}

async function saveState(env, id, state) {
  const next = { ...state, updatedAt: Date.now() };
  const stub = stateStub(env, id);
  if (stub) {
    try {
      const response = await stub.fetch('https://sonara.internal/state', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next)
      });
      if (response.ok) return;
    } catch {}
  }
  try {
    await caches.default.put(stateRequest(id), new Response(JSON.stringify(next), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${STATE_TTL}` }
    }));
  } catch {}
}

async function loadState(env, id) {
  const stub = stateStub(env, id);
  if (stub) {
    try {
      const response = await stub.fetch('https://sonara.internal/state');
      if (response.ok) return await response.json();
    } catch {}
  }
  try {
    const response = await caches.default.match(stateRequest(id));
    return response ? await response.json() : null;
  } catch { return null; }
}

function syntheticId() {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `director-v3-${Date.now().toString(36)}-${random[0].toString(36)}${random[1].toString(36)}`;
}

function jsonData(response) {
  return response.clone().json().catch(() => null);
}

function extractJobId(data) {
  return clean(data?.jobId || data?.job_id || data?.id || data?.data?.jobId || data?.data?.job_id || data?.data?.id);
}

function statusOf(data) {
  const raw = clean(data?.status || data?.state || data?.data?.status || data?.data?.state).toLowerCase();
  if (['completed', 'complete', 'success', 'succeeded', 'done', 'finished', 'ready'].includes(raw)) return 'completed';
  if (['failed', 'error', 'cancelled', 'canceled', 'not_found'].includes(raw)) return 'failed';
  return 'processing';
}

function progressOf(data) {
  const n = Number(data?.progress ?? data?.data?.progress ?? data?.metadata?.progress ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
}

function candidateArray(data) {
  const lists = [data?.candidates, data?.outputs, data?.data?.candidates, data?.data?.outputs, data?.result?.candidates, data?.result?.outputs];
  return lists.find(value => Array.isArray(value) && value.length) || [];
}

function audioUrl(item) {
  if (typeof item === 'string' && /^https:\/\//i.test(item)) return item;
  if (!item || typeof item !== 'object') return '';
  for (const value of [item.audioUrl, item.audio_url, item.url, item.downloadUrl, item.download_url, item.file]) {
    if (typeof value === 'string' && /^https:\/\//i.test(value)) return value;
  }
  return '';
}

function qualityReports(data) {
  for (const value of [data?.sonaraQualityDirector?.reports, data?.sonaraQualityJudge?.reports, data?.qualityJudge?.reports, data?.data?.sonaraQualityDirector?.reports, data?.data?.sonaraQualityJudge?.reports]) {
    if (Array.isArray(value) && value.length) return value;
  }
  return [];
}

function validAudio(value) {
  try {
    const url = new URL(clean(value));
    return url.protocol === 'https:' && ALLOWED_AUDIO_HOSTS.has(url.hostname) ? url.toString() : '';
  } catch { return ''; }
}

async function rankCombined(children, req) {
  const joined = [];
  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const data = children[childIndex];
    const candidates = candidateArray(data);
    const reports = qualityReports(data);
    const byUrl = new Map(reports.map(report => [clean(report?.audioUrl), report]).filter(([url]) => url));
    for (let localIndex = 0; localIndex < candidates.length; localIndex += 1) {
      const candidate = candidates[localIndex];
      const url = validAudio(audioUrl(candidate));
      if (!url) continue;
      let report = byUrl.get(url) || reports.find(r => Number(r?.candidateIndex ?? r?.outputIndex ?? r?.index) === localIndex) || candidate?.sonaraQuality || candidate?.quality || null;
      if (!report || report.measuredFromRealWav !== true) {
        try { report = await analyzeProfessionalCandidate(url, req); }
        catch (error) {
          report = { audioUrl: url, measuredFromRealWav: false, professionalScore: 0, professionalReleasePassed: false, hardFailureReasons: ['analysis-error'], error: error instanceof Error ? error.message : String(error) };
        }
      }
      joined.push({ candidate, url, report: { ...report, audioUrl: url, candidateIndex: joined.length, childIndex, localIndex } });
    }
  }
  const summary = summarizeProfessionalReports(joined.map(item => item.report), req);
  const byUrl = new Map(joined.map(item => [item.url, item]));
  const ranked = summary.reports.map(report => byUrl.get(clean(report.audioUrl))).filter(Boolean);
  return { ranked, summary };
}

function buildChildRequest(request, body, path = null) {
  const url = new URL(request.url);
  if (path) url.pathname = path;
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-music-director', VERSION);
  return new Request(url.toString(), {
    method: 'POST', headers, body: JSON.stringify(body), redirect: request.redirect, credentials: request.credentials, cache: 'no-store'
  });
}

async function submitDirector(request, env, ctx) {
  const type = clean(request.headers.get('content-type')).toLowerCase();
  if (!type.includes('application/json')) return runtime.fetch(request, env, ctx);
  let body;
  try { body = await request.clone().json(); }
  catch { return runtime.fetch(request, env, ctx); }
  if (body?.sonaraDirectorBypass === true) return runtime.fetch(request, env, ctx);

  const profile = profileOf(body);
  const spec = profileSpec(profile);
  if (profile === 'fast') {
    const response = await runtime.fetch(buildChildRequest(request, enrichBody(body, profile, 0)), env, ctx);
    return transformJson(response, data => ({
      ...data,
      metadata: { ...(data?.metadata || {}), sonaraMusicDirector: VERSION, profile, generatedCandidateTarget: 2, visibleCandidateTarget: 2, autoRepair: false }
    }));
  }

  const primaryRequest = buildChildRequest(request, enrichBody(body, profile, 0));
  const secondaryRequest = buildChildRequest(request, { ...enrichBody(body, profile, 1), sonaraDirectorBypass: true }, '/api/engine/generate');
  const [primaryResponse, secondaryResponse] = await Promise.all([
    runtime.fetch(primaryRequest, env, ctx),
    runtime.fetch(secondaryRequest, env, ctx)
  ]);
  const [primaryData, secondaryData] = await Promise.all([jsonData(primaryResponse), jsonData(secondaryResponse)]);
  const primaryJob = extractJobId(primaryData);
  const secondaryJob = extractJobId(secondaryData);

  if (!primaryResponse.ok || !primaryJob) return primaryResponse;
  if (!secondaryResponse.ok || !secondaryJob) {
    return transformJson(primaryResponse, data => ({
      ...data,
      metadata: { ...(data?.metadata || {}), sonaraMusicDirector: VERSION, profile, generatedCandidateTarget: 2, visibleCandidateTarget: 2, secondaryBatchDegraded: true }
    }));
  }

  const id = syntheticId();
  const state = {
    id,
    profile,
    spec,
    requested: requested(body),
    childJobs: [primaryJob, secondaryJob],
    sourceGeneratePath: new URL(request.url).pathname,
    createdAt: Date.now(),
    repairJobId: '',
    repairAttempted: false
  };
  await saveState(env, id, state);

  const next = {
    ...(primaryData || {}),
    jobId: id,
    job_id: id,
    status: 'QUEUED',
    progress: 0,
    metadata: {
      ...((primaryData && primaryData.metadata) || {}),
      sonaraMusicDirector: VERSION,
      qualityDirector: QUALITY_DIRECTOR_VERSION,
      profile,
      generatedCandidateTarget: spec.internalBatches * spec.candidatesPerBatch,
      visibleCandidateTarget: 2,
      automaticCandidateRanking: true,
      automaticQualityRepair: spec.autoRepair,
      professionalTargetScore: spec.targetScore
    }
  };
  return jsonResponse(request, next, 202);
}

async function childStatus(request, env, ctx, jobId) {
  const url = new URL(request.url);
  url.pathname = `/api/music/job/${encodeURIComponent(jobId)}`;
  const headers = new Headers(request.headers);
  headers.set('cache-control', 'no-cache');
  return runtime.fetch(new Request(url.toString(), { method: 'GET', headers, cache: 'no-store' }), env, ctx);
}

async function repairStatus(request, env, ctx, jobId) {
  const url = new URL(request.url);
  url.pathname = `/api/studio/job/${encodeURIComponent(jobId)}`;
  const headers = new Headers(request.headers);
  headers.set('cache-control', 'no-cache');
  return runtime.fetch(new Request(url.toString(), { method: 'GET', headers, cache: 'no-store' }), env, ctx);
}

async function submitRepair(request, env, ctx, state, best) {
  const url = new URL(request.url);
  url.pathname = '/api/studio/repair';
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-music-director', VERSION);
  const issues = Array.isArray(best?.report?.hardFailureReasons) && best.report.hardFailureReasons.length
    ? best.report.hardFailureReasons
    : ['professional quality score below target', 'mix balance', 'artifacts', 'ending integrity'];
  const body = {
    sourceAudioUrl: best.url,
    audioUrl: best.url,
    bpm: state.requested?.bpm,
    key: state.requested?.key,
    durationSec: state.requested?.durationSec,
    issues,
    preserveStrength: state.profile === 'ultra' ? 0.9 : 0.88,
    prompt: `SONARA Music Director ${state.profile.toUpperCase()} final repair. Preserve composition, genre, hook, lyrics, singer identity, BPM, key and arrangement. Fix only measurable defects and improve release readiness.`,
    sonaraMusicDirectorV3: VERSION
  };
  const response = await runtime.fetch(new Request(url.toString(), { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store' }), env, ctx);
  const data = await jsonData(response);
  return { response, data, jobId: extractJobId(data) };
}

async function directorJob(request, env, ctx, id) {
  const state = await loadState(env, id);
  if (!state) return runtime.fetch(request, env, ctx);
  if (state.completedResult) return jsonResponse(request, state.completedResult);

  const childResponses = await Promise.all(state.childJobs.map(jobId => childStatus(request, env, ctx, jobId)));
  const childData = await Promise.all(childResponses.map(jsonData));
  const states = childData.map(statusOf);
  const usable = childData.filter(Boolean);
  const failedCount = states.filter(value => value === 'failed').length;
  const completedCount = states.filter(value => value === 'completed').length;
  const averageProgress = childData.length ? childData.reduce((sum, data) => sum + progressOf(data), 0) / childData.length : 0;

  if (failedCount === childData.length) {
    return jsonResponse(request, { jobId: id, status: 'FAILED', progress: 100, error: 'Tutti i batch interni del Music Director sono falliti.', metadata: { sonaraMusicDirector: VERSION, profile: state.profile } }, 502);
  }
  if (completedCount + failedCount < childData.length) {
    return jsonResponse(request, {
      jobId: id,
      status: 'PROCESSING',
      progress: Number(Math.min(94, averageProgress).toFixed(1)),
      stage: `Music Director ${state.profile.toUpperCase()}: generazione e selezione candidati`,
      metadata: { sonaraMusicDirector: VERSION, profile: state.profile, completedBatches: completedCount, failedBatches: failedCount, totalBatches: childData.length }
    });
  }

  let combined = await rankCombined(usable.filter(data => statusOf(data) === 'completed'), state.requested || {});
  if (!combined.ranked.length) {
    return jsonResponse(request, { jobId: id, status: 'FAILED', progress: 100, error: 'I batch sono terminati ma non hanno restituito audio utilizzabile.', metadata: { sonaraMusicDirector: VERSION, profile: state.profile } }, 502);
  }

  const best = combined.ranked[0];
  const bestScore = Number(best?.report?.professionalScore || 0);
  const needsRepair = state.spec?.autoRepair === true && (bestScore < Number(state.spec?.targetScore || PROFESSIONAL_RELEASE_SCORE) || best?.report?.professionalReleasePassed === false);

  if (needsRepair && !state.repairAttempted) {
    const repair = await submitRepair(request, env, ctx, state, best);
    state.repairAttempted = true;
    state.repairJobId = repair.jobId || '';
    state.preRepair = { bestScore, bestAudioUrl: best.url, summary: combined.summary };
    await saveState(env, id, state);
    if (repair.response.ok && repair.jobId) {
      return jsonResponse(request, {
        jobId: id,
        status: 'PROCESSING',
        progress: 96,
        stage: `Music Director ${state.profile.toUpperCase()}: Quality Repair automatico`,
        metadata: { sonaraMusicDirector: VERSION, profile: state.profile, automaticQualityRepair: true, preRepairBestScore: bestScore, professionalTargetScore: state.spec.targetScore }
      });
    }
  }

  if (state.repairJobId) {
    const response = await repairStatus(request, env, ctx, state.repairJobId);
    const repairData = await jsonData(response);
    const repairState = statusOf(repairData);
    if (repairState === 'processing') {
      return jsonResponse(request, {
        jobId: id,
        status: 'PROCESSING',
        progress: 96 + Math.min(3, progressOf(repairData) * 0.03),
        stage: `Music Director ${state.profile.toUpperCase()}: rifinitura finale`,
        metadata: { sonaraMusicDirector: VERSION, profile: state.profile, automaticQualityRepair: true }
      });
    }
    if (repairState === 'completed') {
      combined = await rankCombined([...usable.filter(data => statusOf(data) === 'completed'), repairData], state.requested || {});
    }
    state.repairJobId = '';
    await saveState(env, id, state);
  }

  const visible = combined.ranked.slice(0, 2).map((item, index) => ({
    ...(item.candidate && typeof item.candidate === 'object' ? item.candidate : { audioUrl: item.url }),
    audioUrl: item.url,
    sonaraQuality: item.report,
    sonaraRecommended: index === 0,
    releaseEligible: item.report?.professionalReleasePassed === true,
    directorRank: index + 1
  }));
  const generatedCount = combined.ranked.length;
  const base = usable.find(data => statusOf(data) === 'completed') || {};
  const result = {
    ...base,
    jobId: id,
    job_id: id,
    status: 'COMPLETED',
    progress: 100,
    candidates: visible,
    outputs: visible,
    sonaraQualityDirector: combined.summary,
    metadata: {
      ...(base?.metadata || {}),
      sonaraMusicDirector: VERSION,
      qualityDirector: QUALITY_DIRECTOR_VERSION,
      profile: state.profile,
      generatedCandidateCount: generatedCount,
      visibleCandidateCount: visible.length,
      automaticCandidateRanking: true,
      automaticQualityRepair: Boolean(state.repairAttempted),
      professionalTargetScore: state.spec?.targetScore,
      bestProfessionalScore: combined.summary?.bestProfessionalScore,
      releaseReady: Number(combined.summary?.bestProfessionalScore || 0) >= Number(state.spec?.targetScore || PROFESSIONAL_RELEASE_SCORE)
    }
  };
  if (result.data && typeof result.data === 'object') result.data = { ...result.data, jobId: id, status: 'COMPLETED', progress: 100, candidates: visible, outputs: visible, sonaraQualityDirector: combined.summary };
  state.completedResult = result;
  await saveState(env, id, state);
  return jsonResponse(request, result);
}

function directorCapabilities() {
  return {
    version: VERSION,
    defaultProfile: 'quality',
    profiles: {
      fast: { internalCandidates: 2, visibleCandidates: 2, autoRepair: false, targetProfessionalScore: 82 },
      quality: { internalCandidates: 4, visibleCandidates: 2, autoRepair: true, targetProfessionalScore: PROFESSIONAL_RELEASE_SCORE },
      ultra: { internalCandidates: 4, visibleCandidates: 2, autoRepair: true, targetProfessionalScore: 92 }
    },
    serverSideBlueprint: true,
    exactBpmKeyDurationLocks: true,
    arrangementDirector: true,
    vocalIdentityDirection: true,
    crossBatchProfessionalRanking: true,
    realWavQualityAnalysis: true,
    automaticQualityRepair: true,
    hiddenCandidateSelection: true
  };
}

function cors(request) {
  const origin = clean(request.headers.get('origin'));
  const allowed = new Set(['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', 'https://api.sonaraenterprise.com']);
  return {
    'access-control-allow-origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Profile-Id,X-Sonara-Project-Id',
    'access-control-expose-headers': 'X-Sonara-Music-Director',
    vary: 'Origin'
  };
}

function jsonResponse(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'private, no-store', 'x-sonara-music-director': VERSION, ...cors(request) }
  });
}

async function transformJson(response, transform) {
  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!type.includes('application/json')) return withVersion(response);
  try {
    const data = await response.clone().json();
    const next = await transform(data);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json; charset=UTF-8');
    headers.set('x-sonara-music-director', VERSION);
    return new Response(JSON.stringify(next), { status: response.status, statusText: response.statusText, headers });
  } catch { return withVersion(response); }
}

function withVersion(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-music-director', VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const PROFILE_UI = String.raw`<style id="sonara-director-v3-style">
#sonara-director-v3{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0 4px;padding:9px 10px;border:1px solid rgba(196,181,253,.18);border-radius:12px;background:linear-gradient(110deg,rgba(76,29,149,.14),rgba(67,56,202,.1),rgba(37,99,235,.08));font:700 10px/1.2 Inter,system-ui,sans-serif;color:#c4b5fd}
#sonara-director-v3 .sonara-director-buttons{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
#sonara-director-v3 button{border:1px solid rgba(196,181,253,.2);background:rgba(15,23,42,.62);color:#a5b4fc;border-radius:8px;padding:6px 8px;font:800 9px/1 Inter,system-ui,sans-serif;letter-spacing:.04em;cursor:pointer}
#sonara-director-v3 button[data-active="true"]{color:white;border-color:rgba(216,180,254,.6);background:linear-gradient(110deg,rgba(126,34,206,.72),rgba(79,70,229,.75),rgba(37,99,235,.72));box-shadow:0 4px 18px rgba(99,102,241,.2)}
</style><script id="sonara-director-v3-script">(()=>{if(window.__sonaraDirectorV3)return;window.__sonaraDirectorV3=true;const K='${PROFILE_KEY}',profiles=['fast','quality','ultra'];const get=()=>{const v=localStorage.getItem(K);return profiles.includes(v)?v:'quality'};const set=v=>{if(profiles.includes(v)){localStorage.setItem(K,v);render()}};const original=window.fetch.bind(window);window.fetch=async(input,init={})=>{try{const raw=typeof input==='string'?input:input instanceof URL?input.toString():input?.url||'';const u=new URL(raw,location.href);const method=String(init.method||(input instanceof Request?input.method:'GET')).toUpperCase();if(method==='POST'&&['/api/billing/generate','/api/engine/generate'].includes(u.pathname)){let body=null;if(typeof init.body==='string'){try{body=JSON.parse(init.body)}catch{}}else if(input instanceof Request){try{body=await input.clone().json()}catch{}}if(body&&typeof body==='object'){body.generationProfileV3=get();body.sonaraMusicDirectorV3='${VERSION}';body.sonaraDirectorBypass=false;const headers=new Headers(init.headers||(input instanceof Request?input.headers:{}));headers.set('content-type','application/json');const nextInit={...init,method:'POST',headers,body:JSON.stringify(body)};return original(raw,nextInit)}}}catch{}return original(input,init)};function render(){const prompt=document.getElementById('sonara-prompt');if(!prompt)return;let box=document.getElementById('sonara-director-v3');if(!box){box=document.createElement('div');box.id='sonara-director-v3';box.innerHTML='<span>AI QUALITY</span><div class="sonara-director-buttons"></div>';(prompt.parentElement||prompt).insertAdjacentElement('afterend',box)}const buttons=box.querySelector('.sonara-director-buttons');if(!buttons)return;buttons.innerHTML='';for(const p of profiles){const b=document.createElement('button');b.type='button';b.textContent=p.toUpperCase();b.dataset.active=String(p===get());b.title=p==='fast'?'2 candidati, massima velocità':p==='quality'?'4 candidati interni + ranking + repair':'4 candidati + selezione Ultra + repair';b.onclick=()=>set(p);buttons.appendChild(b)}}const start=()=>{render();new MutationObserver(()=>render()).observe(document.body||document.documentElement,{childList:true,subtree:true});setTimeout(render,800);setTimeout(render,2200)};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start()})();</script>`;

async function injectUi(request, response) {
  if (request.method !== 'GET' || !response.ok) return withVersion(response);
  const url = new URL(request.url);
  if (!['sonaraenterprise.com', 'www.sonaraenterprise.com'].includes(url.hostname)) return withVersion(response);
  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!type.includes('text/html')) return withVersion(response);
  const html = await response.text();
  if (html.includes('sonara-director-v3-script')) return new Response(html, response);
  const next = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${PROFILE_UI}</body>`) : `${html}${PROFILE_UI}`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store');
  headers.set('x-sonara-music-director', VERSION);
  return new Response(next, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && url.pathname === '/api/music/director/capabilities') return new Response(null, { status: 204, headers: cors(request) });
    if (request.method === 'GET' && url.pathname === '/api/music/director/capabilities') return jsonResponse(request, directorCapabilities());

    const match = url.pathname.match(JOB_RE);
    if (request.method === 'GET' && match) return directorJob(request, env, ctx, match[1]);

    if (request.method === 'POST' && GENERATE_PATHS.has(url.pathname)) return submitDirector(request, env, ctx);

    let response = await runtime.fetch(request, env, ctx);
    if (response.ok && HEALTH_PATHS.has(url.pathname)) {
      response = await transformJson(response, data => ({ ...data, sonaraMusicDirector: directorCapabilities() }));
    }
    return injectUi(request, response);
  }
};
