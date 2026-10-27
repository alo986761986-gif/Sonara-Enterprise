#!/usr/bin/env python3
from pathlib import Path

GUARD = Path('cloudflare/sonara-quality-ultra-stability-guard.mjs')
ROUTER = Path('cloudflare/sonara-molab-xl-router.mjs')
PROFILE = 'sonara-quality-ab-diversity-v8'
NATURAL_PROFILE = 'sonara-natural-instruments-ab-v1'


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise SystemExit(f'{label}=MISSING')
    print(f'{label}=OK')


def forbid(text: str, marker: str, label: str) -> None:
    if marker in text:
        raise SystemExit(f'{label}=LEGACY_MARKER_FOUND')
    print(f'{label}=OK')


def main() -> None:
    guard = GUARD.read_text(encoding='utf-8')
    router = ROUTER.read_text(encoding='utf-8')

    require(guard, PROFILE, 'GUARD_V8_PROFILE')
    require(router, PROFILE, 'ROUTER_V8_PROFILE')
    require(guard, 'QUALITY B INDEPENDENT COMPOSITION V8', 'GUARD_B_DIRECTION_V8')
    require(router, 'QUALITY B INDEPENDENT COMPOSITION V8', 'ROUTER_B_DIRECTION_V8')
    require(guard, 'sonaraQualityIndependentCompositionV8', 'GUARD_INDEPENDENT_AB')
    require(router, 'sonara_quality_independent_composition_v8', 'ROUTER_INDEPENDENT_AB')
    require(guard, NATURAL_PROFILE, 'GUARD_NATURAL_INSTRUMENT_AB')
    require(router, NATURAL_PROFILE, 'ROUTER_NATURAL_INSTRUMENT_AB')
    require(guard, 'NATURAL INSTRUMENT A/B LOCK V1', 'GUARD_NATURAL_LOCK')
    require(router, 'cheap one-note drum pulse', 'ROUTER_DRUM_ANTI_REPETITION')

    forbid(guard, 'same seed-base as A', 'GUARD_NO_OLD_SAME_SEED')
    forbid(guard, 'QUALITY B HARD-LOCK V7', 'GUARD_NO_OLD_HARD_LOCK')
    forbid(router, 'qualitySafeB', 'ROUTER_NO_OLD_SAFE_B')

    print('SONARA_QUALITY_AB_DIVERSITY_V8=VERIFIED')
    print('QUALITY_A_B=SAME_BRIEF_DIFFERENT_COMPOSITIONS')
    print('NATURAL_INSTRUMENT_AB_LOCK=VERIFIED')
    print('DRUM_ANTI_REPETITION=VERIFIED')
    print('FAST_STEPS=1 QUALITY_STEPS=2 ULTRA_STEPS=8 UNCHANGED')


if __name__ == '__main__':
    main()
