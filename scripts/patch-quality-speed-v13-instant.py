#!/usr/bin/env python3
from pathlib import Path

p = Path('cloudflare/sonara-molab-xl-router.mjs')
s = p.read_text(encoding='utf-8')

repls = [
    (
        "const FIDELITY_PROFILE = 'sonara-fidelity-v11-low-latency-quality4-batch2';",
        "const FIDELITY_PROFILE = 'sonara-fidelity-v13-instant-rtx6000-fast1-quality2';"
    ),
    (
        "const INFERENCE_STEPS = 4;",
        "const INFERENCE_STEPS = 1;"
    ),
    (
        "if (Number.isFinite(requested)) return Math.round(clamp(requested, profile === 'ultra' ? 8 : 4, 4, 8));\n  return profile === 'ultra' ? 8 : 4;",
        "if (profile === 'ultra') return 8;\n  if (profile === 'quality') return 2;\n  return 1;"
    ),
    (
        "    sonara_generation_profile: profile,",
        "    // V13: keep Ultra on the supervisor quality path, but bypass the old\n    // server-side 4-step clamp for Fast/Quality by using the API's neutral profile.\n    // The actual SONARA profile is still carried by inference_steps and edge metadata.\n    sonara_generation_profile: profile === 'ultra' ? 'ultra' : 'auto',"
    ),
    (
        "    allow_lm_batch: realMusic && count > 1,\n    lm_batch_chunk_size: realMusic && count > 1 ? 8 : 1,",
        "    allow_lm_batch: profile === 'ultra' && realMusic && count > 1,\n    lm_batch_chunk_size: profile === 'ultra' && realMusic && count > 1 ? 8 : 1,"
    ),
    (
        "    qualityInferenceSteps: 6,",
        "    qualityInferenceSteps: 2,\n    fastInferenceSteps: 1,\n    ultraInferenceSteps: 8,"
    ),
]

for old, new in repls:
    if old not in s:
        raise SystemExit(f'PATCH_PATTERN_MISSING: {old[:180]}')
    s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print('QUALITY_SPEED_V13_INSTANT_PATCHED')
print('RTX6000_FAST=1_STEP+EULER+THINKING_OFF+BATCH2')
print('RTX6000_QUALITY=2_STEPS+EULER+THINKING_OFF+BATCH2')
print('RTX6000_ULTRA=8_STEPS+HEUN+LM4B_FULL_THINKING')
print('SERVER_4_STEP_CLAMP=BYPASSED_FOR_FAST_QUALITY')
print('LM_BATCH=ULTRA_ONLY')
