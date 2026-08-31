import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUALITY_DIRECTOR_VERSION,
  PROFESSIONAL_RELEASE_SCORE,
  enrichQualityReport,
  rankProfessionalReports,
  summarizeProfessionalReports,
  upgradeQualityPayload
} from './sonara-quality-director-v2.mjs';

const requested = { bpm: 124, key: 'A Minor', durationSec: 180 };

function base(overrides = {}) {
  return {
    measuredFromRealWav: true,
    declaredDurationSec: 180,
    analyzedSeconds: 180,
    sampleRate: 48000,
    channels: 2,
    bitDepth: 24,
    peakDb: -1.1,
    rmsDb: -13.5,
    crestDb: 12.4,
    clippingRatio: 0,
    silenceRatio: 0.01,
    dcOffset: 0.0001,
    requestedBpm: 124,
    detectedBpm: 124,
    bpmConfidence: 0.95,
    bpmError: 0,
    bpmPassed: true,
    requestedKey: 'A Minor',
    detectedKey: 'A Minor',
    keyComparable: true,
    keyPassed: true,
    keyConfidence: 0.7,
    qualityScore: 94,
    qualityGatePassed: true,
    ...overrides
  };
}

test('release-ready WAV reaches professional gate', () => {
  const report = enrichQualityReport(base(), requested);
  assert.equal(report.qualityDirectorVersion, QUALITY_DIRECTOR_VERSION);
  assert.ok(report.professionalScore >= PROFESSIONAL_RELEASE_SCORE);
  assert.equal(report.professionalReleasePassed, true);
  assert.equal(report.professionalTier, 'release-ready');
  assert.deepEqual(report.hardFailureReasons, []);
});

test('BPM drift is a hard failure and generates repair plan', () => {
  const report = enrichQualityReport(base({ detectedBpm: 109, bpmError: 15, bpmPassed: false }), requested);
  assert.equal(report.professionalReleasePassed, false);
  assert.ok(report.hardFailureReasons.includes('bpm-lock-failed'));
  assert.ok(report.repairPlan.some(step => /BPM/i.test(step)));
});

test('clipping blocks release even with a high legacy score', () => {
  const report = enrichQualityReport(base({ clippingRatio: 0.002, qualityScore: 99 }), requested);
  assert.equal(report.professionalReleasePassed, false);
  assert.ok(report.hardFailureReasons.includes('clipping'));
});

test('candidate ranking puts release-ready candidate first', () => {
  const poor = { ...base({ clippingRatio: 0.003, qualityScore: 99 }), candidateIndex: 0 };
  const good = { ...base({ qualityScore: 90 }), candidateIndex: 1 };
  const ranked = rankProfessionalReports([poor, good], requested);
  assert.equal(ranked[0].candidateIndex, 1);
  assert.equal(ranked[0].professionalReleasePassed, true);
});

test('summary and payload upgrade expose recommended candidate', () => {
  const reports = [
    { ...base({ bpmPassed: false, bpmError: 12, qualityScore: 82 }), candidateIndex: 0 },
    { ...base({ qualityScore: 92 }), candidateIndex: 1 }
  ];
  const summary = summarizeProfessionalReports(reports, requested);
  assert.equal(summary.bestCandidateIndex, 1);
  assert.equal(summary.passed, 1);

  const upgraded = upgradeQualityPayload({
    candidates: [{ id: 'A' }, { id: 'B' }],
    sonaraQualityJudge: { reports }
  }, requested);
  assert.equal(upgraded.sonaraQualityDirector.bestCandidateIndex, 1);
  assert.equal(upgraded.candidates[1].sonaraRecommended, true);
  assert.equal(upgraded.metadata.autoRepairRecommended, false);
});
