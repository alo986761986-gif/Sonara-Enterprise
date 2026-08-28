import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('cloudflare/sonara-engine-v9-dual-fast.mjs', 'utf8');

assert.match(source, /kaggle-t4x2-extreme-fidelity-v16/);
assert.match(source, /const KAGGLE_STEPS = 12;/);
assert.match(source, /const KAGGLE_GUIDANCE_SCALE = 1\.15;/);
assert.match(source, /lm_repetition_penalty: 1\.05/);
assert.match(source, /CANDIDATE A — canonical fidelity/);
assert.match(source, /CANDIDATE B — refined interpretation/);
assert.match(source, /thinking: isKaggle \? true : payload\.thinking/);
assert.match(source, /use_cot_caption: isKaggle \? true : payload\.use_cot_caption/);
assert.match(source, /use_cot_language: isKaggle \? true : payload\.use_cot_language/);
assert.match(source, /constrained_decoding: isKaggle \? true : payload\.constrained_decoding/);
assert.match(source, /payload\.infer_method === 'sde' \? 'sde' : 'ode'/);
assert.match(source, /SONARA EXTREME FIDELITY: A su T4 #0 \+ B su T4 #1/);
assert.doesNotMatch(source, /const KAGGLE_STEPS = 4;/);
assert.doesNotMatch(source, /SONARA ULTRA FAST: A su T4 #0 \+ B su T4 #1/);

console.log('SONARA Extreme Fidelity v16 render profile and A/B separation: PASS');
