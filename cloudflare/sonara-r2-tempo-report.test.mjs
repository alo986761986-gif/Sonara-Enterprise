import test from 'node:test';
import assert from 'node:assert/strict';
import { r2TempoVerification } from './sonara-r2-https-relay.mjs';

const q = (requestedBpm, detectedBpm, bpmStatus, bpmVerified) => ({
  tempo: { requestedBpm, detectedBpm, bpmStatus, bpmVerified }
});

test('170 BPM selection with 145/140 WAV detections never verifies A/B', () => {
  const reports = [q(170, 145.2, 'mismatch', false), q(170, 139.9, 'mismatch', false)];
  assert.deepEqual(r2TempoVerification(reports, 2), {
    status: 'mismatch', requestedBpm: 170, verifiedCount: 0, trackCount: 2
  });
});

test('octave-ambiguous rhythm is not counted as verified', () => {
  const report = r2TempoVerification([q(170, 70, 'octave-ambiguous', false), q(170, 170, 'verified', true)], 2);
  assert.equal(report.status, 'ambiguous');
  assert.equal(report.verifiedCount, 1);
});

test('only two independently verified takes allow verified pair', () => {
  const report = r2TempoVerification([q(170, 170, 'verified', true), q(170, 170.8, 'verified', true)], 2);
  assert.equal(report.status, 'verified');
  assert.equal(report.verifiedCount, 2);
});

test('old quality reports without tempo are pending, never verified', () => {
  const report = r2TempoVerification([{ score: 90 }, { score: 95 }], 2);
  assert.equal(report.status, 'pending');
  assert.equal(report.verifiedCount, 0);
});

test('no request does not invent an exact BPM', () => {
  const report = r2TempoVerification([q(null, 150, 'not-requested', false)], 1);
  assert.equal(report.status, 'not-requested');
  assert.equal(report.requestedBpm, null);
});

test('a partially reported pair is not verified', () => {
  const report = r2TempoVerification([q(170, 170, 'verified', true)], 2);
  assert.notEqual(report.status, 'verified');
  assert.equal(report.verifiedCount, 1);
});
