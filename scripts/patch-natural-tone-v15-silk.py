#!/usr/bin/env python3
from pathlib import Path

PROMPT = Path('cloudflare/sonara-engine-v15-authoritative-prompt.mjs')
ROUTER = Path('cloudflare/sonara-molab-xl-router.mjs')
EDGE = Path('cloudflare/sonara-real-music-v2-edge.mjs')
OLD = 'sonara-natural-tone-v14'
NEW = 'sonara-natural-tone-v15-silk'


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY')
        return text
    if old not in text:
        raise SystemExit(f'{label}=PATTERN_MISSING')
    print(f'{label}=PATCHED')
    return text.replace(old, new)


def patch_prompt(text: str) -> str:
    text = text.replace(OLD, NEW)
    text = replace_required(
        text,
        "MIX/MASTER: natural warm-neutral tonal balance, full intelligible mids, controlled presence, smooth non-hyped top end, soft but clear hats/cymbals, rounded transients, controlled sub, kick/bass separation, clean low-mids, centered low end, musical dynamics and release-ready loudness. No clipping, brittle highs, piercing/whistling resonances, fizzy treble or over-limiting.",
        "MIX/MASTER: warm-neutral, silky and fatigue-free while preserving clarity, punch and air. Keep 2.5-6 kHz presence controlled and musical; dynamically tame aggressive 3-5 kHz edges instead of dulling the whole mix. Keep 6-10 kHz hats, cymbals, sibilance and bright synth texture smooth and de-essed, with no glassy or metallic spikes. Above 10 kHz retain soft natural air without hiss or hyped sheen. Use rounded transients, full intelligible mids, controlled sub, kick/bass separation, clean low-mids, centered low end, musical dynamics and release-ready loudness. No clipping, brittle highs, piercing/whistling resonances, shrill vocals/leads, fizzy treble, abrasive saturation or over-limiting.",
        'SILK_MIX_PROFILE'
    )
    text = replace_required(
        text,
        "CRITIC: reject contradictions, genre drift, demo-like sparsity, harshness, brittle highs, piercing resonances and excessive FX stacking.",
        "CRITIC: reject contradictions, genre drift, demo-like sparsity, harshness, brittle highs, piercing resonances, metallic upper mids, excessive sibilance, glassy cymbals and excessive FX stacking. Preserve warmth and detail; solve harshness dynamically rather than making the mix dark.",
        'SILK_CRITIC'
    )
    return text


def patch_router(text: str) -> str:
    text = text.replace(OLD, NEW)
    text = replace_required(
        text,
        "Prioritize rounded natural transients, controlled low end, full intelligible mids, smooth non-hyped highs, stereo depth, dynamics and a release-ready master. Reject piercing resonances, brittle hats/cymbals, shrill leads, fizzy treble, abrasive distortion and over-bright mastering.",
        "Prioritize rounded natural transients, controlled low end, full intelligible mids, silky non-hyped highs, stereo depth, dynamics and a release-ready master. Keep presence energy around 2.5-6 kHz controlled; dynamically soften aggressive 3-5 kHz edges. De-ess and smooth 6-10 kHz hats, cymbals, vocals and bright synth texture while preserving natural air above 10 kHz. Reject piercing resonances, metallic upper mids, brittle hats/cymbals, shrill leads or vocals, fizzy treble, abrasive distortion and over-bright mastering.",
        'SILK_FIDELITY_MASTER'
    )
    text = text.replace(
        'piercing highs, brittle cymbals, shrill leads, whistling resonances, fizzy treble, abrasive upper mids, overly sharp transients, stacked bright risers, excessive noise FX',
        'piercing highs, brittle cymbals, shrill leads, shrill vocals, whistling resonances, fizzy treble, metallic upper mids, glassy 3-6 kHz presence, excessive 6-10 kHz sibilance, abrasive upper mids, overly sharp transients, stacked bright risers, excessive noise FX'
    )
    return text


def patch_edge(text: str) -> str:
    return text.replace(OLD, NEW)


def main() -> None:
    prompt = patch_prompt(PROMPT.read_text(encoding='utf-8'))
    router = patch_router(ROUTER.read_text(encoding='utf-8'))
    edge = patch_edge(EDGE.read_text(encoding='utf-8'))
    PROMPT.write_text(prompt, encoding='utf-8')
    ROUTER.write_text(router, encoding='utf-8')
    EDGE.write_text(edge, encoding='utf-8')
    for path, text in ((PROMPT, prompt), (ROUTER, router), (EDGE, edge)):
        if NEW not in text:
            raise SystemExit(f'SILK_MARKER_MISSING={path}')
    print('SONARA_NATURAL_TONE_V15_SILK=PATCHED')
    print('TARGET=dynamic 3-5k control + smooth/de-ess 6-10k + soft air >10k')
    print('PRESERVE=arrangement,punch,stereo,detail,speed')


if __name__ == '__main__':
    main()
