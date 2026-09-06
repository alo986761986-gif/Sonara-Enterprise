#!/usr/bin/env python3
from pathlib import Path

PROMPT = Path('cloudflare/sonara-engine-v15-authoritative-prompt.mjs')
ROUTER = Path('cloudflare/sonara-molab-xl-router.mjs')
PROFILE = 'sonara-musical-complexity-v16'


def once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY')
        return text
    if old not in text:
        raise SystemExit(f'{label}=PATTERN_MISSING')
    print(f'{label}=PATCHED')
    return text.replace(old, new, 1)


def patch_prompt(text: str) -> str:
    text = once(
        text,
        "const RICH_ARRANGEMENT_ID = 'sonara-rich-arrangement-v13';\nconst NATURAL_TONE_ID = 'sonara-natural-tone-v15-silk';",
        "const RICH_ARRANGEMENT_ID = 'sonara-rich-arrangement-v13';\nconst MUSICAL_COMPLEXITY_ID = 'sonara-musical-complexity-v16';\nconst NATURAL_TONE_ID = 'sonara-natural-tone-v15-silk';",
        'COMPLEXITY_MARKER'
    )
    text = once(
        text,
        "      const density = `at peak use about ${peak} complementary roles when authentic: drums, secondary groove detail, bass, harmony, support, hook/lead, counter-response, atmosphere, fills and restrained transition FX. Keep roles spectrally separated: usually one bright hook/lead plus hat/cymbal detail at a time, with support layers warm or mid-focused. Thin quieter sections and rebuild; never stack constant bright top-end layers or run every layer continuously.`;",
        "      const density = `at peak use about ${peak} complementary roles when authentic: drums, secondary groove detail, bass, harmony, support, hook/lead, counter-response, atmosphere, fills and restrained transition FX. Build complexity through interaction, not clutter: use evolving counter-melodies, question/answer motifs, syncopated secondary rhythms, changing chord voicings, tasteful passing tones, phrase-end ornaments, evolving automation, micro-variation every 2-4 bars and clear section-specific role changes. Keep roles spectrally separated: usually one bright hook/lead plus hat/cymbal detail at a time, with support layers warm or mid-focused. Thin quieter sections and rebuild; never stack constant bright top-end layers or run every layer continuously.`;",
        'COMPLEX_DENSITY'
    )
    text = once(
        text,
        "  return `CRITIC: reject contradictions, genre drift, demo-like sparsity, harshness, brittle highs, piercing resonances, metallic upper mids, excessive sibilance, glassy cymbals and excessive FX stacking. Preserve warmth and detail; solve harshness dynamically rather than making the mix dark. ${selected}, key, duration and structured controls win. ${bpmRule} ${conflictHint} Harmony, groove, instrumentation, density, effects and arrangement must reinforce each other. Avoid ${dna.avoid}.`;",
        "  return `CRITIC: reject contradictions, genre drift, demo-like sparsity, simplistic repetition, underdeveloped sections, harshness, brittle highs, piercing resonances, metallic upper mids, excessive sibilance, glassy cymbals and excessive FX stacking. Preserve warmth and detail; solve harshness dynamically rather than making the mix dark. Complexity must come from musical development, interplay, motif transformation, rhythmic variation, harmonic movement and arrangement evolution, never random extra layers. ${selected}, key, duration and structured controls win. ${bpmRule} ${conflictHint} Harmony, groove, instrumentation, density, effects and arrangement must reinforce each other. Avoid ${dna.avoid}.`;",
        'COMPLEXITY_CRITIC'
    )
    text = once(
        text,
        "    sonaraRichArrangement: RICH_ARRANGEMENT_ID,\n    sonaraNaturalTone: NATURAL_TONE_ID,",
        "    sonaraRichArrangement: RICH_ARRANGEMENT_ID,\n    sonaraMusicalComplexity: MUSICAL_COMPLEXITY_ID,\n    sonaraNaturalTone: NATURAL_TONE_ID,",
        'REQUEST_COMPLEXITY_MARKER'
    )
    return text


def patch_router(text: str) -> str:
    text = once(
        text,
        "const RICH_ARRANGEMENT_PROFILE = 'sonara-rich-arrangement-v13';\nconst NATURAL_TONE_PROFILE = 'sonara-natural-tone-v15-silk';",
        "const RICH_ARRANGEMENT_PROFILE = 'sonara-rich-arrangement-v13';\nconst MUSICAL_COMPLEXITY_PROFILE = 'sonara-musical-complexity-v16';\nconst NATURAL_TONE_PROFILE = 'sonara-natural-tone-v15-silk';",
        'ROUTER_COMPLEXITY_MARKER'
    )
    text = once(
        text,
        "    'SONARA FULL INSTRUMENTATION V12: make the arrangement feel full, rich, layered and professionally produced rather than sparse or demo-like.',",
        "    'SONARA FULL INSTRUMENTATION V12: make the arrangement feel full, rich, layered and professionally produced rather than sparse or demo-like.',\n    'SONARA MUSICAL COMPLEXITY V16: make the composition feel intentionally developed across time. Introduce motif transformations, counter-lines, secondary rhythmic cells, chord-voicing changes, bass variations, call-and-response, 2-4 bar micro-variations, phrase-end fills, evolving automation, dynamic role swaps and section-specific orchestration. Each chorus/drop/return should evolve from the previous one rather than repeat identically. Complexity must remain genre-authentic, coherent and memorable; never add random layers merely to increase density.',",
        'ROUTER_COMPLEXITY_INSTRUCTION'
    )
    text = once(
        text,
        "    richArrangementProfile: RICH_ARRANGEMENT_PROFILE,\n    naturalToneProfile: NATURAL_TONE_PROFILE,",
        "    richArrangementProfile: RICH_ARRANGEMENT_PROFILE,\n    musicalComplexityProfile: MUSICAL_COMPLEXITY_PROFILE,\n    naturalToneProfile: NATURAL_TONE_PROFILE,",
        'ROUTER_COMPLEXITY_METADATA'
    )
    return text


def main() -> None:
    p = patch_prompt(PROMPT.read_text(encoding='utf-8'))
    r = patch_router(ROUTER.read_text(encoding='utf-8'))
    PROMPT.write_text(p, encoding='utf-8')
    ROUTER.write_text(r, encoding='utf-8')
    if PROFILE not in p or PROFILE not in r:
        raise SystemExit('MUSICAL_COMPLEXITY_V16_MARKER_MISSING')
    print('SONARA_MUSICAL_COMPLEXITY_V16=PATCHED')
    print('PRESERVE=NATURAL_TONE_V15_SILK FAST1 QUALITY2 ULTRA2 RICH_V13')


if __name__ == '__main__':
    main()
