from pathlib import Path

# Trigger marker: 2026-09-03 QUALITY B STRICT V5
GUARD = Path('cloudflare/sonara-quality-ultra-stability-guard.mjs')
MOLAB = Path('cloudflare/sonara-molab-xl-router.mjs')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY_PATCHED')
        return text
    if old not in text:
        raise SystemExit(f'{label}=OLD_MARKER_NOT_FOUND')
    print(f'{label}=PATCHED')
    return text.replace(old, new, 1)


def patch_guard() -> None:
    text = GUARD.read_text(encoding='utf-8')

    old = """  const promptFidelity = 'FINAL PROMPT FIDELITY CONTRACT — NON-NEGOTIABLE: the creator prompt is the source of truth for BOTH Song A and Song B. Preserve every explicit semantic requirement from the prompt: musical concept, genre and subgenre, mood, era, energy, instrumentation, production style, rhythmic feel, vocal role and identity, language, lyrics, theme/story, atmosphere, exclusions, exact BPM/key/duration when specified, and all named creative details. Song B must sound like a second original composition commissioned from the EXACT SAME brief, never like a different prompt. Independence applies only to the musical solution, not to the requested identity or meaning.';
  const direction = variantIndex === 0
    ? 'SONARA SONG A — compose the first complete realization of the creator prompt. Follow the prompt literally and musically: no genre drift, no mood drift, no missing requested instruments or vocal intent.'
    : 'SONARA SONG B — compose a genuinely different song for the EXACT SAME creator prompt. Use a new melody, harmonic route/voicings, bass phrasing, drum details, hook contour, transitions and section development, while preserving ALL prompt semantics and stylistic requirements. Do not change concept, genre/subgenre, mood, era, instrumentation brief, production character, vocal intent, lyrics/theme or requested atmosphere. If novelty conflicts with prompt fidelity, PROMPT FIDELITY ALWAYS WINS.';
  const fidelity = profile === 'ultra'
    ? 'ULTRA: maximize realism, transient detail, depth, natural vocals, human micro-variation and mastering polish without changing the creator intent.'
    : 'QUALITY: prioritize authentic genre language, strong songwriting, natural dynamics, clean transients and release-ready balance.';"""

    new = """  const promptFidelity = profile === 'quality'
    ? 'QUALITY SAME-PROMPT CONTRACT — ABSOLUTE: both visible songs must execute the exact same creator brief. Preserve concept, genre/subgenre, mood, era, energy, requested instruments, rhythmic feel, production character, vocal role/identity, language, lyrics/theme, atmosphere, exclusions, BPM, key and duration. Do not invent a neighboring style, new concept, unrelated instrumentation or experimental detour. Candidate B is an alternate TAKE of the same requested song brief, not a reinterpretation.'
    : 'FINAL PROMPT FIDELITY CONTRACT — NON-NEGOTIABLE: the creator prompt is the source of truth for BOTH Song A and Song B. Preserve every explicit semantic requirement from the prompt: musical concept, genre and subgenre, mood, era, energy, instrumentation, production style, rhythmic feel, vocal role and identity, language, lyrics, theme/story, atmosphere, exclusions, exact BPM/key/duration when specified, and all named creative details. Song B must sound like a second original composition commissioned from the EXACT SAME brief, never like a different prompt. Independence applies only to the musical solution, not to the requested identity or meaning.';
  const direction = profile === 'quality'
    ? (variantIndex === 0
      ? 'SONARA QUALITY A/B — render two faithful takes of this exact prompt. A and B must immediately sound like the same requested musical brief. Variation is bounded: change only melody phrasing, chord voicing detail, fills and transition details that are fully native to the requested style. Keep the same musical identity, palette, mood, groove family and production language.'
      : 'SONARA QUALITY B RECOVERY — regenerate the exact same creator prompt conservatively. This is not a new concept and not an independent stylistic experiment. Preserve the requested musical identity literally; use only small genre-authentic changes in melody phrasing, voicing, fills and transitions. PROMPT FIDELITY OVERRIDES NOVELTY.')
    : (variantIndex === 0
      ? 'SONARA SONG A — compose the first complete realization of the creator prompt. Follow the prompt literally and musically: no genre drift, no mood drift, no missing requested instruments or vocal intent.'
      : 'SONARA SONG B — compose a genuinely different song for the EXACT SAME creator prompt. Use a new melody, harmonic route/voicings, bass phrasing, drum details, hook contour, transitions and section development, while preserving ALL prompt semantics and stylistic requirements. Do not change concept, genre/subgenre, mood, era, instrumentation brief, production character, vocal intent, lyrics/theme or requested atmosphere. If novelty conflicts with prompt fidelity, PROMPT FIDELITY ALWAYS WINS.');
  const fidelity = profile === 'ultra'
    ? 'ULTRA: maximize realism, transient detail, depth, natural vocals, human micro-variation and mastering polish without changing the creator intent.'
    : 'QUALITY STRICT: literal prompt fidelity first; authentic genre language, coherent songwriting, natural dynamics, clean transients and release-ready balance. Never trade prompt accuracy for novelty.';"""
    text = replace_once(text, old, new, 'QUALITY_DIRECTION')

    old = """    sonaraPromptFidelity: 'strict',
    sonaraCreatorIntentLocked: true,
    prompt: [prompt, `SONARA ${profile.toUpperCase()} STABILITY DIRECTOR.`, fidelity, direction, promptFidelity, `Independent composition seed=${independentSeed}.`].filter(Boolean).join('\\n\\n').slice(0, 12000)"""
    new = """    sonaraPromptFidelity: profile === 'quality' ? 'literal-same-brief' : 'strict',
    sonaraCreatorIntentLocked: true,
    sonaraQualityBSafeV5: profile === 'quality',
    prompt: [prompt, `SONARA ${profile.toUpperCase()} STABILITY DIRECTOR.`, fidelity, direction, promptFidelity, `${profile === 'quality' ? 'Faithful take' : 'Independent composition'} seed=${independentSeed}.`].filter(Boolean).join('\\n\\n').slice(0, 12000)"""
    text = replace_once(text, old, new, 'QUALITY_METADATA')

    old = """    const bestScore = Number(primaryRank.summary?.bestProfessionalScore || 0);
    if (state.profile !== 'ultra' && primaryRank.ranked.length && bestScore >= Number(state.targetScore) && primaryRank.ranked[0]?.report?.professionalReleasePassed === true) {
      return finalize(request, env, jobId, state, [primaryData], {
        adaptiveEarlyRelease: true,
        secondaryBatchSkippedBecauseTargetPassed: true,
        primaryQualityReportsReused: true
      });
    }
    const secondary = await submitSecondary(request, env, ctx, state, jobId);"""
    new = """    const bestScore = Number(primaryRank.summary?.bestProfessionalScore || 0);
    if (state.profile === 'quality' && primaryRank.ranked.length >= 2) {
      return finalize(request, env, jobId, state, [primaryData], {
        qualitySamePromptPair: true,
        qualityBPromptFidelity: 'literal-same-brief',
        secondaryBatchSkippedForPromptFidelity: true,
        primaryQualityReportsReused: true
      });
    }
    if (state.profile !== 'ultra' && primaryRank.ranked.length && bestScore >= Number(state.targetScore) && primaryRank.ranked[0]?.report?.professionalReleasePassed === true) {
      return finalize(request, env, jobId, state, [primaryData], {
        adaptiveEarlyRelease: true,
        secondaryBatchSkippedBecauseTargetPassed: true,
        primaryQualityReportsReused: true
      });
    }
    const secondary = await submitSecondary(request, env, ctx, state, jobId);"""
    text = replace_once(text, old, new, 'QUALITY_PRIMARY_PAIR')

    old = """      generatedCandidateTarget: 4,
      visibleCandidateTarget: 2,"""
    new = """      generatedCandidateTarget: profile === 'quality' ? 2 : 4,
      visibleCandidateTarget: 2,
      qualitySamePromptPairPreferred: profile === 'quality',"""
    text = replace_once(text, old, new, 'QUALITY_TARGET')

    GUARD.write_text(text, encoding='utf-8')


def patch_molab() -> None:
    text = MOLAB.read_text(encoding='utf-8')

    old = """  const humanLmTemperature = realMusic ? (profile === 'ultra' ? clamp(0.78 + controls.weirdness * 0.001, 0.82, 0.88) : clamp(0.74 + controls.weirdness * 0.001, 0.76, 0.84)) : 0.85;
  const humanLmCfgScale = realMusic ? clamp(2.10 + controls.styleInfluence * 0.004, 2.10, 2.50) : 2.0;
  const humanTopP = realMusic ? clamp(0.90 + controls.weirdness * 0.0006, 0.90, 0.96) : 0.90;"""
    new = """  const humanLmTemperature = realMusic
    ? (profile === 'ultra'
      ? clamp(0.82 + controls.weirdness * 0.0006, 0.85, 0.82, 0.88)
      : clamp(0.74 + controls.weirdness * 0.0006, 0.77, 0.74, 0.80))
    : 0.85;
  const humanLmCfgScale = realMusic ? clamp(2.10 + controls.styleInfluence * 0.004, 2.30, 2.10, 2.50) : 2.0;
  const humanTopP = realMusic ? clamp(0.90 + controls.weirdness * 0.0006, 0.93, 0.90, 0.96) : 0.90;"""
    text = replace_once(text, old, new, 'LM_CLAMP_FIX')

    old = """  const candidateDirection = count === 2
    ? 'Render two candidates in one GPU batch. Both MUST preserve the same creator style, BPM, key, lyrics and vocal-language locks. Candidate A prioritizes hook and groove. Candidate B changes melody, voicing, transitions and timbral balance without changing genre identity.'
    : 'Render one highly faithful professional master with strong hook, groove, coherent structure and production detail.';"""
    new = """  const candidateDirection = count === 2
    ? (profile === 'quality'
      ? 'QUALITY TWO-TAKE RULE: render two candidates from the EXACT SAME creator brief. A and B must share the requested concept, genre/subgenre, mood, era, instrumentation palette, groove family, production character, vocal intent, lyrics/language, BPM, key and atmosphere. Candidate B is only a faithful alternate take: vary melody phrasing, chord voicing details, fills and transitions inside the exact style. Do NOT introduce a new style, new concept, unrelated instruments, experimental detour or different emotional direction. If uncertain, repeat the creator intent more literally rather than becoming novel.'
      : 'Render two candidates in one GPU batch. Both MUST preserve the same creator style, BPM, key, lyrics and vocal-language locks. Candidate A prioritizes hook and groove. Candidate B changes melody, voicing, transitions and timbral balance without changing genre identity.')
    : 'Render one highly faithful professional master with strong hook, groove, coherent structure and production detail.';"""
    text = replace_once(text, old, new, 'QUALITY_CANDIDATE_DIRECTION')

    MOLAB.write_text(text, encoding='utf-8')


patch_guard()
patch_molab()
print('SONARA_QUALITY_B_STRICT_V5=PATCHED')
