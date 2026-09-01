import director, { SonaraJobState, SonaraAuthStore } from './sonara-music-director-v3-entry.mjs';
import {
  QUALITY_DIRECTOR_VERSION,
  analyzeProfessionalCandidate,
  summarizeProfessionalReports
} from './sonara-quality-director-v2.mjs';

export { SonaraJobState, SonaraAuthStore };

const GUARD_VERSION = 'sonara-ultra-quality-guard-1';
const TARGET_SCORE = 92;
const MAX_EXTRA_REPAIRS = 2;
const STATE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/music-director-v3-ultra-guard/';
const JOB_RE = /^\/api\/(?:music|studio)\/job\/(director-v3-[A-Za-z0-9_-]+)$/;

const clean = value => String(value ?? '').trim();
const scoreOf = value => Number.isFinite(Number(value)) ? Number(value) : 0;

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

function audioUrl(item) {
  if (typeof item === 'string' && /^https:\/\//i.test(item)) return item;
  if (!item || typeof item !== 'object') return '';
  for (const value of [item.audioUrl, item.audio_url, item.url, item.downloadUrl, item.download_url, item.file]) {
    if (typeof value === 'string' && /^https:\/\//i.test(value)) return value;
  }
  return '';
}

function outputsOf(data) {
  const lists = [data?.outputs, data?.candidates, data?.data?.outputs, data?.data?.candidates];
  return lists.find(value => Array.isArray(value) && value.length) || [];
}

function reportsOf(data) {
  const lists = [
    data?.sonaraQualityDirector?.reports,
    data?.sonaraQualityJudge?.reports,
    data?.qualityJudge?.reports,
    data?.data?.sonaraQualityDirector?.reports,
    data?.data?.sonaraQualityJudge?.reports,
    data?.data?.qualityJudge?.reports
  ];
  return lists.find(value => Array.isArray(value) && value.length) || [];
}

function requestHints(data) {
  const report = reportsOf(data)[0] || {};
  return {
    bpm: Number.isFinite(Number(report?.requestedBpm)) ? Number(report.requestedBpm) : null,
    key: clean(report?.requestedKey),
    durationSec: Number.isFinite(Number(report?.durationVerification?.requestedDuration))
      ? Number(report.durationVerification.requestedDuration)
      : null
  };
}

function stateRequest(id) {
  return new Request(`${STATE_PREFIX}${encodeURIComponent(id)}`);
}

function stateStub(env, id) {
  try {
    const ns = env?.SONARA_JOB_STATE;
    return ns?.get && ns?.idFromName ? ns.get(ns.idFromName(`director-v3-ultra-guard:${id}`)) : null;
  } catch { return null; }
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

async function saveState(env, id, state) {
  const next = { ...state, updatedAt: Date.now() };
  const stub = stateStub(env, id);
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
    await caches.default.put(stateRequest(id), new Response(JSON.stringify(next), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=21600' }
    }));
  } catch {}
}

function headersFor(request, json = false) {
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('origin', 'https://sonaraenterprise.com');
  headers.set('referer', 'https://sonaraenterprise.com/');
  headers.set('cache-control', 'no-cache');
  headers.set('x-sonara-ultra-quality-guard', GUARD_VERSION);
  if (json) headers.set('content-type', 'application/json');
  return headers;
}

async function jsonData(response) {
  try { return await response.clone().json(); }
  catch { return null; }
}

function responseLike(request, sourceResponse, data, status = 200) {
  const headers = new Headers(sourceResponse?.headers || {});
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=UTF-8');
  headers.set('cache-control', 'private, no-store');
  headers.set('x-sonara-ultra-quality-guard', GUARD_VERSION);
  const origin = clean(request.headers.get('origin'));
  if (origin) headers.set('access-control-allow-origin', origin);
  return new Response(JSON.stringify(data), { status, headers });
}

function baseEntries(data) {
  const visible = outputsOf(data);
  const visibleByUrl = new Map(visible.map(item => [audioUrl(item), item]).filter(([url]) => url));
  const reports = reportsOf(data);
  const entries = [];
  const seen = new Set();
  for (const report of reports) {
    const url = clean(report?.audioUrl);
    if (!/^https:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    entries.push({
      url,
      candidate: visibleByUrl.get(url) || { audioUrl: url },
      report: { ...report, audioUrl: url }
    });
  }
  for (const candidate of visible) {
    const url = audioUrl(candidate);
    if (!url || seen.has(url)) continue;
    const report = candidate?.sonaraQuality || candidate?.quality || null;
    if (!report) continue;
    seen.add(url);
    entries.push({ candidate, url, report: { ...report, audioUrl: url } });
  }
  return entries;
}

function repairEntries(state) {
  return (Array.isArray(state?.repairResults) ? state.repairResults : []).map(item => ({
    url: clean(item?.audioUrl),
    candidate: { audioUrl: clean(item?.audioUrl), ultraRescue: true },
    report: item?.report || null
  })).filter(item => /^https:\/\//i.test(item.url) && item.report);
}

function rankEntries(entries, requested = {}) {
  const dedup = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry?.url || !entry?.report || seen.has(entry.url)) continue;
    seen.add(entry.url);
    dedup.push(entry);
  }
  const summary = summarizeProfessionalReports(dedup.map(item => item.report), requested);
  const byUrl = new Map(dedup.map(item => [item.url, item]));
  const ranked = summary.reports.map(report => byUrl.get(clean(report?.audioUrl))).filter(Boolean);
  return { ranked, summary };
}

async function submitRepair(request, env, ctx, source, state, requested) {
  const attempt = Number(state.attempts || 0) + 1;
  const url = new URL(request.url);
  url.pathname = '/api/studio/repair';
  url.search = '';
  const hard = Array.isArray(source?.report?.hardFailureReasons) ? source.report.hardFailureReasons.filter(Boolean) : [];
  const issues = [...new Set([
    ...hard,
    `ULTRA professional score ${scoreOf(source?.report?.professionalScore).toFixed(1)} below target ${TARGET_SCORE}`,
    'spectral balance',
    'transient definition',
    'micro-dynamics',
    'stereo depth',
    'ending integrity'
  ])];
  const preserveStrength = attempt === 1 ? 0.86 : 0.8;
  const body = {
    sourceAudioUrl: source.url,
    audioUrl: source.url,
    bpm: requested?.bpm,
    key: requested?.key,
    durationSec: requested?.durationSec,
    issues,
    preserveStrength,
    prompt: `SONARA ULTRA precision rescue pass ${attempt}. Preserve composition, hook, genre, BPM, key, arrangement, lyrics and singer identity. Improve only measurable release-quality defects. Target professional score ${TARGET_SCORE}+ without clipping or over-compression.`,
    qualityProfile: 'ultra',
    generationProfileV3: 'ultra',
    sonaraMusicDirectorV3: 'sonara-music-director-v3',
    sonaraUltraGuardAttempt: attempt
  };
  const response = await director.fetch(new Request(url.toString(), {
    method: 'POST',
    headers: headersFor(request, true),
    body: JSON.stringify(body),
    cache: 'no-store'
  }), env, ctx);
  const data = await jsonData(response);
  return { response, data, jobId: clean(data?.jobId || data?.job_id || data?.id), attempt, preserveStrength };
}

async function pollRepair(request, env, ctx, jobId) {
  const url = new URL(request.url);
  url.pathname = `/api/studio/job/${encodeURIComponent(jobId)}`;
  url.search = '';
  const response = await director.fetch(new Request(url.toString(), {
    method: 'GET',
    headers: headersFor(request),
    cache: 'no-store'
  }), env, ctx);
  return { response, data: await jsonData(response) };
}

async function analyzeRepairOutputs(data, requested) {
  const results = [];
  for (const output of outputsOf(data).slice(0, 3)) {
    const url = audioUrl(output);
    if (!url) continue;
    try {
      const report = await analyzeProfessionalCandidate(url, requested || {});
      results.push({ audioUrl: url, report: { ...report, audioUrl: url } });
    } catch (error) {
      results.push({
        audioUrl: url,
        report: {
          audioUrl: url,
          measuredFromRealWav: false,
          professionalScore: 0,
          professionalReleasePassed: false,
          hardFailureReasons: ['analysis-error'],
          error: error instanceof Error ? error.message : String(error),
          sonaraQualityDirector: QUALITY_DIRECTOR_VERSION
        }
      });
    }
  }
  return results;
}

function processingResult(base, state, repairData = null) {
  const progress = repairData ? 96 + Math.min(3, progressOf(repairData) * 0.03) : 96;
  return {
    ...base,
    status: 'PROCESSING',
    progress: Number(progress.toFixed(1)),
    stage: `Music Director ULTRA: precision rescue ${Math.max(1, Number(state.attempts || 0))}/${MAX_EXTRA_REPAIRS}`,
    metadata: {
      ...(base?.metadata || {}),
      profile: 'ultra',
      releaseReady: false,
      automaticQualityRepair: true,
      ultraQualityGuard: GUARD_VERSION,
      ultraExtraRepairAttempts: Number(state.attempts || 0),
      professionalTargetScore: TARGET_SCORE
    }
  };
}

function completedResult(base, state, ranked) {
  const visible = ranked.ranked.slice(0, 2).map((entry, index) => ({
    ...(entry.candidate && typeof entry.candidate === 'object' ? entry.candidate : { audioUrl: entry.url }),
    audioUrl: entry.url,
    sonaraQuality: entry.report,
    sonaraRecommended: index === 0,
    releaseEligible: entry.report?.professionalReleasePassed === true,
    directorRank: index + 1
  }));
  const baseGenerated = Number(base?.metadata?.generatedCandidateCount || reportsOf(base).length || 4);
  const bestScore = scoreOf(ranked.summary?.bestProfessionalScore);
  return {
    ...base,
    status: 'COMPLETED',
    progress: 100,
    candidates: visible,
    outputs: visible,
    sonaraQualityDirector: ranked.summary,
    metadata: {
      ...(base?.metadata || {}),
      profile: 'ultra',
      generatedCandidateCount: baseGenerated + (Array.isArray(state.repairResults) ? state.repairResults.length : 0),
      visibleCandidateCount: visible.length,
      automaticCandidateRanking: true,
      automaticQualityRepair: true,
      professionalTargetScore: TARGET_SCORE,
      bestProfessionalScore: bestScore,
      releaseReady: bestScore >= TARGET_SCORE,
      ultraQualityGuard: GUARD_VERSION,
      ultraExtraRepairAttempts: Number(state.attempts || 0)
    }
  };
}

async function guardUltraJob(request, env, ctx, id, innerResponse, base) {
  const meta = base?.metadata || {};
  if (statusOf(base) !== 'completed' || clean(meta.profile).toLowerCase() !== 'ultra') return innerResponse;
  if (scoreOf(meta.bestProfessionalScore ?? base?.sonaraQualityDirector?.bestProfessionalScore) >= TARGET_SCORE && meta.releaseReady === true) return innerResponse;

  const requested = requestHints(base);
  let state = await loadState(env, id) || { attempts: 0, repairJobId: '', repairResults: [], failures: [] };

  if (state.repairJobId) {
    const polled = await pollRepair(request, env, ctx, state.repairJobId);
    const repairState = statusOf(polled.data);
    if (repairState === 'processing') {
      return responseLike(request, innerResponse, processingResult(base, state, polled.data));
    }
    if (repairState === 'completed') {
      const analyzed = await analyzeRepairOutputs(polled.data, requested);
      state.repairResults = [...(Array.isArray(state.repairResults) ? state.repairResults : []), ...analyzed];
    } else {
      state.failures = [...(Array.isArray(state.failures) ? state.failures : []), `repair ${state.attempts} failed`].slice(-4);
    }
    state.repairJobId = '';
    await saveState(env, id, state);
  }

  let ranked = rankEntries([...baseEntries(base), ...repairEntries(state)], requested);
  let bestScore = scoreOf(ranked.summary?.bestProfessionalScore);
  if (bestScore >= TARGET_SCORE) {
    return responseLike(request, innerResponse, completedResult(base, state, ranked));
  }

  if (Number(state.attempts || 0) < MAX_EXTRA_REPAIRS && ranked.ranked.length) {
    const submitted = await submitRepair(request, env, ctx, ranked.ranked[0], state, requested);
    state.attempts = submitted.attempt;
    state.repairJobId = submitted.response.ok ? submitted.jobId : '';
    if (!submitted.response.ok || !submitted.jobId) {
      state.failures = [...(Array.isArray(state.failures) ? state.failures : []), `repair ${submitted.attempt} submit failed`].slice(-4);
    }
    await saveState(env, id, state);
    if (state.repairJobId) {
      return responseLike(request, innerResponse, processingResult(base, state));
    }
    ranked = rankEntries([...baseEntries(base), ...repairEntries(state)], requested);
    bestScore = scoreOf(ranked.summary?.bestProfessionalScore);
  }

  return responseLike(request, innerResponse, completedResult(base, state, ranked));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const match = request.method === 'GET' ? url.pathname.match(JOB_RE) : null;
    if (!match) return director.fetch(request, env, ctx);

    const innerResponse = await director.fetch(request, env, ctx);
    const type = clean(innerResponse.headers.get('content-type')).toLowerCase();
    if (!innerResponse.ok || !type.includes('application/json')) return innerResponse;
    const base = await jsonData(innerResponse);
    if (!base) return innerResponse;
    return guardUltraJob(request, env, ctx, match[1], innerResponse, base);
  }
};
