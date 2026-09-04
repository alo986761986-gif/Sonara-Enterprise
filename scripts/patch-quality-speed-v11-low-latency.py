#!/usr/bin/env python3
from pathlib import Path

p = Path('cloudflare/sonara-molab-xl-router.mjs')
s = p.read_text(encoding='utf-8')

repls = [
    (
        "const FIDELITY_PROFILE = 'sonara-fidelity-v10-quality4-batch2';",
        "const FIDELITY_PROFILE = 'sonara-fidelity-v11-low-latency-quality4-batch2';"
    ),
    (
        "const humanLmCfgScale = realMusic ? (qualitySafeB ? 2.50 : clamp(2.10 + controls.styleInfluence * 0.004, 2.30, 2.10, 2.50)) : 2.0;",
        "const humanLmCfgScale = realMusic && profile === 'ultra' ? (qualitySafeB ? 2.50 : clamp(2.10 + controls.styleInfluence * 0.004, 2.30, 2.10, 2.50)) : 1.0;"
    ),
    (
        "    thinking: realMusic,",
        "    thinking: profile === 'ultra' && realMusic,"
    ),
    (
        "    use_constrained_decoding: realMusic && hasVocals,",
        "    use_constrained_decoding: profile === 'ultra' && realMusic && hasVocals,"
    ),
    (
        "    constrained_decoding: realMusic && hasVocals,",
        "    constrained_decoding: profile === 'ultra' && realMusic && hasVocals,"
    ),
]

for old, new in repls:
    if old not in s:
        raise SystemExit(f'PATCH_PATTERN_MISSING: {old[:140]}')
    s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print('QUALITY_SPEED_V11_LOW_LATENCY_PATCHED')
print('FAST=4_STEPS+NO_LM_AUDIO_CODES+BATCH2')
print('QUALITY=4_STEPS+EULER+BATCH2+LM_METADATA_ONLY+LM_CFG_1')
print('QUALITY_THINKING=OFF')
print('QUALITY_CONSTRAINED_DECODING=OFF')
print('ULTRA=8_STEPS+HEUN+LM4B_FULL_THINKING+CFG')
