import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-vocal-refinement-guard.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-vocal-safe-report-aligner-1';
const SAFE_JOB_RE = /^\/api\/studio\/job\/(vocal-safe-[A-Za-z0-9_-]+)$/;
const MIN_RELEASE_SCORE = 88;
const MAX_TECHNICAL_REGRESSION = 1;
const clean = value => String(value ?? '').trim();

function criticalHardFailure(report) {
  const reasons = Array.isArray(report?.hardFailureReasons) ? report.hardFailureReasons : [];
  return reasons.some(reason => ['analysis-error', 'real-wav-analysis-missing', 'clipping', 'excessive-silence', 'dc-offset'].includes(clean(reason)));
}

function findReport(reports, url) {
  const target = clean(url);
  if (!target) return null;
  return reports.find(report => clean(report?.audioUrl) === target) || null;
}

async function alignSafeResult(response) {
  if (!response.ok || !clean(response.headers.get('content-type')).toLowerCase().includes('application/json')) return response;
  let payload;
  try { payload = await response.clone().json(); } catch { return response; }
  if (clean(payload?.status).toUpperCase() !== 'COMPLETED' || !payload?.vocalSafeGate) return response;

  const originalUrl = clean(payload.originalAudioUrl || payload?.metadata?.originalAudioUrl);
  const refinedUrl = clean(payload.refinedAudioUrl || payload?.metadata?.refinedAudioUrl);
  const gate = payload.vocalSafeGate || {};
  const reports = [gate.originalReport, gate.refinedReport].filter(Boolean);
  if (!originalUrl || !refinedUrl || reports.length < 2) return response;

  const originalReport = findReport(reports, originalUrl);
  const refinedReport = findReport(reports, refinedUrl);
  if (!originalReport || !refinedReport) return response;

  const originalScore = Number(originalReport.professionalScore || 0);
  const refinedScore = Number(refinedReport.professionalScore || 0);
  const delta = Number((refinedScore - originalScore).toFixed(1));
  const measured = refinedReport.measuredFromRealWav === true;
  const releaseSafe = measured && refinedScore >= MIN_RELEASE_SCORE && delta >= -MAX_TECHNICAL_REGRESSION && !criticalHardFailure(refinedReport);
  const selected = releaseSafe ? 'refined' : 'original';
  const selectedAudioUrl = releaseSafe ? refinedUrl : originalUrl;
  const alternate = releaseSafe ? originalUrl : refinedUrl;

  const next = {
    ...payload,
    audioUrl: selectedAudioUrl,
    audioUrls: [selectedAudioUrl, alternate].filter(Boolean),
    selectedVersion: selected,
    fallbackUsed: !releaseSafe,
    vocalSafeGate: {
      ...gate,
      reportAlignment: VERSION,
      reportsMatchedByAudioUrl: true,
      selected,
      reason: releaseSafe ? 'refined-passed-safe-gate' : 'refined-rejected-safe-gate',
      originalScore,
      refinedScore,
      technicalScoreDelta: delta,
      refinedMeasuredFromRealWav: measured,
      releaseSafe,
      originalReport,
      refinedReport
    },
    metadata: {
      ...(payload.metadata || {}),
      selectedVersion: selected,
      fallbackUsed: !releaseSafe,
      vocalSafeReportAlignment: VERSION
    }
  };

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=UTF-8');
  headers.set('cache-control', 'private, no-store');
  headers.set('x-sonara-vocal-safe-report-alignment', VERSION);
  return new Response(JSON.stringify(next), { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = await runtime.fetch(request, env, ctx);
    if (request.method === 'GET' && SAFE_JOB_RE.test(url.pathname)) return alignSafeResult(response);
    return response;
  }
};
