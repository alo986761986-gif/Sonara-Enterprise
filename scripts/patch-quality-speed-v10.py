#!/usr/bin/env python3
from pathlib import Path

p = Path('cloudflare/sonara-molab-xl-router.mjs')
s = p.read_text(encoding='utf-8')

repls = [
    (
        "const FIDELITY_PROFILE = 'sonara-fidelity-v2-stable8';",
        "const FIDELITY_PROFILE = 'sonara-fidelity-v10-quality4-batch2';"
    ),
    (
        "const INFERENCE_STEPS = 8;",
        "const INFERENCE_STEPS = 4;"
    ),
    (
        "if (Number.isFinite(requested)) return Math.round(clamp(requested, profile === 'ultra' ? 8 : 6, 4, 8));\n  return profile === 'ultra' ? 8 : profile === 'fast' ? 6 : 6;",
        "if (Number.isFinite(requested)) return Math.round(clamp(requested, profile === 'ultra' ? 8 : 4, 4, 8));\n  return profile === 'ultra' ? 8 : 4;"
    ),
    (
        "if (realMusic && profileOf(body) === 'ultra') return 'heun';\n  if (requested === 'euler' || requested === 'heun') return requested;\n  if (body?.sonaraFastUltra === true) return 'euler';\n  return realMusic ? 'heun' : 'euler';",
        "if (profileOf(body) === 'ultra' && realMusic) return 'heun';\n  if (profileOf(body) === 'quality') return 'euler';\n  if (requested === 'euler' || requested === 'heun') return requested;\n  if (body?.sonaraFastUltra === true) return 'euler';\n  return 'euler';"
    ),
    (
        "allow_lm_batch: false,",
        "allow_lm_batch: realMusic && count > 1,\n    lm_batch_chunk_size: realMusic && count > 1 ? 8 : 1,"
    ),
]

for old, new in repls:
    if old not in s:
        raise SystemExit(f'PATCH_PATTERN_MISSING: {old[:120]}')
    s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print('QUALITY_SPEED_V10_PATCHED')
print('QUALITY_STEPS=4')
print('QUALITY_SAMPLER=EULER')
print('QUALITY_BATCH=2')
print('LM_BATCH=ON_FOR_REAL_MUSIC_BATCH2')
print('ULTRA_STEPS=8')
