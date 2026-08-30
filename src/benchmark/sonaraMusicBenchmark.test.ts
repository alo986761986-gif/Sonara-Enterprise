import assert from 'node:assert/strict';
import { WORLD_MUSIC_GENRES } from '../data/worldMusicGenres';
import { ALL_REAL_MUSICAL_INSTRUMENTS } from '../data/realMusicalInstruments';
import { buildSonaraMusicBenchmarkCases, SONARA_MUSIC_BENCHMARK_SIZE, summarizeSonaraBenchmark } from './sonaraMusicBenchmark';
import { evaluateSonaraRelease, SONARA_RELEASE_THRESHOLDS } from '../quality/sonaraReleaseStandard';

const cases = buildSonaraMusicBenchmarkCases();
assert.equal(cases.length, SONARA_MUSIC_BENCHMARK_SIZE, 'benchmark must contain exactly 500 cases');
assert.equal(new Set(cases.map(item => item.id)).size, cases.length, 'benchmark ids must be unique');

const expectedFamilies = new Set(WORLD_MUSIC_GENRES.map(item => item.family));
const coveredFamilies = new Set(cases.map(item => item.family));
for (const family of expectedFamilies) assert.ok(coveredFamilies.has(family), `benchmark missing family: ${family}`);

for (const testCase of cases) {
  assert.ok(testCase.prompt.includes(testCase.subgenre), `${testCase.id}: subgenre lock missing from prompt`);
  assert.ok(testCase.prompt.includes(`${testCase.bpm} BPM`), `${testCase.id}: BPM lock missing from prompt`);
  assert.equal(testCase.exactControl.bpmLock, testCase.bpm, `${testCase.id}: exact BPM contract broken`);
  assert.equal(testCase.exactControl.durationLockSec, testCase.durationSec, `${testCase.id}: exact duration contract broken`);
  assert.ok(testCase.exactControl.taxonomyLock.includes(testCase.subgenre), `${testCase.id}: taxonomy contract broken`);
  for (const instrument of testCase.instruments) {
    assert.ok(ALL_REAL_MUSICAL_INSTRUMENTS.includes(instrument), `${testCase.id}: non-authoritative instrument ${instrument}`);
    assert.ok(testCase.prompt.includes(instrument), `${testCase.id}: selected instrument missing from prompt`);
    assert.ok(testCase.exactControl.instrumentLocks.includes(instrument), `${testCase.id}: selected instrument not locked`);
  }
  assert.equal(testCase.studioBlueprint.durationSec, testCase.durationSec, `${testCase.id}: Studio duration drift`);
  assert.equal(testCase.studioBlueprint.bpm, testCase.bpm, `${testCase.id}: Studio BPM drift`);
  assert.ok(testCase.studioBlueprint.sectionPlan.length >= 4, `${testCase.id}: arrangement too shallow`);
  const finalSection = testCase.studioBlueprint.sectionPlan[testCase.studioBlueprint.sectionPlan.length - 1];
  assert.equal(finalSection.endSec, testCase.durationSec, `${testCase.id}: malformed ending contract`);
}

const releasePass = evaluateSonaraRelease({
  qualityScore: SONARA_RELEASE_THRESHOLDS.minimumQualityScore + 5,
  bpmPassed: true,
  clippingRatio: 0,
  silenceRatio: 0.05,
  dcOffset: 0,
  measuredFromRealWav: true
});
assert.equal(releasePass.publishable, true, 'clean master should pass release gate');
assert.equal(releasePass.autoRepairRecommended, false, 'clean master should not trigger auto repair');

const releaseFail = evaluateSonaraRelease({
  qualityScore: SONARA_RELEASE_THRESHOLDS.minimumQualityScore - 1,
  bpmPassed: false,
  clippingRatio: SONARA_RELEASE_THRESHOLDS.maximumClippingRatio * 4,
  silenceRatio: 0.5,
  dcOffset: 0.05,
  measuredFromRealWav: true
});
assert.equal(releaseFail.publishable, false, 'bad master must not pass release gate');
assert.equal(releaseFail.autoRepairRecommended, true, 'bad master must trigger auto repair');
assert.ok(releaseFail.reasons.length >= 4, 'release gate should explain why a master failed');

const summary = summarizeSonaraBenchmark(cases);
assert.equal(summary.cases, 500);
assert.ok(summary.families >= 25, `expected broad world-family coverage, got ${summary.families}`);
assert.ok(summary.instruments >= 100, `expected broad instrument coverage, got ${summary.instruments}`);
assert.equal(summary.vocalModes, 4);
assert.equal(summary.durations, 8);

console.log(`SONARA Music Benchmark passed: ${summary.cases} cases, ${summary.families} families, ${summary.genres} genres, ${summary.subgenres} subgenres, ${summary.instruments} instruments`);
