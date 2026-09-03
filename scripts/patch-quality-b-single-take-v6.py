from pathlib import Path

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

    text = replace_once(
        text,
        "function makeVariantBody(body, profile, variantIndex) {\n  const prompt = clean(body.prompt || body.creatorPrompt || body.rawPrompt || body.musicPrompt);\n  const entropy = crypto.getRandomValues(new Uint32Array(2));\n  const suppliedSeed = Number(body.seed) > 0 ? Math.floor(Number(body.seed)) : Number(entropy[0]);\n  const independentSeed = Math.max(1, (suppliedSeed + Number(entropy[0]) + Number(entropy[1]) + (variantIndex + 1) * 15485863) % 1999999973);",
        "function makeVariantBody(body, profile, variantIndex, retryIndex = 0) {\n  const prompt = clean(body.prompt || body.creatorPrompt || body.rawPrompt || body.musicPrompt);\n  const entropy = crypto.getRandomValues(new Uint32Array(2));\n  const suppliedSeed = Number(body.seed) > 0 ? Math.floor(Number(body.seed)) : Number(entropy[0]);\n  const qualitySeed = Math.max(1, (suppliedSeed + variantIndex * 104729 + retryIndex * 32452843) % 1999999973);\n  const independentSeed = profile === 'quality'\n    ? qualitySeed\n    : Math.max(1, (suppliedSeed + Number(entropy[0]) + Number(entropy[1]) + (variantIndex + 1) * 15485863) % 1999999973);",
        'QUALITY_SEED_CONTROL'
    )

    text = replace_once(
        text,
        "    ? (variantIndex === 0\n      ? 'SONARA QUALITY A/B — render two faithful takes of this exact prompt. A and B must immediately sound like the same requested musical brief. Variation is bounded: change only melody phrasing, chord voicing detail, fills and transition details that are fully native to the requested style. Keep the same musical identity, palette, mood, groove family and production language.'\n      : 'SONARA QUALITY B RECOVERY — regenerate the exact same creator prompt conservatively. This is not a new concept and not an independent stylistic experiment. Preserve the requested musical identity literally; use only small genre-authentic changes in melody phrasing, voicing, fills and transitions. PROMPT FIDELITY OVERRIDES NOVELTY.')",
        "    ? (variantIndex === 0\n      ? 'SONARA QUALITY A PRIMARY SINGLE TAKE — render one complete, literal realization of this exact creator brief. Stay inside the requested genre, mood, instrumentation, groove family, vocal intent and production language. This take establishes the reference identity for QUALITY.'\n      : 'SONARA QUALITY B SAFE SINGLE TAKE — render one conservative alternate take of the EXACT SAME creator brief. B is not a new concept, remix, neighboring genre or experimental interpretation. Preserve the same genre/subgenre, mood, era, instrumentation palette, groove family, production language, vocal identity, lyrics/language, BPM, key and atmosphere. Only small genre-authentic differences in melody phrasing, voicings, fills and transitions are allowed. PROMPT FIDELITY OVERRIDES NOVELTY.')",
        'QUALITY_SINGLE_TAKE_DIRECTION'
    )

    text = replace_once(
        text,
        "    candidateCount: 2,\n    candidate_count: 2,\n    dualFast: true,",
        "    candidateCount: profile === 'quality' ? 1 : 2,\n    candidate_count: profile === 'quality' ? 1 : 2,\n    dualFast: profile !== 'quality',",
        'QUALITY_SINGLE_CANDIDATE'
    )

    text = replace_once(
        text,
        "    sonaraQualityBSafeV5: profile === 'quality',\n    prompt: [prompt, `SONARA ${profile.toUpperCase()} STABILITY DIRECTOR.`, fidelity, direction, promptFidelity, `${profile === 'quality' ? 'Faithful take' : 'Independent composition'} seed=${independentSeed}.`].filter(Boolean).join('\\n\\n').slice(0, 12000)",
        "    sonaraQualityBSafeV5: profile === 'quality',\n    sonaraQualityBSafeV6: profile === 'quality',\n    sonaraQualitySafeB: profile === 'quality' && variantIndex === 1,\n    sonaraQualityRetry: retryIndex,\n    sonaraStabilityInstruction: [fidelity, direction, promptFidelity].filter(Boolean).join('\\n\\n').slice(0, 6000),\n    sonaraQualityTakeInstruction: profile === 'quality' ? [direction, promptFidelity].filter(Boolean).join('\\n\\n').slice(0, 5000) : '',\n    prompt: [prompt, `SONARA ${profile.toUpperCase()} STABILITY DIRECTOR.`, fidelity, direction, promptFidelity, `${profile === 'quality' ? 'Controlled take' : 'Independent composition'} seed=${independentSeed}.`].filter(Boolean).join('\\n\\n').slice(0, 12000)",
        'QUALITY_DEDICATED_LOCK'
    )

    text = replace_once(
        text,
        "  let visibleSource = combined.ranked.slice(0, 2);\n  if (state.profile === 'ultra') {",
        "  let visibleSource = combined.ranked.slice(0, 2);\n  if (state.profile === 'quality') {\n    const bestByChild = new Map();\n    for (const item of combined.ranked) {\n      const childIndex = Number(item?.report?.childIndex);\n      if (Number.isInteger(childIndex) && !bestByChild.has(childIndex)) bestByChild.set(childIndex, item);\n    }\n    visibleSource = [bestByChild.get(0), bestByChild.get(1)].filter(Boolean);\n    if (visibleSource.length < 2) {\n      return json(request, {\n        jobId,\n        status: 'FAILED',\n        progress: 100,\n        retryable: true,\n        error: 'QUALITY richiede due take singole valide A e B. Il lato B non viene pubblicato se manca o non completa correttamente.',\n        metadata: { profile: state.profile, stabilityGuard: VERSION, qualitySequentialSingleTakes: true, validTakes: visibleSource.length }\n      }, 502);\n    }\n  }\n  if (state.profile === 'ultra') {",
        'QUALITY_ONE_PER_CHILD'
    )

    text = replace_once(
        text,
        "      independentABSelection: state.profile === 'ultra' ? 'best-one-per-independent-batch' : 'global-ranking',",
        "      independentABSelection: state.profile === 'ultra' ? 'best-one-per-independent-batch' : (state.profile === 'quality' ? 'one-approved-take-per-sequential-job' : 'global-ranking'),\n      qualitySequentialSingleTakes: state.profile === 'quality',\n      qualityBStrictPublishGate: state.profile === 'quality',",
        'QUALITY_METADATA_V6'
    )

    text = replace_once(
        text,
        "async function submitSecondary(request, env, ctx, state, jobId) {\n  const body = makeVariantBody(state.originalBody || {}, state.profile, 1);",
        "async function submitSecondary(request, env, ctx, state, jobId, retryIndex = Number(state.secondaryRetryCount || 0)) {\n  const body = makeVariantBody(state.originalBody || {}, state.profile, 1, retryIndex);",
        'QUALITY_RETRY_SEED'
    )

    text = replace_once(
        text,
        "async function startStable(request, env, ctx, body, profile) {\n  const primaryBody = makeVariantBody(body, profile, 0);",
        "async function startStable(request, env, ctx, body, profile) {\n  const qualityBaseSeed = profile === 'quality'\n    ? Math.max(1, (Number(body.seed) > 0 ? Math.floor(Number(body.seed)) : Number(crypto.getRandomValues(new Uint32Array(1))[0])) % 1999999973)\n    : null;\n  const stableBody = qualityBaseSeed ? { ...body, seed: qualityBaseSeed, sonaraQualityBaseSeed: qualityBaseSeed } : body;\n  const primaryBody = makeVariantBody(stableBody, profile, 0);",
        'QUALITY_STABLE_BASE_SEED'
    )

    text = replace_once(
        text,
        "    originalBody: body,\n    primaryJobId,\n    secondaryJobId: '',\n    secondarySubmittedAt: 0,\n    secondarySubmitFailed: false,",
        "    originalBody: stableBody,\n    primaryJobId,\n    secondaryJobId: '',\n    secondarySubmittedAt: 0,\n    secondarySubmitFailed: false,\n    secondaryRetryCount: 0,",
        'QUALITY_STATE_V6'
    )

    text = replace_once(
        text,
        "      qualitySamePromptPairPreferred: profile === 'quality',\n      professionalTargetScore: state.targetScore,",
        "      qualitySamePromptPairPreferred: profile === 'quality',\n      qualitySequentialSingleTakes: profile === 'quality',\n      qualityBStrictPublishGate: profile === 'quality',\n      professionalTargetScore: state.targetScore,",
        'QUALITY_START_METADATA_V6'
    )

    text = replace_once(
        text,
        "    if (state.profile !== 'ultra' && primaryRank.ranked.length && bestScore >= Number(state.targetScore) && primaryRank.ranked[0]?.report?.professionalReleasePassed === true) {",
        "    if (state.profile === 'fast' && primaryRank.ranked.length && bestScore >= Number(state.targetScore) && primaryRank.ranked[0]?.report?.professionalReleasePassed === true) {",
        'QUALITY_DISABLE_SINGLE_EARLY_RELEASE'
    )

    marker = "  const completed = [];\n  if (primaryStatus === 'completed') completed.push(primaryData);"
    insert = """  if (state.profile === 'quality' && primaryStatus === 'completed' && secondaryStatus === 'completed') {
    const warmB = await warmNextQualityReport([secondaryData], state.requested || {}, state, env, jobId);
    if (warmB.warmed) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 91,
        stage: 'SONARA QUALITY: verifica professionale obbligatoria del lato B',
        metadata: {
          profile: state.profile,
          stabilityGuard: VERSION,
          qualityBStrictPublishGate: true,
          secondaryRetryCount: Number(state.secondaryRetryCount || 0),
          cachedQualityReports: warmB.cachedCount
        }
      });
    }
    const bRank = await rankChildren([secondaryData], state.requested || {}, state.qualityReportCache || {});
    state.qualityReportCache = mergeQualityCache(state.qualityReportCache, bRank.ranked);
    await saveState(env, jobId, state);
    const bItem = bRank.ranked[0] || null;
    const bScore = Number(bItem?.report?.professionalScore || 0);
    const bPassed = Boolean(bItem && bItem.report?.professionalReleasePassed === true && bScore >= Number(state.targetScore || PROFESSIONAL_RELEASE_SCORE));
    if (!bPassed) {
      const retries = Number(state.secondaryRetryCount || 0);
      if (retries < 1) {
        state.secondaryRetryCount = retries + 1;
        state.secondaryJobId = '';
        state.secondarySubmitFailed = false;
        state.secondarySubmittedAt = 0;
        state.secondaryTransientPolls = 0;
        await saveState(env, jobId, state);
        const retry = await submitSecondary(request, env, ctx, state, jobId, state.secondaryRetryCount);
        if (retry.childJobId) {
          return json(request, {
            jobId,
            status: 'PROCESSING',
            progress: 84,
            stage: 'SONARA QUALITY: lato B scartato, rigenerazione sicura automatica',
            metadata: {
              profile: state.profile,
              stabilityGuard: VERSION,
              qualityBStrictPublishGate: true,
              qualityBAutoRetry: true,
              rejectedBScore: bScore,
              secondaryRetryCount: state.secondaryRetryCount
            }
          });
        }
      }
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 100,
        retryable: true,
        error: 'QUALITY B e stato scartato dal controllo professionale anche dopo la rigenerazione sicura. SONARA non pubblica piu un lato B sotto standard.',
        metadata: {
          profile: state.profile,
          stabilityGuard: VERSION,
          qualityBStrictPublishGate: true,
          rejectedBScore: bScore,
          requiredBScore: Number(state.targetScore || PROFESSIONAL_RELEASE_SCORE),
          secondaryRetryCount: Number(state.secondaryRetryCount || 0)
        }
      }, 502);
    }
  }

  const completed = [];
  if (primaryStatus === 'completed') completed.push(primaryData);"""
    text = replace_once(text, marker, insert, 'QUALITY_B_AUTO_RETRY_GATE')

    GUARD.write_text(text, encoding='utf-8')


def patch_molab() -> None:
    text = MOLAB.read_text(encoding='utf-8')

    text = replace_once(
        text,
        "  const base = buildStudioPayload(body, 'structure', seed + 104729);\n  const controls = qualityControls(body);\n  const profile = profileOf(body);\n  const realMusic = realMusicEnabled(body, capabilities);",
        "  const base = buildStudioPayload(body, 'structure', seed + 104729);\n  const rawControls = qualityControls(body);\n  const profile = profileOf(body);\n  const qualitySafeB = profile === 'quality' && (body?.sonaraQualitySafeB === true || Number(body?.sonaraStabilityVariant) === 1);\n  const controls = {\n    weirdness: qualitySafeB ? Math.min(rawControls.weirdness, 25) : rawControls.weirdness,\n    styleInfluence: qualitySafeB ? Math.max(rawControls.styleInfluence, 85) : rawControls.styleInfluence\n  };\n  const realMusic = realMusicEnabled(body, capabilities);",
        'MOLAB_SAFE_B_CONTROLS'
    )

    text = replace_once(
        text,
        "      : clamp(0.74 + controls.weirdness * 0.0006, 0.77, 0.74, 0.80))",
        "      : (qualitySafeB\n        ? clamp(0.72 + controls.weirdness * 0.0004, 0.73, 0.72, 0.74)\n        : clamp(0.74 + controls.weirdness * 0.0006, 0.77, 0.74, 0.80)))",
        'MOLAB_SAFE_B_TEMPERATURE'
    )

    text = replace_once(
        text,
        "  const authoritativePrompt = String(body.prompt || '').trim().slice(0, 7600);\n  const finalInstruction = fidelityInstruction(body, controls).slice(0, 4000);\n  const candidateDirection = count === 2\n    ? (profile === 'quality'\n      ? 'QUALITY TWO-TAKE RULE: render two candidates from the EXACT SAME creator brief. A and B must share the requested concept, genre/subgenre, mood, era, instrumentation palette, groove family, production character, vocal intent, lyrics/language, BPM, key and atmosphere. Candidate B is only a faithful alternate take: vary melody phrasing, chord voicing details, fills and transitions inside the exact style. Do NOT introduce a new style, new concept, unrelated instruments, experimental detour or different emotional direction. If uncertain, repeat the creator intent more literally rather than becoming novel.'\n      : 'Render two candidates in one GPU batch. Both MUST preserve the same creator style, BPM, key, lyrics and vocal-language locks. Candidate A prioritizes hook and groove. Candidate B changes melody, voicing, transitions and timbral balance without changing genre identity.')\n    : 'Render one highly faithful professional master with strong hook, groove, coherent structure and production detail.';",
        "  const authoritativePrompt = String(body.prompt || '').trim().slice(0, 7600);\n  const finalInstruction = fidelityInstruction(body, controls).slice(0, 4000);\n  const stabilityInstruction = String(body.sonaraStabilityInstruction || body.sonaraQualityTakeInstruction || '').trim().slice(0, 6000);\n  const candidateDirection = qualitySafeB\n    ? 'QUALITY B SAFE SINGLE TAKE V6: execute the same creator brief literally. This is a conservative second take, not a new composition concept. Keep genre/subgenre, mood, era, groove family, instruments, production language, singer identity, lyrics/language, BPM, key and atmosphere locked. Use only small musical-performance differences. No experimental detours, no neighboring genre, no unrelated instruments, no bizarre harmony, no random structure. If there is any ambiguity, choose the most conventional genre-authentic solution.'\n    : (count === 2\n      ? (profile === 'quality'\n        ? 'QUALITY TWO-TAKE RULE: render two candidates from the EXACT SAME creator brief. A and B must share the requested concept, genre/subgenre, mood, era, instrumentation palette, groove family, production character, vocal intent, lyrics/language, BPM, key and atmosphere.'\n        : 'Render two candidates in one GPU batch. Both MUST preserve the same creator style, BPM, key, lyrics and vocal-language locks. Candidate A prioritizes hook and groove. Candidate B changes melody, voicing, transitions and timbral balance without changing genre identity.')\n      : (profile === 'quality'\n        ? 'QUALITY A SINGLE TAKE V6: render one highly faithful professional master that establishes the exact requested musical identity. Stay literal, coherent and genre-authentic.'\n        : 'Render one highly faithful professional master with strong hook, groove, coherent structure and production detail.'));",
        'MOLAB_DEDICATED_LOCK'
    )

    text = replace_once(
        text,
        "    finalInstruction,\n    realMusic ? realMusicInstruction(body) : '',\n    locks,",
        "    finalInstruction,\n    stabilityInstruction,\n    realMusic ? realMusicInstruction(body) : '',\n    locks,",
        'MOLAB_PRESERVE_STABILITY_INSTRUCTION'
    )

    text = replace_once(
        text,
        "    lm_repetition_penalty: realMusic ? (profile === 'ultra' ? 1.08 : 1.04) : 1.0,",
        "    lm_repetition_penalty: realMusic ? (profile === 'ultra' ? 1.08 : (qualitySafeB ? 1.02 : 1.04)) : 1.0,",
        'MOLAB_SAFE_B_REPETITION'
    )

    text = replace_once(
        text,
        "    use_random_seed: true,\n    sonara_real_music_v1: realMusic,",
        "    use_random_seed: profile !== 'quality',\n    sonara_quality_safe_b_v6: qualitySafeB,\n    sonara_quality_seed_locked_v6: profile === 'quality',\n    sonara_real_music_v1: realMusic,",
        'MOLAB_QUALITY_SEED_LOCK'
    )

    MOLAB.write_text(text, encoding='utf-8')


patch_guard()
patch_molab()
print('SONARA_QUALITY_B_SINGLE_TAKE_V6=PATCHED')
