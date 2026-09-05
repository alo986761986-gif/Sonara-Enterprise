import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync('cloudflare/sonara-molab-xl-router.mjs', 'utf8');

assert.match(src, /sonara-quality-47-rescue-v1/);
assert.match(src, /HIGH_PROGRESS_RESCUE_THRESHOLD = 93/);
assert.match(src, /HIGH_PROGRESS_MAX_POLLS = 6/);
assert.match(src, /completedByArtifacts = .*highProgress.*refs\.length >= expectedCount/);
assert.match(src, /completionRescuedFromArtifacts: completedByArtifacts/);
assert.match(src, /Anti-stallo finale Quality attivato/);
assert.match(src, /quality47RescueProfile: QUALITY_47_RESCUE_PROFILE/);

console.log('SONARA_QUALITY_47_RESCUE_V1=PASS');
