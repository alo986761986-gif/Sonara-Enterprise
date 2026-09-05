#!/usr/bin/env python3
from pathlib import Path

GUARD = Path('cloudflare/sonara-quality-ultra-stability-guard.mjs')
ROUTER = Path('cloudflare/sonara-molab-xl-router.mjs')
PROFILE = 'sonara-quality-ab-diversity-v8'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY')
        return text
    if old not in text:
        raise SystemExit(f'{label}=PATTERN_MISSING')
    print(f'{label}=PATCHED')
    return text.replace(old, new, 1)


def patch_guard(text: str) -> str:
    text = replace_once(
        text,
        "const VERSION = 'sonara-quality-ultra-stability-1';",
        "const VERSION = 'sonara-quality-ultra-stability-1';\nconst QUALITY_AB_DIVERSITY_PROFILE = 'sonara-quality-ab-diversity-v8';",
        'GUARD_PROFILE'
    )

    text = replace_once(
        text,
        "  const independentSeed = profile === 'quality'\n    ? qualitySeed\n    : Math.max(1, (suppliedSeed + Number(entropy[0]) + Number(entropy[1]) + (variantIndex + 1) * 15485863) % 1999999973);",
        "  const independentSeed = profile === 'quality'\n    ? Math.max(1, (qualitySeed + variantIndex * 104729 + retryIndex * 13007) % 1999999973)\n    : Math.max(1, (suppliedSeed + Number(entropy[0]) + Number(entropy[1]) + (variantIndex + 1) * 15485863) % 1999999973);",
        'QUALITY_INDEPENDENT_SEEDS'
    )

    text = replace_once(
        text,
        "    ? 'QUALITY SAME-PROMPT CONTRACT — ABSOLUTE: both visible songs must execute the exact same creator brief. Preserve concept, genre/subgenre, mood, era, energy, requested instruments, rhythmic feel, production character, vocal role/identity, language, lyrics/theme, atmosphere, exclusions, BPM, key and duration. Do not invent a neighboring style, new concept, unrelated instrumentation or experimental detour. Candidate B is an alternate TAKE of the same requested song brief, not a reinterpretation.'",
        "    ? 'QUALITY SAME-BRIEF / DIFFERENT-COMPOSITION CONTRACT V8 — ABSOLUTE: both visible songs must execute the exact same creator brief and preserve concept, genre/subgenre, mood, era, energy, requested instruments, rhythmic feel, production character, vocal role/identity, language, lyrics/theme, atmosphere, exclusions, BPM, key and duration. A and B MUST nevertheless be two genuinely different original compositions. Candidate B must not reuse A as a take, clone, near-copy or remix. Independence applies to melody, hook contour, harmonic/voicing route, bass phrasing, drum phrasing, section development, transitions and arrangement decisions while all creator semantics stay locked.'",
        'QUALITY_PROMPT_CONTRACT_V8'
    )

    old_direction = "      : 'SONARA QUALITY B HARD-LOCK V7 — render a second safe take from the EXACT SAME musical identity as A. Use the same creator brief and same seed-base. B must immediately sound like the same commissioned song world: identical genre/subgenre, mood, era, groove family, instrument palette, production language, singer identity, lyrics/language, BPM, key and atmosphere. Do not reinterpret, remix, hybridize or experiment. Only conservative phrase, voicing, fill and transition differences are allowed. If any choice could change the identity, choose the most literal conventional solution. PROMPT FIDELITY AND A/B COHERENCE OVERRIDE NOVELTY.')"
    new_direction = "      : 'SONARA QUALITY B INDEPENDENT COMPOSITION V8 — compose a genuinely different second song from the EXACT SAME creator brief. Keep genre/subgenre, mood, era, groove identity, requested instrument palette, production language, singer identity, lyrics/language, BPM, key, duration and atmosphere locked. MUST use an independent seed and MUST create a new primary melody/hook contour, a different harmonic or voicing route, different bass phrasing, different drum/percussion phrasing, different section development, different transitions and a clearly distinct arrangement path. Do not reuse A as a take, clone or near-copy. Do not drift into another genre, concept or unrelated instrumentation. SAME BRIEF; DIFFERENT SONG.')"
    text = replace_once(text, old_direction, new_direction, 'QUALITY_B_DIRECTION_V8')

    text = replace_once(
        text,
        "    weirdness: profile === 'quality' && variantIndex === 1 ? 0 : body.weirdness,\n    styleInfluence: profile === 'quality' && variantIndex === 1 ? 100 : (body.styleInfluence ?? body.style_influence),\n    style_influence: profile === 'quality' && variantIndex === 1 ? 100 : (body.style_influence ?? body.styleInfluence),",
        "    weirdness: body.weirdness,\n    styleInfluence: body.styleInfluence ?? body.style_influence,\n    style_influence: body.style_influence ?? body.styleInfluence,",
        'QUALITY_B_PRESERVE_CREATIVE_CONTROLS'
    )

    text = replace_once(
        text,
        "    sonaraQualityBSafeV5: profile === 'quality',\n    sonaraQualityBSafeV6: profile === 'quality',\n    sonaraQualityBHardLockV7: profile === 'quality',\n    sonaraQualitySameSeedBaseV7: profile === 'quality',\n    sonaraQualitySafeB: profile === 'quality' && variantIndex === 1,",
        "    sonaraQualityBSafeV5: false,\n    sonaraQualityBSafeV6: false,\n    sonaraQualityBHardLockV7: false,\n    sonaraQualitySameSeedBaseV7: false,\n    sonaraQualitySafeB: false,\n    sonaraQualityABDiversificationProfile: profile === 'quality' ? QUALITY_AB_DIVERSITY_PROFILE : null,\n    sonaraQualityIndependentCompositionV8: profile === 'quality',\n    sonaraQualityIndependentSeedV8: profile === 'quality',",
        'QUALITY_B_FLAGS_V8'
    )

    text = replace_once(
        text,
        "`${profile === 'quality' ? 'Controlled take' : 'Independent composition'} seed=${independentSeed}.`",
        "`${profile === 'quality' ? 'Independent Quality composition' : 'Independent composition'} seed=${independentSeed}.`",
        'QUALITY_PROMPT_SEED_LABEL'
    )

    text = replace_once(
        text,
        "    independentComposition: state.profile === 'ultra'",
        "    independentComposition: state.profile === 'ultra' || state.profile === 'quality'",
        'VISIBLE_INDEPENDENCE'
    )

    text = replace_once(
        text,
        "      independentAB: state.profile === 'ultra',\n      independentABSelection: state.profile === 'ultra' ? 'best-one-per-independent-batch' : (state.profile === 'quality' ? 'one-approved-take-per-sequential-job' : 'global-ranking'),\n      qualitySequentialSingleTakes: state.profile === 'quality',\n      qualityBStrictPublishGate: state.profile === 'quality',\n      qualityBHardLockV7: state.profile === 'quality',\n      qualityBSameSeedBaseV7: state.profile === 'quality',",
        "      independentAB: state.profile === 'ultra' || state.profile === 'quality',\n      independentABSelection: state.profile === 'ultra' ? 'best-one-per-independent-batch' : (state.profile === 'quality' ? 'one-independent-composition-per-sequential-job' : 'global-ranking'),\n      qualitySequentialSingleTakes: state.profile === 'quality',\n      qualityBStrictPublishGate: state.profile === 'quality',\n      qualityBHardLockV7: false,\n      qualityBSameSeedBaseV7: false,\n      qualityABDiversificationProfile: state.profile === 'quality' ? QUALITY_AB_DIVERSITY_PROFILE : null,\n      qualityABIndependentCompositionV8: state.profile === 'quality',\n      qualityABSeedStrategy: state.profile === 'quality' ? 'independent-offset-v8' : null,",
        'FINAL_METADATA_V8'
    )

    text = replace_once(
        text,
        "      qualitySamePromptPairPreferred: profile === 'quality',\n      qualitySequentialSingleTakes: profile === 'quality',\n      qualityBStrictPublishGate: profile === 'quality',",
        "      qualitySamePromptPairPreferred: profile === 'quality',\n      qualitySequentialSingleTakes: profile === 'quality',\n      qualityBStrictPublishGate: profile === 'quality',\n      qualityABDiversificationProfile: profile === 'quality' ? QUALITY_AB_DIVERSITY_PROFILE : null,\n      qualityABIndependentCompositionV8: profile === 'quality',\n      qualityABSeedStrategy: profile === 'quality' ? 'independent-offset-v8' : null,",
        'START_METADATA_V8'
    )

    text = text.replace('QUALITY B V7:', 'QUALITY B V8:')
    text = text.replace('qualityBHardLockV7: true', 'qualityBHardLockV7: false')
    return text


def patch_router(text: str) -> str:
    text = replace_once(
        text,
        "const FAST_80_RESCUE_PROFILE = 'sonara-fast-80-rescue-v1';\nconst MODEL = 'acestep-v15-xl-turbo';",
        "const FAST_80_RESCUE_PROFILE = 'sonara-fast-80-rescue-v1';\nconst QUALITY_AB_DIVERSITY_PROFILE = 'sonara-quality-ab-diversity-v8';\nconst MODEL = 'acestep-v15-xl-turbo';",
        'ROUTER_PROFILE'
    )

    text = replace_once(
        text,
        "  const qualitySafeB = profile === 'quality' && (body?.sonaraQualitySafeB === true || Number(body?.sonaraStabilityVariant) === 1);\n  const controls = {\n    weirdness: qualitySafeB ? 0 : rawControls.weirdness,\n    styleInfluence: qualitySafeB ? 100 : rawControls.styleInfluence\n  };",
        "  const qualityVariantB = profile === 'quality' && Number(body?.sonaraStabilityVariant) === 1;\n  const controls = {\n    weirdness: rawControls.weirdness,\n    styleInfluence: rawControls.styleInfluence\n  };",
        'ROUTER_B_CONTROLS'
    )

    text = replace_once(
        text,
        "      : (qualitySafeB\n        ? 0.68\n        : clamp(0.74 + controls.weirdness * 0.0006, 0.77, 0.74, 0.80)))",
        "      : clamp(0.74 + controls.weirdness * 0.0006, 0.77, 0.74, 0.80))",
        'ROUTER_B_LM_TEMPERATURE'
    )
    text = text.replace('(qualitySafeB ? 2.50 : clamp(2.10 + controls.styleInfluence * 0.004, 2.30, 2.10, 2.50))', 'clamp(2.10 + controls.styleInfluence * 0.004, 2.30, 2.10, 2.50)')
    text = replace_once(
        text,
        "  const humanTopP = realMusic ? (qualitySafeB ? 0.88 : clamp(0.90 + controls.weirdness * 0.0006, 0.93, 0.90, 0.96)) : 0.90;",
        "  const humanTopP = realMusic ? clamp(0.90 + controls.weirdness * 0.0006, 0.93, 0.90, 0.96) : 0.90;",
        'ROUTER_B_TOP_P'
    )

    old_candidate = "  const candidateDirection = qualitySafeB\n    ? 'QUALITY B HARD-LOCK V7: use the EXACT SAME song world and seed-base as A. Preserve creator prompt, genre/subgenre, mood, era, groove family, instrument palette, production language, singer identity, lyrics/language, BPM, key and atmosphere literally. Weirdness is forced to zero and style adherence to maximum. B may differ only in conservative phrase timing, voicings, fills and transitions. Never create a remix, hybrid, experimental version, neighboring genre, bizarre harmony, random structure or unrelated instrumentation. If uncertain, stay closer to A and to the creator brief.'"
    new_candidate = "  const candidateDirection = qualityVariantB\n    ? 'QUALITY B INDEPENDENT COMPOSITION V8: use the EXACT SAME creator brief but create a genuinely different song. Keep genre/subgenre, mood, era, groove identity, requested instruments, production language, singer identity, lyrics/language, BPM, key, duration and atmosphere locked. Use the independent seed supplied for B. Create a new melody and hook contour, different harmonic/voicing route, different bass phrasing, different drum/percussion phrasing, different section development, different transitions and a clearly distinct arrangement path. Never clone A, never reuse A as a conservative take, and never drift to a neighboring genre. SAME BRIEF; DIFFERENT SONG.'"
    text = replace_once(text, old_candidate, new_candidate, 'ROUTER_B_DIRECTION_V8')

    text = replace_once(
        text,
        "        ? 'QUALITY TWO-TAKE RULE: render two candidates from the EXACT SAME creator brief. A and B must share the requested concept, genre/subgenre, mood, era, instrumentation palette, groove family, production character, vocal intent, lyrics/language, BPM, key and atmosphere.'",
        "        ? 'QUALITY A/B DIVERSITY V8: render two genuinely different original compositions from the EXACT SAME creator brief. Preserve concept, genre/subgenre, mood, era, requested instrument palette, groove identity, production character, vocal intent, lyrics/language, BPM, key, duration and atmosphere, but force independent melody/hook, harmony or voicing route, bass phrasing, drum phrasing, section development and transitions.'",
        'ROUTER_TWO_TAKE_RULE_V8'
    )

    text = replace_once(
        text,
        "    lm_repetition_penalty: realMusic ? (profile === 'ultra' ? 1.08 : (qualitySafeB ? 1.02 : 1.04)) : 1.0,",
        "    lm_repetition_penalty: realMusic ? (profile === 'ultra' ? 1.08 : 1.04) : 1.0,",
        'ROUTER_B_REPETITION'
    )

    text = replace_once(
        text,
        "    sonara_quality_safe_b_v6: qualitySafeB,\n    sonara_quality_b_hard_lock_v7: qualitySafeB,\n    sonara_quality_same_seed_base_v7: profile === 'quality',\n    sonara_quality_seed_locked_v6: profile === 'quality',",
        "    sonara_quality_safe_b_v6: false,\n    sonara_quality_b_hard_lock_v7: false,\n    sonara_quality_same_seed_base_v7: false,\n    sonara_quality_seed_locked_v6: profile === 'quality',\n    sonara_quality_ab_diversity_profile: profile === 'quality' ? QUALITY_AB_DIVERSITY_PROFILE : null,\n    sonara_quality_independent_composition_v8: profile === 'quality',\n    sonara_quality_independent_seed_v8: profile === 'quality',\n    sonara_quality_variant_b_v8: qualityVariantB,",
        'ROUTER_FLAGS_V8'
    )

    text = replace_once(
        text,
        "    quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,\n    fast80RescueProfile: FAST_80_RESCUE_PROFILE,",
        "    quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,\n    fast80RescueProfile: FAST_80_RESCUE_PROFILE,\n    qualityABDiversificationProfile: profile === 'quality' ? QUALITY_AB_DIVERSITY_PROFILE : null,\n    qualityABIndependentCompositionV8: profile === 'quality',",
        'ROUTER_METADATA_V8'
    )

    text = replace_once(
        text,
        "    richArrangementProfile: RICH_ARRANGEMENT_PROFILE,\n    fast80RescueProfile: FAST_80_RESCUE_PROFILE,",
        "    richArrangementProfile: RICH_ARRANGEMENT_PROFILE,\n    fast80RescueProfile: FAST_80_RESCUE_PROFILE,\n    qualityABDiversificationProfile: QUALITY_AB_DIVERSITY_PROFILE,",
        'ROUTER_READINESS_V8'
    )

    if 'qualitySafeB' in text:
        raise SystemExit('ROUTER_OLD_QUALITY_SAFE_B_REMAINS')
    return text


def main() -> None:
    guard = patch_guard(GUARD.read_text(encoding='utf-8'))
    router = patch_router(ROUTER.read_text(encoding='utf-8'))
    GUARD.write_text(guard, encoding='utf-8')
    ROUTER.write_text(router, encoding='utf-8')

    for name, text in [('guard', guard), ('router', router)]:
        if PROFILE not in text:
            raise SystemExit(f'{name.upper()}_PROFILE_MISSING')
        if 'same seed-base as A' in text or 'same seed base as A' in text:
            raise SystemExit(f'{name.upper()}_OLD_SAME_SEED_CONTRACT_REMAINS')

    print('SONARA_QUALITY_AB_DIVERSITY_V8=PATCHED')
    print('QUALITY_A_B=SAME_BRIEF_DIFFERENT_COMPOSITIONS')
    print('QUALITY_B_SEED=INDEPENDENT_OFFSET_104729')
    print('QUALITY_B_CREATIVE_CONTROLS=PRESERVED_FROM_USER')
    print('FAST_STEPS=1 QUALITY_STEPS=2 ULTRA_STEPS=8 UNCHANGED')


if __name__ == '__main__':
    main()
