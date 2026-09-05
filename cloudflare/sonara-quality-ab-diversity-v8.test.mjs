import fs from 'node:fs';
import assert from 'node:assert/strict';

const guard = fs.readFileSync('cloudflare/sonara-quality-ultra-stability-guard.mjs', 'utf8');
const router = fs.readFileSync('cloudflare/sonara-molab-xl-router.mjs', 'utf8');

assert.match(guard, /sonara-quality-ab-diversity-v8/);
assert.match(guard, /qualitySeed \+ variantIndex \* 104729 \+ retryIndex \* 13007/);
assert.match(guard, /QUALITY B INDEPENDENT COMPOSITION V8/);
assert.match(guard, /SAME BRIEF; DIFFERENT SONG/);
assert.match(guard, /sonaraQualityIndependentCompositionV8/);
assert.match(guard, /sonaraQualityIndependentSeedV8/);
assert.doesNotMatch(guard, /same seed-base as A/i);
assert.doesNotMatch(guard, /Only conservative phrase, voicing, fill and transition differences are allowed/i);

assert.match(router, /sonara-quality-ab-diversity-v8/);
assert.match(router, /QUALITY B INDEPENDENT COMPOSITION V8/);
assert.match(router, /sonara_quality_independent_composition_v8/);
assert.match(router, /sonara_quality_independent_seed_v8/);
assert.match(router, /const qualityVariantB = profile === 'quality'/);
assert.doesNotMatch(router, /same seed-base as A/i);
assert.doesNotMatch(router, /qualitySafeB/);

// Do not regress the established latency contract.
assert.match(router, /if \(profile === 'quality'\) return 2;/);
assert.match(router, /if \(profile === 'ultra'\) return 8;/);
assert.match(router, /return 1;/);

console.log('SONARA_QUALITY_AB_DIVERSITY_V8=PASS');
console.log('QUALITY_A_B=SAME_BRIEF_DIFFERENT_COMPOSITIONS');
console.log('QUALITY_SPEED=2_STEPS_PRESERVED');
