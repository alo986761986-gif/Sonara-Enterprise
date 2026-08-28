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

// BPM must be a real generation control, not decorative UI metadata.
assert.match(source, /Math\.round\(clamp\(body\.bpm, 124, 30, 300\)\)/);
assert.match(source, /global_caption: tempoLockText\(bpm\)/);
assert.match(source, /Hard tempo lock: exactly/);
assert.match(source, /never half-time/);
assert.match(source, /tempoLock: tempoLockText\(payload\.bpm\)/);
assert.match(source, /tempo-locked/);

assert.doesNotMatch(source, /const KAGGLE_STEPS = 4;/);
assert.doesNotMatch(source, /kaggle-t4x2-ultra-fast-v2/);

console.log('SONARA Extreme Fidelity v16 + authoritative BPM 30-300 tempo lock: PASS');
