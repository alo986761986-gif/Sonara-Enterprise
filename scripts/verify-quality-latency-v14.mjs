import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const director = read('cloudflare/sonara-music-director-v3-entry.mjs');
const yue = read('cloudflare/sonara-yue-router.mjs');
const molab = read('cloudflare/sonara-molab-xl-router.mjs');
const speed = read('cloudflare/sonara-speed-v4-edge.mjs');
const real = read('cloudflare/sonara-real-music-v3-edge.mjs');
const ui = read('src/components/generator/DualTrackGenerationControl.tsx');

assert.match(director, /profile: 'quality', internalBatches: 1, candidatesPerBatch: 2/);
assert.match(director, /if \(spec\.internalBatches === 1\)/);
assert.doesNotMatch(yue, /profile === 'quality'\) return 1/);
assert.match(yue, /candidateCount \?\? body\.candidate_count, 2, 1, 2/);
assert.match(molab, /if \(profile === 'quality'\) return 2;/);
assert.match(molab, /return 1;\n}/);
assert.equal((molab.match(/ultraInferenceSteps:/g) || []).length, 1);
assert.match(speed, /const FAST_STEPS = 1;/);
assert.match(speed, /const QUALITY_STEPS = 2;/);
assert.match(speed, /sonaraInternalCandidateTarget: 2/);
assert.match(real, /defaultGenerationProfile: 'quality'/);
assert.match(real, /defaultInferenceSteps: 2/);
assert.match(real, /qualitySingleGpuBatch: true/);
assert.match(real, /speedRevision: 'sonara-v14-quality-single-batch-1'/);
assert.match(ui, /dualFast: true/);
assert.match(ui, /JOB_POLL_INTERVAL_MS = 1_000/);

console.log('SONARA_V14_LATENCY_CONTRACT=PASS');
console.log('QUALITY=ONE_GPU_BATCH_TWO_TRACKS');
console.log('FAST_STEPS=1 QUALITY_STEPS=2 ULTRA_STEPS=8');
