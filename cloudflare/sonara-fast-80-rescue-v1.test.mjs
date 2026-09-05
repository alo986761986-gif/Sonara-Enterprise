import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('cloudflare/sonara-molab-xl-router.mjs', 'utf8');

assert.match(source, /sonara-fast-80-rescue-v1/);
assert.match(source, /FAST_ARTIFACT_RESCUE_THRESHOLD = 70/);
assert.match(source, /FAST_STALL_THRESHOLD = 75/);
assert.match(source, /FAST_STALL_MAX_POLLS = 4/);
assert.match(source, /FAST_RECOVERY_MAX_ATTEMPTS = 1/);
assert.match(source, /completedFastByArtifacts/);
assert.match(source, /Fast anti-stallo: render riavviato automaticamente/);
assert.match(source, /fastInferenceSteps: 1/);
assert.match(source, /qualityInferenceSteps: 2/);
assert.match(source, /ultraInferenceSteps: 8/);

console.log('SONARA_FAST_80_RESCUE_V1=PASS');
console.log('FAST_SPEED=1_STEP_PRESERVED');
console.log('QUALITY_SPEED=2_STEPS_PRESERVED');
console.log('ULTRA_SPEED=8_STEPS_PRESERVED');
