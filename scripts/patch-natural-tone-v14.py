#!/usr/bin/env python3
from pathlib import Path

PROMPT = Path('cloudflare/sonara-engine-v15-authoritative-prompt.mjs')
ROUTER = Path('cloudflare/sonara-molab-xl-router.mjs')
MARKER = 'sonara-natural-tone-v14'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY')
        return text
    if old not in text:
        raise SystemExit(f'{label}=PATTERN_MISSING')
    print(f'{label}=PATCHED')
    return text.replace(old, new, 1)


def replace_all(text: str, old: str, new: str, minimum: int, label: str) -> str:
    if new in text and old not in text:
        print(f'{label}=ALREADY')
        return text
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f'{label}=PATTERN_MISSING count={count} expected>={minimum}')
    print(f'{label}=PATCHED count={count}')
    return text.replace(old, new)


def patch_prompt(text: str) -> str:
    text = replace_once(
        text,
        "const RICH_ARRANGEMENT_ID = 'sonara-rich-arrangement-v13';\nconst MAX_PROMPT_CHARS = 3600;",
        "const RICH_ARRANGEMENT_ID = 'sonara-rich-arrangement-v13';\nconst NATURAL_TONE_ID = 'sonara-natural-tone-v14';\nconst MAX_PROMPT_CHARS = 3600;",
        'PROMPT_TONE_MARKER'
    )

    text = replace_once(
        text,
        "      const density = `at peak sections use about ${peak} complementary musical/production roles when authentic: core drums, secondary percussion/groove detail, bass, harmony, support harmony, hook/lead, counter-response, atmosphere/room, fills/ornaments and transition/FX. Thin intros, verses and breakdowns intentionally, then rebuild; do not run every layer continuously.`;",
        "      const density = `at peak use about ${peak} complementary roles when authentic: drums, secondary groove detail, bass, harmony, support, hook/lead, counter-response, atmosphere, fills and restrained transition FX. Keep roles spectrally separated: usually one bright hook/lead plus hat/cymbal detail at a time, with support layers warm or mid-focused. Thin quieter sections and rebuild; never stack constant bright top-end layers or run every layer continuously.`;",
        'SPECTRAL_DENSITY_GUARD'
    )

    text = replace_once(
        text,
        "function mixProfile() {\n  return 'MIX/MASTER: controlled sub, kick/bass separation, clean low-mids, defined transients, wide atmospheres, centered low end, musical sidechain, dynamic club-ready loudness, no clipping.';\n}",
        "function mixProfile() {\n  return 'MIX/MASTER: natural warm-neutral tonal balance, full intelligible mids, controlled presence, smooth non-hyped top end, soft but clear hats/cymbals, rounded transients, controlled sub, kick/bass separation, clean low-mids, centered low end, musical dynamics and release-ready loudness. No clipping, brittle highs, piercing/whistling resonances, fizzy treble or over-limiting.';\n}",
        'NATURAL_MIX_PROFILE'
    )

    text = replace_once(
        text,
        "    `FX/SOUND DESIGN: ${rich.effects}. Effects must announce, connect or resolve sections; never become random noise or replace musical content.`,",
        "    `FX/SOUND DESIGN: ${rich.effects}. Keep FX behind the musical content: sparse, smooth, level-controlled and short where possible. Never stack bright risers, impacts, reverse cymbals or noisy transitions together; avoid piercing or fizzy top-end energy.`,",
        'FX_RESTRAINT'
    )

    text = replace_once(
        text,
        "  return `CRITIC: reject contradictions, genre drift and demo-like sparsity. ${selected}, key, duration and structured controls win. ${bpmRule} ${conflictHint} Harmony, groove, instrumentation, density, effects and arrangement must reinforce each other. Avoid ${dna.avoid}.`;",
        "  return `CRITIC: reject contradictions, genre drift, demo-like sparsity, harshness, brittle highs, piercing resonances and excessive FX stacking. ${selected}, key, duration and structured controls win. ${bpmRule} ${conflictHint} Harmony, groove, instrumentation, density, effects and arrangement must reinforce each other. Avoid ${dna.avoid}.`;",
        'HARSHNESS_CRITIC'
    )

    text = replace_once(
        text,
        "    sonaraRichArrangement: RICH_ARRANGEMENT_ID,\n    sonaraCreatorStylePriority: false,",
        "    sonaraRichArrangement: RICH_ARRANGEMENT_ID,\n    sonaraNaturalTone: NATURAL_TONE_ID,\n    sonaraCreatorStylePriority: false,",
        'REQUEST_TONE_MARKER'
    )

    text = replace_once(
        text,
        "    sonaraHumanPerformanceIntelligence: true,\n    sonaraVocalIntelligence: true,",
        "    sonaraHumanPerformanceIntelligence: true,\n    sonaraHarshnessGuard: true,\n    sonaraSmoothTopEnd: true,\n    sonaraFxRestraint: true,\n    sonaraVocalIntelligence: true,",
        'REQUEST_TONE_FLAGS'
    )

    text = replace_once(
        text,
        "  headers.set('x-sonara-rich-arrangement', RICH_ARRANGEMENT_ID);\n  if (bpm !== null) {",
        "  headers.set('x-sonara-rich-arrangement', RICH_ARRANGEMENT_ID);\n  headers.set('x-sonara-natural-tone', NATURAL_TONE_ID);\n  if (bpm !== null) {",
        'TONE_HEADER'
    )

    text = replace_once(
        text,
        "      richArrangement: RICH_ARRANGEMENT_ID,\n      bpmRange: `${BPM_MIN}-${BPM_MAX}`,",
        "      richArrangement: RICH_ARRANGEMENT_ID,\n      naturalTone: NATURAL_TONE_ID,\n      bpmRange: `${BPM_MIN}-${BPM_MAX}`,",
        'HEALTH_TONE_MARKER'
    )

    text = replace_once(
        text,
        "      humanPerformanceIntelligence: true,\n      vocalIntelligence: true,",
        "      humanPerformanceIntelligence: true,\n      harshnessGuard: true,\n      smoothTopEnd: true,\n      fxRestraint: true,\n      vocalIntelligence: true,",
        'HEALTH_TONE_FLAGS'
    )

    return text


def patch_router(text: str) -> str:
    text = replace_once(
        text,
        "const RICH_ARRANGEMENT_PROFILE = 'sonara-rich-arrangement-v13';\nconst MODEL = 'acestep-v15-xl-turbo';",
        "const RICH_ARRANGEMENT_PROFILE = 'sonara-rich-arrangement-v13';\nconst NATURAL_TONE_PROFILE = 'sonara-natural-tone-v14';\nconst MODEL = 'acestep-v15-xl-turbo';",
        'ROUTER_TONE_MARKER'
    )

    text = replace_once(
        text,
        "'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-MoLab-Profile,X-Sonara-Fidelity-Profile,X-Sonara-Real-Music,X-Sonara-ACE-Worker',",
        "'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-MoLab-Profile,X-Sonara-Fidelity-Profile,X-Sonara-Real-Music,X-Sonara-Rich-Arrangement,X-Sonara-Natural-Tone,X-Sonara-ACE-Worker',",
        'CORS_TONE_HEADER'
    )

    text = replace_all(
        text,
        "      'x-sonara-rich-arrangement': RICH_ARRANGEMENT_PROFILE,",
        "      'x-sonara-rich-arrangement': RICH_ARRANGEMENT_PROFILE,\n      'x-sonara-natural-tone': NATURAL_TONE_PROFILE,",
        1,
        'JSON_TONE_HEADER'
    )

    text = replace_once(
        text,
        "    'Distribute layers by register, frequency and musical function. Use section-specific entrances/exits, call-and-response, evolving automation and contrast so the track feels dense and expensive without becoming muddy or overcrowded.',",
        "    'Distribute layers by register, frequency and musical function. Keep upper-mid and high-frequency roles deliberately sparse: usually one bright focal element plus natural hat/cymbal detail, never several sharp leads, noisy risers and bright percussion fighting at once. Use section-specific entrances/exits, call-and-response, evolving automation and contrast so the track feels rich without becoming harsh or overcrowded.',",
        'FIDELITY_SPECTRAL_BALANCE'
    )

    text = replace_once(
        text,
        "    'Prioritize clean transients, controlled low end, intelligible mids, non-harsh highs, stereo depth, dynamics and a release-ready master.'",
        "    'Prioritize rounded natural transients, controlled low end, full intelligible mids, smooth non-hyped highs, stereo depth, dynamics and a release-ready master. Reject piercing resonances, brittle hats/cymbals, shrill leads, fizzy treble, abrasive distortion and over-bright mastering.'",
        'FIDELITY_NATURAL_MASTER'
    )

    text = replace_once(
        text,
        "      ? 'generic style drift, wrong BPM, wrong key, robotic quantization, static velocity, identical repeated bars, identical drum velocities, copy-paste phrasing, cloned chorus performance, fixed vibrato, pitch-staircase tuning, breathless synthetic vocal, plastic timbre, metallic artifacts, harsh clipping, overcompression, phasey stereo, hard ambience resets, accidental silence, malformed ending, unwanted vocals'",
        "      ? 'generic style drift, wrong BPM, wrong key, robotic quantization, static velocity, identical repeated bars, identical drum velocities, copy-paste phrasing, cloned chorus performance, fixed vibrato, pitch-staircase tuning, breathless synthetic vocal, plastic timbre, metallic artifacts, harsh clipping, piercing highs, brittle cymbals, shrill leads, whistling resonances, fizzy treble, abrasive upper mids, overly sharp transients, stacked bright risers, excessive noise FX, overcompression, phasey stereo, hard ambience resets, accidental silence, malformed ending, unwanted vocals'",
        'NEGATIVE_HARSHNESS_GUARD'
    )

    text = replace_once(
        text,
        "    dcw_enabled: true,\n    dcw_mode: 'double',\n    dcw_scaler: 0.05,\n    dcw_high_scaler: 0.02,",
        "    dcw_enabled: true,\n    dcw_mode: 'low',\n    dcw_scaler: 0.02,\n    dcw_high_scaler: 0.0,",
        'CONSERVATIVE_DCW'
    )

    text = replace_all(
        text,
        "  out.set('x-sonara-rich-arrangement', RICH_ARRANGEMENT_PROFILE);",
        "  out.set('x-sonara-rich-arrangement', RICH_ARRANGEMENT_PROFILE);\n  out.set('x-sonara-natural-tone', NATURAL_TONE_PROFILE);",
        1,
        'AUDIO_TONE_HEADER'
    )

    text = replace_once(
        text,
        "    richArrangementProfile: RICH_ARRANGEMENT_PROFILE,\n    fullInstrumentation: true,",
        "    richArrangementProfile: RICH_ARRANGEMENT_PROFILE,\n    naturalToneProfile: NATURAL_TONE_PROFILE,\n    harshnessGuard: true,\n    smoothTopEnd: true,\n    fxRestraint: true,\n    fullInstrumentation: true,",
        'READINESS_TONE_METADATA'
    )

    text = replace_once(
        text,
        "    dcwEnabled: true,\n    maxBatchSize: 2,",
        "    dcwEnabled: true,\n    dcwMode: 'low',\n    dcwScaler: 0.02,\n    dcwHighScaler: 0.0,\n    maxBatchSize: 2,",
        'READINESS_DCW_METADATA'
    )

    text = replace_once(
        text,
        "  headers.set('x-sonara-rich-arrangement', RICH_ARRANGEMENT_PROFILE);\n  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });",
        "  headers.set('x-sonara-rich-arrangement', RICH_ARRANGEMENT_PROFILE);\n  headers.set('x-sonara-natural-tone', NATURAL_TONE_PROFILE);\n  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });",
        'WITH_HEADERS_TONE'
    )

    return text


def main() -> None:
    prompt = PROMPT.read_text(encoding='utf-8')
    router = ROUTER.read_text(encoding='utf-8')

    prompt = patch_prompt(prompt)
    router = patch_router(router)

    PROMPT.write_text(prompt, encoding='utf-8')
    ROUTER.write_text(router, encoding='utf-8')

    if MARKER not in prompt or MARKER not in router:
        raise SystemExit('NATURAL_TONE_MARKER_MISSING')

    print('SONARA_NATURAL_TONE_V14=PATCHED')
    print('QUALITY_SPEED_CONTRACT=UNCHANGED fast=1 quality=2 ultra=8 batch=2')
    print('DCW=low scaler=0.02 high=0.0')


if __name__ == '__main__':
    main()
