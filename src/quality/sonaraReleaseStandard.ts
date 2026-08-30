export const SONARA_RELEASE_STANDARD_VERSION = 'sonara-release-standard-v1';

export const SONARA_RELEASE_THRESHOLDS = Object.freeze({
  minimumQualityScore: 82,
  maximumBpmErrorPercent: 2.5,
  maximumClippingRatio: 0.0005,
  maximumSilenceRatio: 0.28,
  maximumDcOffset: 0.02,
  minimumCrestDb: 4,
  maximumCrestDb: 22
});

export type SonaraExactControlInput = {
  family: string;
  genre: string;
  subgenre: string;
  atmosphere?: string;
  bpmMode: 'manual' | 'auto';
  bpm?: number | null;
  key?: string | null;
  durationSec: number;
  vocalMode: string;
  instruments?: string[];
};

export type SonaraExactControlContract = {
  version: string;
  taxonomyLock: string;
  bpmLock: number | null;
  keyLock: string | null;
  durationLockSec: number;
  vocalLock: string;
  instrumentLocks: string[];
  immutable: string[];
};

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values: string[]) => Array.from(new Set(values.map(clean).filter(Boolean)));

export function buildExactMusicControlContract(input: SonaraExactControlInput): SonaraExactControlContract {
  const bpm = Number(input.bpm);
  const bpmLock = input.bpmMode === 'manual' && Number.isFinite(bpm) && bpm >= 40 && bpm <= 220
    ? Math.round(bpm)
    : null;
  const durationLockSec = Math.max(5, Math.min(600, Math.round(Number(input.durationSec) || 180)));
  const taxonomyLock = [input.family, input.genre, input.subgenre].map(clean).filter(Boolean).join(' > ');
  const instrumentLocks = unique(input.instruments || []);
  const keyLock = clean(input.key) || null;
  const vocalLock = clean(input.vocalMode) || 'instrumental';

  return {
    version: SONARA_RELEASE_STANDARD_VERSION,
    taxonomyLock,
    bpmLock,
    keyLock,
    durationLockSec,
    vocalLock,
    instrumentLocks,
    immutable: unique([
      taxonomyLock ? `taxonomy:${taxonomyLock}` : '',
      bpmLock ? `bpm:${bpmLock}` : '',
      keyLock ? `key:${keyLock}` : '',
      `duration:${durationLockSec}`,
      `vocal:${vocalLock}`,
      ...instrumentLocks.map(name => `instrument:${name}`)
    ])
  };
}

export type SonaraQualityLike = {
  qualityScore?: number | null;
  bpmPassed?: boolean | null;
  clippingRatio?: number | null;
  silenceRatio?: number | null;
  dcOffset?: number | null;
  crestDb?: number | null;
  measuredFromRealWav?: boolean | null;
  error?: string | null;
};

export type SonaraReleaseDecision = {
  version: string;
  publishable: boolean;
  autoRepairRecommended: boolean;
  reasons: string[];
};

export function evaluateSonaraRelease(report: SonaraQualityLike | null | undefined): SonaraReleaseDecision {
  const reasons: string[] = [];
  if (!report) reasons.push('missing-quality-report');
  if (report && report.measuredFromRealWav !== true) reasons.push('not-measured-from-real-wav');
  const score = Number(report?.qualityScore);
  if (!Number.isFinite(score) || score < SONARA_RELEASE_THRESHOLDS.minimumQualityScore) reasons.push('quality-score-below-release-standard');
  if (report?.bpmPassed === false) reasons.push('bpm-lock-not-verified');
  const clipping = Number(report?.clippingRatio);
  if (Number.isFinite(clipping) && clipping > SONARA_RELEASE_THRESHOLDS.maximumClippingRatio) reasons.push('excessive-clipping');
  const silence = Number(report?.silenceRatio);
  if (Number.isFinite(silence) && silence > SONARA_RELEASE_THRESHOLDS.maximumSilenceRatio) reasons.push('excessive-silence');
  const dc = Math.abs(Number(report?.dcOffset));
  if (Number.isFinite(dc) && dc > SONARA_RELEASE_THRESHOLDS.maximumDcOffset) reasons.push('dc-offset');
  if (clean(report?.error)) reasons.push('analysis-error');

  return {
    version: SONARA_RELEASE_STANDARD_VERSION,
    publishable: reasons.length === 0,
    autoRepairRecommended: reasons.length > 0,
    reasons
  };
}
