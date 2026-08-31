import { analyzeAudioCandidate as analyzeAudioCandidateV1 } from './sonara-audio-quality-engine.mjs';

export const QUALITY_DIRECTOR_VERSION = 'sonara-engine-quality-2.0';
export const PROFESSIONAL_RELEASE_SCORE = 88;
export const PROFESSIONAL_REVIEW_SCORE = 78;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const round = (value, digits = 1) => Number(Number(value || 0).toFixed(digits));
const finite = value => value === null || value === undefined || String(value).trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const clean = value => String(value ?? '').trim();

function rangeScore(value, idealMin, idealMax, outerMin, outerMax, maxPoints) {
  const number = finite(value);
  if (number === null) return maxPoints * 0.35;
  if (number >= idealMin && number <= idealMax) return maxPoints;
  if (number <= outerMin || number >= outerMax) return 0;
  if (number < idealMin) return maxPoints * ((number - outerMin) / Math.max(0.0001, idealMin - outerMin));
  return maxPoints * ((outerMax - number) / Math.max(0.0001, outerMax - idealMax));
}

function durationVerdict(report, requested = {}) {
  const requestedDuration = finite(requested.durationSec ?? requested.duration ?? requested.audio_duration);
  const actualDuration = finite(report.declaredDurationSec);
  if (requestedDuration === null || actualDuration === null || requestedDuration <= 0) {
    return { requestedDuration: null, actualDuration, errorSec: null, passed: null, points: 5 };
  }
  const errorSec = Math.abs(actualDuration - requestedDuration);
  const tolerance = Math.max(4, requestedDuration * 0.08);
  const outer = Math.max(15, requestedDuration * 0.25);
  const points = errorSec <= tolerance ? 10 : clamp(10 * (1 - ((errorSec - tolerance) / Math.max(1, outer - tolerance))), 0, 10);
  return {
    requestedDuration: round(requestedDuration, 2),
    actualDuration: round(actualDuration, 2),
    errorSec: round(errorSec, 2),
    toleranceSec: round(tolerance, 2),
    passed: errorSec <= tolerance,
    points: round(points, 2)
  };
}

function signalDimension(report) {
  const clipping = finite(report.clippingRatio) ?? 1;
  const silence = finite(report.silenceRatio) ?? 1;
  const dc = Math.abs(finite(report.dcOffset) ?? 1);
  const peakDb = finite(report.peakDb);

  const clippingPoints = clipping <= 0.00005 ? 9 : clamp(9 - clipping * 18000, 0, 9);
  const silencePoints = silence <= 0.04 ? 6 : clamp(6 - Math.max(0, silence - 0.04) * 30, 0, 6);
  const dcPoints = dc <= 0.002 ? 5 : clamp(5 - dc * 220, 0, 5);
  const peakPoints = rangeScore(peakDb, -9, -0.2, -24, 0.6, 5);
  return round(clippingPoints + silencePoints + dcPoints + peakPoints, 2);
}

function dynamicsDimension(report) {
  const crest = rangeScore(report.crestDb, 7, 18, 3, 28, 8);
  const rms = rangeScore(report.rmsDb, -24, -7, -42, -2, 7);
  return round(crest + rms, 2);
}

function tempoDimension(report, requested = {}) {
  const requestedBpm = finite(requested.bpm ?? requested.requestedBpm ?? report.requestedBpm);
  if (requestedBpm === null) {
    const confidence = clamp(finite(report.bpmConfidence) ?? 0, 0, 1);
    return round(16 + confidence * 9, 2);
  }
  const error = finite(report.bpmError);
  if (report.bpmPassed === true) {
    const confidence = clamp(finite(report.bpmConfidence) ?? 0.5, 0, 1);
    return round(22 + confidence * 3, 2);
  }
  if (error === null) return 0;
  return round(clamp(20 - error * 4, 0, 20), 2);
}

function harmonicDimension(report, requested = {}) {
  const requestedKey = clean(requested.key ?? requested.key_scale ?? report.requestedKey);
  if (!requestedKey) return 7;
  if (report.keyComparable !== true) return 5;
  if (report.keyPassed === true) return round(8 + clamp(finite(report.keyConfidence) ?? 0, 0, 1) * 2, 2);
  return clamp((finite(report.keyConfidence) ?? 0) < 0.3 ? 4 : 1, 0, 10);
}

function formatDimension(report) {
  const sampleRate = finite(report.sampleRate) ?? 0;
  const channels = finite(report.channels) ?? 0;
  const bitDepth = finite(report.bitDepth) ?? 0;
  const samplePoints = sampleRate >= 48000 ? 4 : sampleRate >= 44100 ? 3.5 : sampleRate >= 32000 ? 2 : 0;
  const channelPoints = channels >= 2 ? 3 : channels === 1 ? 2 : 0;
  const depthPoints = bitDepth >= 24 ? 3 : bitDepth >= 16 ? 2.5 : bitDepth > 0 ? 1 : 0;
  return round(samplePoints + channelPoints + depthPoints, 2);
}

function reliabilityDimension(report) {
  if (clean(report.error)) return 0;
  if (report.measuredFromRealWav !== true) return 0;
  const analyzed = finite(report.analyzedSeconds) ?? 0;
  return analyzed >= 30 ? 5 : analyzed >= 10 ? 4 : analyzed > 0 ? 2 : 0;
}

function hardFailures(report, requested = {}, duration = durationVerdict(report, requested)) {
  const reasons = [];
  if (report.measuredFromRealWav !== true) reasons.push('real-wav-analysis-missing');
  if (clean(report.error)) reasons.push('analysis-error');
  if ((finite(report.clippingRatio) ?? 1) > 0.0005) reasons.push('clipping');
  if ((finite(report.silenceRatio) ?? 1) > 0.22) reasons.push('excessive-silence');
  if (Math.abs(finite(report.dcOffset) ?? 1) > 0.02) reasons.push('dc-offset');
  if ((finite(report.peakDb) ?? -120) < -28) reasons.push('signal-too-quiet');
  const requestedBpm = finite(requested.bpm ?? requested.requestedBpm ?? report.requestedBpm);
  if (requestedBpm !== null && report.bpmPassed !== true) reasons.push('bpm-lock-failed');
  if (duration.passed === false && duration.errorSec > Math.max(8, Number(duration.toleranceSec || 0) * 1.5)) reasons.push('duration-lock-failed');
  return reasons;
}

function repairPlanFor(report, reasons = []) {
  const plan = [];
  if (reasons.includes('bpm-lock-failed')) plan.push('Regenerate or repair with the requested BPM hard-locked to the full-time master clock.');
  if (reasons.includes('clipping')) plan.push('Reduce clipping and reconstruct damaged transients while preserving arrangement and singer identity.');
  if (reasons.includes('excessive-silence')) plan.push('Repair silence gaps, broken tails and malformed section transitions.');
  if (reasons.includes('dc-offset')) plan.push('Remove DC offset and rebalance the waveform around zero.');
  if (reasons.includes('signal-too-quiet')) plan.push('Restore release-level gain without crushing dynamics or adding clipping.');
  if (reasons.includes('duration-lock-failed')) plan.push('Regenerate the ending or continuation so final duration matches the requested song length.');
  if (report.keyComparable === true && report.keyPassed === false && (finite(report.keyConfidence) ?? 0) >= 0.3) {
    plan.push('Review tonal center and reharmonize only if the detected key mismatch is musically confirmed.');
  }
  if (!plan.length && Number(report.professionalScore || report.qualityScore || 0) < PROFESSIONAL_RELEASE_SCORE) {
    plan.push('Run SONARA Quality Repair while preserving composition, selected style, BPM, lyrics and identity.');
  }
  return plan;
}

export function enrichQualityReport(report = {}, requested = {}) {
  const duration = durationVerdict(report, requested);
  const dimensions = {
    tempo: tempoDimension(report, requested),
    signalIntegrity: signalDimension(report),
    dynamics: dynamicsDimension(report),
    harmony: harmonicDimension(report, requested),
    format: formatDimension(report),
    duration: duration.points,
    reliability: reliabilityDimension(report)
  };
  const total = round(clamp(Object.values(dimensions).reduce((sum, value) => sum + Number(value || 0), 0), 0, 100), 1);
  const hardFailureReasons = hardFailures(report, requested, duration);
  const professionalReleasePassed = hardFailureReasons.length === 0 && total >= PROFESSIONAL_RELEASE_SCORE;
  const reviewPassed = hardFailureReasons.length === 0 && total >= PROFESSIONAL_REVIEW_SCORE;
  const tier = professionalReleasePassed ? 'release-ready' : reviewPassed ? 'review' : total >= 65 ? 'repair' : 'reject';
  const enriched = {
    ...report,
    sonaraQualityDirector: QUALITY_DIRECTOR_VERSION,
    qualityDirectorVersion: QUALITY_DIRECTOR_VERSION,
    professionalScore: total,
    professionalReleaseScore: PROFESSIONAL_RELEASE_SCORE,
    professionalReleasePassed,
    professionalTier: tier,
    professionalDimensions: dimensions,
    durationVerification: duration,
    hardFailureReasons
  };
  return { ...enriched, repairPlan: repairPlanFor(enriched, hardFailureReasons) };
}

export async function analyzeProfessionalCandidate(audioUrl, requested = {}, fetchImpl = fetch) {
  const base = await analyzeAudioCandidateV1(audioUrl, requested, fetchImpl);
  return enrichQualityReport(base, requested);
}

export function rankProfessionalReports(reports = [], requested = {}) {
  return reports.map(report => report?.sonaraQualityDirector === QUALITY_DIRECTOR_VERSION ? report : enrichQualityReport(report, requested)).sort((a, b) => {
    if (Boolean(a.professionalReleasePassed) !== Boolean(b.professionalReleasePassed)) return a.professionalReleasePassed ? -1 : 1;
    if (Boolean(a.bpmPassed) !== Boolean(b.bpmPassed)) return a.bpmPassed ? -1 : 1;
    if (Number(a.professionalScore || 0) !== Number(b.professionalScore || 0)) return Number(b.professionalScore || 0) - Number(a.professionalScore || 0);
    return Number(b.qualityScore || 0) - Number(a.qualityScore || 0);
  });
}

export function summarizeProfessionalReports(reports = [], requested = {}) {
  const ranked = rankProfessionalReports(reports, requested);
  const best = ranked[0] || null;
  const passed = ranked.filter(report => report.professionalReleasePassed === true).length;
  const measured = ranked.filter(report => report.measuredFromRealWav === true).length;
  const average = ranked.length ? round(ranked.reduce((sum, report) => sum + Number(report.professionalScore || 0), 0) / ranked.length, 1) : 0;
  return {
    version: QUALITY_DIRECTOR_VERSION,
    releaseScore: PROFESSIONAL_RELEASE_SCORE,
    total: ranked.length,
    measured,
    passed,
    failed: ranked.length - passed,
    passRate: ranked.length ? round((passed / ranked.length) * 100, 1) : 0,
    averageProfessionalScore: average,
    bestProfessionalScore: best?.professionalScore ?? null,
    bestCandidateIndex: best?.candidateIndex ?? best?.outputIndex ?? best?.index ?? null,
    bestTier: best?.professionalTier ?? null,
    automaticCandidateRanking: true,
    automaticRepairPlan: true,
    realWavRequired: true,
    reports: ranked
  };
}

function reportIndex(report) {
  for (const value of [report?.candidateIndex, report?.outputIndex, report?.index]) {
    if (Number.isInteger(Number(value))) return Number(value);
  }
  return null;
}

function reportsFromPayload(data) {
  const candidates = [
    data?.sonaraQualityDirector?.reports,
    data?.sonaraQualityJudge?.reports,
    data?.qualityJudge?.reports,
    data?.data?.sonaraQualityJudge?.reports,
    data?.data?.qualityJudge?.reports,
    data?.metadata?.sonaraQualityJudge?.reports
  ];
  return candidates.find(value => Array.isArray(value) && value.length) || [];
}

export function upgradeQualityPayload(data, requested = {}) {
  if (!data || typeof data !== 'object') return data;
  const reports = reportsFromPayload(data);
  if (!reports.length) return data;

  const summary = summarizeProfessionalReports(reports, requested);
  const byIndex = new Map(summary.reports.map(report => [reportIndex(report), report]).filter(([index]) => index !== null));
  const next = { ...data, sonaraQualityDirector: summary };

  if (data.sonaraQualityJudge && typeof data.sonaraQualityJudge === 'object') {
    next.sonaraQualityJudge = { ...data.sonaraQualityJudge, qualityDirector: QUALITY_DIRECTOR_VERSION, bestProfessionalScore: summary.bestProfessionalScore, reports: summary.reports };
  }
  if (data.qualityJudge && typeof data.qualityJudge === 'object') {
    next.qualityJudge = { ...data.qualityJudge, qualityDirector: QUALITY_DIRECTOR_VERSION, bestProfessionalScore: summary.bestProfessionalScore, reports: summary.reports };
  }
  if (data.data && typeof data.data === 'object') {
    next.data = { ...data.data, sonaraQualityDirector: summary };
    if (data.data.sonaraQualityJudge && typeof data.data.sonaraQualityJudge === 'object') {
      next.data.sonaraQualityJudge = { ...data.data.sonaraQualityJudge, qualityDirector: QUALITY_DIRECTOR_VERSION, bestProfessionalScore: summary.bestProfessionalScore, reports: summary.reports };
    }
    if (data.data.qualityJudge && typeof data.data.qualityJudge === 'object') {
      next.data.qualityJudge = { ...data.data.qualityJudge, qualityDirector: QUALITY_DIRECTOR_VERSION, bestProfessionalScore: summary.bestProfessionalScore, reports: summary.reports };
    }
  }

  const annotate = list => Array.isArray(list) ? list.map((item, index) => {
    const report = byIndex.get(index) || null;
    if (!report || !item || typeof item !== 'object') return item;
    return { ...item, sonaraQuality: report, sonaraRecommended: index === summary.bestCandidateIndex, releaseEligible: report.professionalReleasePassed === true };
  }) : list;

  if (Array.isArray(data.candidates)) next.candidates = annotate(data.candidates);
  if (Array.isArray(data.outputs)) next.outputs = annotate(data.outputs);
  if (next.data && Array.isArray(data.data?.candidates)) next.data.candidates = annotate(data.data.candidates);
  if (next.data && Array.isArray(data.data?.outputs)) next.data.outputs = annotate(data.data.outputs);

  next.metadata = {
    ...(data.metadata || {}),
    sonaraQualityDirector: QUALITY_DIRECTOR_VERSION,
    bestProfessionalScore: summary.bestProfessionalScore,
    recommendedCandidate: summary.bestCandidateIndex,
    professionalReleasePassed: summary.passed > 0,
    autoRepairRecommended: summary.passed === 0
  };
  return next;
}
