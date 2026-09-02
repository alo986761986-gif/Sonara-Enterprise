import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-vocal-safe-gate-report-aligner.mjs';
import {
  QUALITY_DIRECTOR_VERSION,
  PROFESSIONAL_RELEASE_SCORE,
  analyzeProfessionalCandidate,
  summarizeProfessionalReports
} from './sonara-quality-director-v2.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-quality-ultra-stability-1';
const STATE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/quality-ultra-stability-v1/';
const STATE_TTL = 6 * 60 * 60;
const JOB_RE = /^\/api\/music\/job\/(stable-qv1-[A-Za-z0-9_-]+)$/;
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const ALLOWED_AUDIO_HOSTS = new Set([
  'sonaraenterprise.com',
  'www.sonaraenterprise.com',
  'api.sonaraenterprise.com',
  'molab.sonaraenterprise.com'
]);
const MAX_TRANSIENT_POLLS = 5;
const PRIMARY_HARD_TIMEOUT_MS = 4 * 60 * 1000;
const SECONDARY_SOFT_TIMEOUT_MS = 90 * 1000;
const TOTAL_HARD_TIMEOUT_MS = 7 * 60 * 1000;

const clean = value => String(value ?? '').trim();
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;

function profileOf(body = {}) {
  const raw = clean(body.generationProfileV3 || body.renderProfile || body.generationProfile || body.qualityProfile || 'quality').toLowerCase();
  if (['ultra', 'max', 'studio', 'master'].includes(raw)) return 'ultra';
  if (['quality', 'high', 'pro'].includes(raw)) return 'quality';
  return 'fast';
}

function targetOf(profile) {
  return profile === 'ultra' ? 92 : PROFESSIONAL_RELEASE_SCORE;
}

function requested(body = {}) {
  return {
    bpm: numeric(body.sonaraExactRequestedBpm ?? body.requestedBpm ?? body.bpm),
    key: clean(body.key || body.key_scale || body.keySignature),
    durationSec: numeric(body.durationSec ?? body.duration ?? body.audio_duration)
  };
}

function newJobId() {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `stable-qv1-${Date.now().toString(36)}-${random[0].toString(36)}${random[1].toString(36)}`;
}

function stateRequest(jobId) {
  return new Request(`${STATE_PREFIX}${encodeURIComponent(jobId)}`);
}

function stateStub(env, jobId) {
  try {
    const ns = env?.SONARA_JOB_STATE;
    if (!ns?.idFromName || !ns?.get) return null;
    return ns.get(ns.idFromName(`quality-ultra-stability:${jobId}`));
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
      const response = await stub.fetch('https://sonara.internal/state');
      if (response.ok) return await response.json();
    } catch {}
  }
  try {
    const response = await caches.default.match(stateRequest(jobId));
    return response ? await response.json() : null;
  } catch { return null; }
}

function cors(request) {
  const origin = clean(request.headers.get('origin'));
  const allowed = new Set([
    'https://sonaraenterprise.com',
    'https://www.sonaraenterprise.com',
    'https://api.sonaraenterprise.com'
  ]);
  return {
    'access-control-allow-origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Profile-Id,X-Sonara-Project-Id,X-Sonara-Internal-Secret',
    'access-control-expose-headers': 'X-Sonara-Quality-Ultra-Stability',
    vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-quality-ultra-stability': VERSION,
      ...cors(request)
    }
  });
}

async function readJson(response) {
  try { return await response.clone().json(); }
  catch { return null; }
}

function extractJobId(data) {
  return clean(data?.jobId || data?.job_id || data?.id || data?.data?.jobId || data?.data?.job_id || data?.data?.id);
}

function statusOf(data, response = null) {
  if (!data) return response && !response.ok ? 'failed' : 'processing';
  const raw = clean(data?.status || data?.state || data?.data?.status || data?.data?.state).toLowerCase();
  if (['completed', 'complete', 'success', 'succeeded', 'done', 'finished', 'ready'].includes(raw)) return 'completed';
  if (['failed', 'error', 'cancelled', 'canceled', 'not_found'].includes(raw)) return 'failed';
  if (response && !response.ok && response.status < 500) return 'failed';
  return 'processing';
}

function progressOf(data) {
  const value = Number(data?.progress ?? data?.data?.progress ?? data?.metadata?.progress ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
}

function candidateArray(data) {
  const lists = [data?.candidates, data?.outputs, data?.data?.candidates, data?.data?.outputs, data?.result?.candidates, data?.result?.outputs];
  return lists.find(value => Array.isArray(value) && value.length) || [];
}

function candidateAudioUrl(item) {
  if (typeof item === 'string' && /^https:\/\//i.test(item)) return item;
  if (!item || typeof item !== 'object') return '';
  for (const value of [item.audioUrl, item.audio_url, item.url, item.downloadUrl, item.download_url, item.file]) {
    if (typeof value === 'string' && /^https:\/\//i.test(value)) return value;
  }
  return '';
}

function validAudio(value) {
  try {
    const url = new URL(clean(value));
    return url.protocol === 'https:' && ALLOWED_AUDIO_HOSTS.has(url.hostname) ? url.toString() : '';
  } catch { return ''; }
}

function transientPayload(response, data) {
  if (!data) return Boolean(response && [502, 503, 504].includes(response.status));
  const text = clean(data.error || data.message || data.detail).toLowerCase();
  return [502, 503, 504].includes(response?.status) || /non json|timeout|timed out|riconnessione|502|503|504/.test(text);
}

function makeVariantBody(body, profile, variantIndex) {
  const prompt = clean(body.prompt || body.creatorPrompt || body.rawPrompt || body.musicPrompt);
  const direction = variantIndex === 0
    ? 'Candidate batch A: prioritize hook strength, groove, vocal clarity, coherent arrangement and clean release-ready balance.'
    : 'Candidate batch B: preserve the exact genre, BPM, key, lyrics and singer identity, but use a different melody, voicing, transitions, fills and timbral balance.';
  const fidelity = profile === 'ultra'
    ? 'ULTRA: maximize realism, transient detail, depth, natural vocals, human micro-variation and mastering polish without changing the creator intent.'
    : 'QUALITY: prioritize authentic genre language, strong songwriting, natural dynamics, clean transients and release-ready balance.';
  return {
    ...body,
    sonaraDirectorBypass: true,
    sonaraQualityUltraStability: VERSION,
    sonaraStabilityProfile: profile,
    sonaraStabilityVariant: variantIndex,
    candidateCount: 2,
    candidate_count: 2,
    dualFast: true,
    seed: Number(body.seed) > 0 ? Math.floor(Number(body.seed)) + variantIndex * 104729 : undefined,
    prompt: [prompt, `SONARA ${profile.toUpperCase()} STABILITY DIRECTOR.`, fidelity, direction].filter(Boolean).join('\n\n').slice(0, 12000)
  };
}

function buildChildRequest(request, body, path = null, env = null) {
  const url = new URL(request.url);
  if (path) url.pathname = path;
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-quality-ultra-stability', VERSION);
  if (path === '/api/engine/generate') {
    const secret = clean(env?.SONARA_INTERNAL_PROXY_SECRET);
    if (secret) headers.set('X-Sonara-Internal-Secret', secret);
  }
  return new Request(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
    redirect: request.redirect
  });
}

async function pollChild(request, env, ctx, childJobId) {
  const url = new URL(request.url);
  url.pathname = `/api/music/job/${encodeURIComponent(childJobId)}`;
  const headers = new Headers(request.headers);
  headers.set('cache-control', 'no-cache');
  return runtime.fetch(new Request(url.toString(), { method: 'GET', headers, cache: 'no-store' }), env, ctx);
}

function reportUsable(report) {
  return Boolean(report && report.measuredFromRealWav === true && Number.isFinite(Number(report.professionalScore)));
}

function cacheReportReady(report) {
  return Boolean(reportUsable(report) || report?.qualityAnalysisAttempted === true);
}

function candidateEntries(children = []) {
  const entries = [];
  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const candidates = candidateArray(children[childIndex]);
    for (let localIndex = 0; localIndex < candidates.length; localIndex += 1) {
      const candidate = candidates[localIndex];
      const url = validAudio(candidateAudioUrl(candidate));
      if (url) entries.push({ candidate, url, childIndex, localIndex });
    }
  }
  return entries;
}

async function warmNextQualityReport(children, req, state, env, jobId) {
  const entries = candidateEntries(children);
  let cacheChanged = false;

  for (const entry of entries) {
    const cached = state.qualityReportCache?.[entry.url] || null;
    if (cacheReportReady(cached)) continue;

    const embedded = [entry.candidate?.sonaraQuality, entry.candidate?.quality].find(reportUsable) || null;
    if (embedded) {
      state.qualityReportCache[entry.url] = {
        ...embedded,
        audioUrl: entry.url,
        qualityAnalysisAttempted: true
      };
      cacheChanged = true;
      continue;
    }

    let report;
    try {
      report = await analyzeProfessionalCandidate(entry.url, req);
    } catch (error) {
      report = {
        audioUrl: entry.url,
        measuredFromRealWav: false,
        professionalScore: 0,
        professionalReleasePassed: false,
        hardFailureReasons: ['analysis-error'],
        error: error instanceof Error ? error.message : String(error)
      };
    }

    state.qualityReportCache[entry.url] = {
      ...report,
      audioUrl: entry.url,
      qualityAnalysisAttempted: true
    };
    await saveState(env, jobId, state);
    const cachedCount = entries.filter(item => cacheReportReady(state.qualityReportCache?.[item.url])).length;
    return { warmed: true, total: entries.length, cachedCount };
  }

  if (cacheChanged) await saveState(env, jobId, state);
  return {
    warmed: false,
    total: entries.length,
    cachedCount: entries.filter(item => cacheReportReady(state.qualityReportCache?.[item.url])).length
  };
}

function mergeQualityCache(cache, ranked = []) {
  const next = cache && typeof cache === 'object' && !Array.isArray(cache) ? { ...cache } : {};
  for (const item of ranked) {
    const url = clean(item?.url);
    const report = item?.report;
    if (!url || !report || typeof report !== 'object') continue;
    next[url] = report;
  }
  return next;
}

async function rankChildren(children, req, cachedReports = {}) {
  const cache = cachedReports && typeof cachedReports === 'object' && !Array.isArray(cachedReports) ? cachedReports : {};
  const joined = [];
  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const candidates = candidateArray(children[childIndex]);
    for (let localIndex = 0; localIndex < candidates.length; localIndex += 1) {
      const candidate = candidates[localIndex];
      const audioUrl = validAudio(candidateAudioUrl(candidate));
      if (!audioUrl) continue;
      let report = cache[audioUrl] || candidate?.sonaraQuality || candidate?.quality || null;
      if (!cacheReportReady(report)) {
        try {
          report = {
            ...(await analyzeProfessionalCandidate(audioUrl, req)),
            qualityAnalysisAttempted: true
          };
        } catch (error) {
          report = {
            audioUrl,
            measuredFromRealWav: false,
            professionalScore: 0,
            professionalReleasePassed: false,
            hardFailureReasons: ['analysis-error'],
            error: error instanceof Error ? error.message : String(error),
            qualityAnalysisAttempted: true
          };
        }
      }
      joined.push({
        candidate,
        url: audioUrl,
        report: { ...report, audioUrl, candidateIndex: joined.length, childIndex, localIndex }
      });
    }
  }
  const summary = summarizeProfessionalReports(joined.map(item => item.report), req);
  const byUrl = new Map(joined.map(item => [item.url, item]));
  const ranked = summary.reports.map(report => byUrl.get(clean(report.audioUrl))).filter(Boolean);
  return { ranked, summary };
}

async function finalize(request, env, jobId, state, childData, extra = {}) {
  const completed = childData.filter(Boolean).filter(data => statusOf(data) === 'completed');
  const warm = await warmNextQualityReport(completed, state.requested || {}, state, env, jobId);
  if (warm.warmed) {
    const progress = state.secondaryJobId ? Math.min(98, 92 + warm.cachedCount * 1.5) : Math.min(99, 94 + warm.cachedCount * 2);
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: Number(progress.toFixed(1)),
      stage: `SONARA ${state.profile.toUpperCase()}: analisi qualità WAV serializzata`,
      metadata: {
        profile: state.profile,
        stabilityGuard: VERSION,
        incrementalQualityAnalysis: true,
        maxQualityAnalysesPerPoll: 1,
        cachedQualityReports: warm.cachedCount,
        totalQualityReports: warm.total,
        ...extra
      }
    });
  }

  const combined = await rankChildren(completed, state.requested || {}, state.qualityReportCache || {});
  state.qualityReportCache = mergeQualityCache(state.qualityReportCache, combined.ranked);
  if (!combined.ranked.length) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 100,
      retryable: true,
      error: 'QUALITY/ULTRA non ha restituito audio utilizzabile. Riprova: nessun job restera bloccato.',
      metadata: { profile: state.profile, stabilityGuard: VERSION, ...extra }
    }, 502);
  }

  const visible = combined.ranked.slice(0, 2).map((item, index) => ({
    ...(item.candidate && typeof item.candidate === 'object' ? item.candidate : {}),
    audioUrl: item.url,
    sonaraQuality: item.report,
    sonaraRecommended: index === 0,
    releaseEligible: item.report?.professionalReleasePassed === true,
    directorRank: index + 1
  }));
  const target = Number(state.targetScore || targetOf(state.profile));
  const bestScore = Number(combined.summary?.bestProfessionalScore || 0);
  const result = {
    jobId,
    job_id: jobId,
    status: 'COMPLETED',
    progress: 100,
    audioUrl: visible[0]?.audioUrl || null,
    audioUrls: visible.map(item => item.audioUrl),
    candidates: visible,
    outputs: visible,
    sonaraQualityDirector: combined.summary,
    metadata: {
      sonaraQualityUltraStability: VERSION,
      qualityDirector: QUALITY_DIRECTOR_VERSION,
      profile: state.profile,
      generatedCandidateCount: combined.ranked.length,
      visibleCandidateCount: visible.length,
      automaticCandidateRanking: true,
      adaptiveSequentialBatches: true,
      concurrentBatches: false,
      incrementalQualityAnalysis: true,
      maxQualityAnalysesPerPoll: 1,
      qualityCachePrecedence: true,
      cachedQualityReports: Object.keys(state.qualityReportCache || {}).length,
      professionalTargetScore: target,
      bestProfessionalScore: bestScore,
      releaseReady: bestScore >= target,
      secondaryBatchUsed: Boolean(state.secondaryJobId),
      ...extra
    }
  };
  state.completedResult = result;
  await saveState(env, jobId, state);
  return json(request, result);
}

async function submitSecondary(request, env, ctx, state, jobId) {
  const body = makeVariantBody(state.originalBody || {}, state.profile, 1);
  const response = await runtime.fetch(buildChildRequest(request, body, '/api/engine/generate', env), env, ctx);
  const data = await readJson(response);
  const childJobId = extractJobId(data);
  state.secondarySubmittedAt = Date.now();
  state.secondaryJobId = response.ok && childJobId ? childJobId : '';
  state.secondarySubmitFailed = !state.secondaryJobId;
  state.secondarySubmitStatus = response.status;
  await saveState(env, jobId, state);
  return { response, data, childJobId: state.secondaryJobId };
}

async function startStable(request, env, ctx, body, profile) {
  const primaryBody = makeVariantBody(body, profile, 0);
  const primaryResponse = await runtime.fetch(buildChildRequest(request, primaryBody, null, env), env, ctx);
  const primaryData = await readJson(primaryResponse);
  const primaryJobId = extractJobId(primaryData);
  if (!primaryResponse.ok || !primaryJobId) return primaryResponse;

  const jobId = newJobId();
  const state = {
    jobId,
    profile,
    targetScore: targetOf(profile),
    requested: requested(body),
    originalBody: body,
    primaryJobId,
    secondaryJobId: '',
    secondarySubmittedAt: 0,
    secondarySubmitFailed: false,
    primaryTransientPolls: 0,
    secondaryTransientPolls: 0,
    qualityReportCache: {},
    createdAt: Date.now(),
    completedResult: null
  };
  await saveState(env, jobId, state);

  return json(request, {
    jobId,
    job_id: jobId,
    status: 'QUEUED',
    progress: 4,
    metadata: {
      sonaraQualityUltraStability: VERSION,
      profile,
      adaptiveSequentialBatches: true,
      concurrentBatches: false,
      cachedQualityReports: true,
      incrementalQualityAnalysis: true,
      maxQualityAnalysesPerPoll: 1,
      qualityCachePrecedence: true,
      generatedCandidateTarget: 4,
      visibleCandidateTarget: 2,
      professionalTargetScore: state.targetScore,
      currentStage: `SONARA ${profile.toUpperCase()}: primo batch sicuro avviato`
    }
  }, 202);
}

async function stableJob(request, env, ctx, jobId) {
  const state = await loadState(env, jobId);
  if (!state) return json(request, { jobId, status: 'NOT_FOUND', error: 'Job QUALITY/ULTRA non trovato o scaduto.' }, 404);
  if (state.completedResult) return json(request, state.completedResult);
  if (!state.qualityReportCache || typeof state.qualityReportCache !== 'object' || Array.isArray(state.qualityReportCache)) state.qualityReportCache = {};

  const age = Date.now() - Number(state.createdAt || Date.now());
  if (age > TOTAL_HARD_TIMEOUT_MS) {
    const data = [];
    if (state.primaryJobId) {
      const r = await pollChild(request, env, ctx, state.primaryJobId);
      const d = await readJson(r);
      if (statusOf(d, r) === 'completed') data.push(d);
    }
    if (state.secondaryJobId) {
      const r = await pollChild(request, env, ctx, state.secondaryJobId);
      const d = await readJson(r);
      if (statusOf(d, r) === 'completed') data.push(d);
    }
    if (data.length) return finalize(request, env, jobId, state, data, { hardTimeoutFallback: true });
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 100,
      retryable: true,
      error: 'QUALITY/ULTRA ha superato il limite anti-stallo. Il job e stato chiuso invece di restare bloccato.',
      metadata: { profile: state.profile, stabilityGuard: VERSION, hardTimeout: true }
    }, 504);
  }

  const primaryResponse = await pollChild(request, env, ctx, state.primaryJobId);
  const primaryData = await readJson(primaryResponse);
  const primaryStatus = statusOf(primaryData, primaryResponse);

  if (primaryStatus === 'processing') {
    const transient = transientPayload(primaryResponse, primaryData);
    state.primaryTransientPolls = transient ? Number(state.primaryTransientPolls || 0) + 1 : 0;
    await saveState(env, jobId, state);
    if (state.primaryTransientPolls >= MAX_TRANSIENT_POLLS || age > PRIMARY_HARD_TIMEOUT_MS) {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 100,
        retryable: true,
        error: 'MoLab non sta avanzando nel primo batch QUALITY/ULTRA. Il job e stato chiuso automaticamente: puoi rigenerare senza refresh della pagina.',
        metadata: { profile: state.profile, stabilityGuard: VERSION, transientPolls: state.primaryTransientPolls }
      }, 504);
    }
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: Number(Math.min(48, 6 + progressOf(primaryData) * 0.44).toFixed(1)),
      stage: `SONARA ${state.profile.toUpperCase()}: primo batch MoLab`,
      metadata: {
        profile: state.profile,
        stabilityGuard: VERSION,
        adaptiveSequentialBatches: true,
        concurrentBatches: false,
        primaryTransientPolls: state.primaryTransientPolls
      }
    });
  }

  if (primaryStatus === 'completed' && !state.secondaryJobId && !state.secondarySubmitFailed) {
    const warm = await warmNextQualityReport([primaryData], state.requested || {}, state, env, jobId);
    if (warm.warmed) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: Number(Math.min(50, 47 + warm.cachedCount).toFixed(1)),
        stage: `SONARA ${state.profile.toUpperCase()}: analisi qualità primo batch`,
        metadata: {
          profile: state.profile,
          stabilityGuard: VERSION,
          incrementalQualityAnalysis: true,
          maxQualityAnalysesPerPoll: 1,
          cachedQualityReports: warm.cachedCount,
          totalQualityReports: warm.total
        }
      });
    }

    const primaryRank = await rankChildren([primaryData], state.requested || {}, state.qualityReportCache);
    state.qualityReportCache = mergeQualityCache(state.qualityReportCache, primaryRank.ranked);
    await saveState(env, jobId, state);
    const bestScore = Number(primaryRank.summary?.bestProfessionalScore || 0);
    if (primaryRank.ranked.length && bestScore >= Number(state.targetScore) && primaryRank.ranked[0]?.report?.professionalReleasePassed === true) {
      return finalize(request, env, jobId, state, [primaryData], {
        adaptiveEarlyRelease: true,
        secondaryBatchSkippedBecauseTargetPassed: true,
        primaryQualityReportsReused: true
      });
    }
    const secondary = await submitSecondary(request, env, ctx, state, jobId);
    if (!secondary.childJobId) {
      return finalize(request, env, jobId, state, [primaryData], {
        secondaryBatchDegraded: true,
        secondarySubmitStatus: secondary.response?.status || 0,
        primaryQualityReportsReused: true
      });
    }
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 52,
      stage: `SONARA ${state.profile.toUpperCase()}: secondo batch avviato in sequenza`,
      metadata: {
        profile: state.profile,
        stabilityGuard: VERSION,
        adaptiveSequentialBatches: true,
        concurrentBatches: false,
        incrementalQualityAnalysis: true,
        maxQualityAnalysesPerPoll: 1,
        cachedQualityReports: Object.keys(state.qualityReportCache || {}).length,
        primaryTargetMissedScore: bestScore
      }
    });
  }

  if (primaryStatus === 'failed' && !state.secondaryJobId && !state.secondarySubmitFailed) {
    const secondary = await submitSecondary(request, env, ctx, state, jobId);
    if (!secondary.childJobId) return primaryResponse;
  }

  if (!state.secondaryJobId) {
    if (primaryStatus === 'completed') return finalize(request, env, jobId, state, [primaryData], { secondaryBatchDegraded: true });
    return primaryResponse;
  }

  const secondaryResponse = await pollChild(request, env, ctx, state.secondaryJobId);
  const secondaryData = await readJson(secondaryResponse);
  const secondaryStatus = statusOf(secondaryData, secondaryResponse);
  const secondaryAge = Date.now() - Number(state.secondarySubmittedAt || Date.now());

  if (secondaryStatus === 'processing') {
    const transient = transientPayload(secondaryResponse, secondaryData);
    state.secondaryTransientPolls = transient ? Number(state.secondaryTransientPolls || 0) + 1 : 0;
    await saveState(env, jobId, state);
    if (primaryStatus === 'completed' && (state.secondaryTransientPolls >= MAX_TRANSIENT_POLLS || secondaryAge > SECONDARY_SOFT_TIMEOUT_MS)) {
      return finalize(request, env, jobId, state, [primaryData], {
        secondaryBatchTimedOut: true,
        secondaryTransientPolls: state.secondaryTransientPolls,
        primaryQualityReportsReused: true
      });
    }
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: Number(Math.min(90, 52 + progressOf(secondaryData) * 0.38).toFixed(1)),
      stage: `SONARA ${state.profile.toUpperCase()}: secondo batch sequenziale`,
      metadata: {
        profile: state.profile,
        stabilityGuard: VERSION,
        adaptiveSequentialBatches: true,
        concurrentBatches: false,
        incrementalQualityAnalysis: true,
        maxQualityAnalysesPerPoll: 1,
        cachedQualityReports: Object.keys(state.qualityReportCache || {}).length,
        secondaryTransientPolls: state.secondaryTransientPolls
      }
    });
  }

  const completed = [];
  if (primaryStatus === 'completed') completed.push(primaryData);
  if (secondaryStatus === 'completed') completed.push(secondaryData);
  if (completed.length) {
    return finalize(request, env, jobId, state, completed, {
      secondaryBatchUsed: true,
      secondaryBatchFailed: secondaryStatus === 'failed',
      primaryQualityReportsReused: true
    });
  }

  return json(request, {
    jobId,
    status: 'FAILED',
    progress: 100,
    retryable: true,
    error: 'Entrambi i batch QUALITY/ULTRA sono terminati senza audio utilizzabile.',
    metadata: { profile: state.profile, stabilityGuard: VERSION }
  }, 502);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname === '/api/music/stability/capabilities') {
      return new Response(null, { status: 204, headers: cors(request) });
    }
    if (request.method === 'GET' && url.pathname === '/api/music/stability/capabilities') {
      return json(request, {
        version: VERSION,
        qualityUltraAntiStall: true,
        adaptiveSequentialBatches: true,
        concurrentBatches: false,
        qualityReportCache: true,
        qualityCachePrecedence: true,
        incrementalQualityAnalysis: true,
        maxQualityAnalysesPerPoll: 1,
        maxTransientPolls: MAX_TRANSIENT_POLLS,
        primaryHardTimeoutMs: PRIMARY_HARD_TIMEOUT_MS,
        secondarySoftTimeoutMs: SECONDARY_SOFT_TIMEOUT_MS,
        totalHardTimeoutMs: TOTAL_HARD_TIMEOUT_MS
      });
    }

    const match = request.method === 'GET' ? url.pathname.match(JOB_RE) : null;
    if (match) return stableJob(request, env, ctx, match[1]);

    if (request.method === 'POST' && GENERATE_PATHS.has(url.pathname)) {
      const type = clean(request.headers.get('content-type')).toLowerCase();
      if (!type.includes('application/json')) return runtime.fetch(request, env, ctx);
      let body;
      try { body = await request.clone().json(); }
      catch { return runtime.fetch(request, env, ctx); }
      if (body?.sonaraDirectorBypass === true) return runtime.fetch(request, env, ctx);
      const profile = profileOf(body);
      if (profile === 'quality' || profile === 'ultra') return startStable(request, env, ctx, body, profile);
    }

    return runtime.fetch(request, env, ctx);
  }
};