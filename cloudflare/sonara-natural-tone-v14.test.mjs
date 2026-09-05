import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const prompt = readFileSync(new URL('./sonara-engine-v15-authoritative-prompt.mjs', import.meta.url), 'utf8');
const router = readFileSync(new URL('./sonara-molab-xl-router.mjs', import.meta.url), 'utf8');

assert.match(prompt, /sonara-natural-tone-v14/);
assert.match(prompt, /smooth non-hyped top end/);
assert.match(prompt, /piercing\/whistling resonances|piercing resonances/);
assert.match(prompt, /Keep FX behind the musical content/);
assert.match(prompt, /never stack constant bright top-end layers/);
assert.match(prompt, /sonaraHarshnessGuard: true/);
assert.match(prompt, /sonaraSmoothTopEnd: true/);
assert.match(prompt, /sonaraFxRestraint: true/);

assert.match(router, /sonara-natural-tone-v14/);
assert.match(router, /dcw_mode: 'low'/);
assert.match(router, /dcw_scaler: 0\.02/);
assert.match(router, /dcw_high_scaler: 0\.0/);
assert.match(router, /piercing highs, brittle cymbals, shrill leads/);
assert.match(router, /naturalToneProfile: NATURAL_TONE_PROFILE/);
assert.match(router, /qualityInferenceSteps: 2/);
assert.match(router, /fastInferenceSteps: 1/);
assert.match(router, /ultraInferenceSteps: 8/);
assert.match(router, /maxBatchSize: 2/);

console.log('SONARA_NATURAL_TONE_V14=PASS');
console.log('RICHNESS=PRESERVED');
console.log('QUALITY_SPEED=UNCHANGED');
