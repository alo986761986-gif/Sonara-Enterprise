#!/usr/bin/env python3
from pathlib import Path

ROUTER = Path('cloudflare/sonara-molab-xl-router.mjs')
text = ROUTER.read_text(encoding='utf-8')
old = "    qualityABDiversificationProfile: profile === 'quality' ? QUALITY_AB_DIVERSITY_PROFILE : null,\n    qualityABIndependentCompositionV8: profile === 'quality',"
new = "    qualityABDiversificationProfile: payload?.sonara_quality_independent_composition_v8 === true ? QUALITY_AB_DIVERSITY_PROFILE : null,\n    qualityABIndependentCompositionV8: payload?.sonara_quality_independent_composition_v8 === true,"
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('QUALITY_AB_METADATA_SCOPE_PATTERN_MISSING')
if "qualityABDiversificationProfile: profile === 'quality'" in text:
    raise SystemExit('QUALITY_AB_METADATA_SCOPE_STILL_UNSAFE')
ROUTER.write_text(text, encoding='utf-8')
print('QUALITY_AB_METADATA_SCOPE=SAFE')
