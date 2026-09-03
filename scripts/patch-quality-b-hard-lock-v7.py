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
        "  const qualitySeed = Math.max(1, (suppliedSeed + variantIndex * 104729 + retryIndex * 32452843) % 1999999973);",
        "  const qualitySeed = Math.max(1, suppliedSeed % 1999999973);",
        'QUALITY_B_SAME_BASE_SEED'
    )

    text = replace_once(
        text,
        "      : 'SONARA QUALITY B SAFE SINGLE TAKE — render one conservative alternate take of the EXACT SAME creator brief. B is not a new concept, remix, neighboring genre or experimental interpretation. Preserve the same genre/subgenre, mood, era, instrumentation palette, groove family, production language, vocal identity, lyrics/language, BPM, key and atmosphere. Only small genre-authentic differences in melody phrasing, voicings, fills and transitions are allowed. PROMPT FIDELITY OVERRIDES NOVELTY.')",
        "      : 'SONARA QUALITY B HARD-LOCK V7 — render a second safe take from the EXACT SAME musical identity as A. Use the same creator brief and same seed-base. B must immediately sound like the same commissioned song world: identical genre/subgenre, mood, era, groove family, instrument palette, production language, singer identity, lyrics/language, BPM, key and atmosphere. Do not reinterpret, remix, hybridize or experiment. Only conservative phrase, voicing, fill and transition differences are allowed. If any choice could change the identity, choose the most literal conventional solution. PROMPT FIDELITY AND A/B COHERENCE OVERRIDE NOVELTY.')",
        'QUALITY_B_DIRECTION_V7'
    )

    text = replace_once(
        text,
        "    candidateCount: profile === 'quality' ? 1 : 2,\n    candidate_count: profile === 'quality' ? 1 : 2,\n    dualFast: profile !== 'quality',\n    seed: independentSeed,",
        "    candidateCount: profile === 'quality' ? 1 : 2,\n    candidate_count: profile === 'quality' ? 1 : 2,\n    dualFast: profile !== 'quality',\n    weirdness: profile === 'quality' && variantIndex === 1 ? 0 : body.weirdness,\n    styleInfluence: profile === 'quality' && variantIndex === 1 ? 100 : (body.styleInfluence ?? body.style_influence),\n    style_influence: profile === 'quality' && variantIndex === 1 ? 100 : (body.style_influence ?? body.styleInfluence),\n    seed: independentSeed,",
        'QUALITY_B_CREATIVE_LOCKS'
    )

    text = replace_once(
        text,
        "    sonaraQualityBSafeV6: profile === 'quality',\n    sonaraQualitySafeB: profile === 'quality' && variantIndex === 1,",
        "    sonaraQualityBSafeV6: profile === 'quality',\n    sonaraQualityBHardLockV7: profile === 'quality',\n    sonaraQualitySameSeedBaseV7: profile === 'quality',\n    sonaraQualitySafeB: profile === 'quality' && variantIndex === 1,",
        'QUALITY_B_METADATA_V7'
    )

    marker = """function cacheReportReady(report) {
  return Boolean(reportUsable(report) || report?.qualityAnalysisAttempted === true);
}
"""
    insert = """function cacheReportReady(report) {
  return Boolean(reportUsable(report) || report?.qualityAnalysisAttempted === true);
}

function qualityPairCoherence(a = {}, b = {}) {
  const reasons = [];
  const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const aBpm = number(a.detectedBpm);
  const bBpm = number(b.detectedBpm);
  if (aBpm !== null && bBpm !== null && Math.abs(aBpm - bBpm) > 3) reasons.push('a-b-tempo-divergence');

  const aRms = number(a.rmsDb);
  const bRms = number(b.rmsDb);
  if (aRms !== null && bRms !== null && Math.abs(aRms - bRms) > 7.5) reasons.push('a-b-energy-divergence');

  const aCrest = number(a.crestDb);
  const bCrest = number(b.crestDb);
  if (aCrest !== null && bCrest !== null && Math.abs(aCrest - bCrest) > 8) reasons.push('a-b-dynamics-divergence');

  const aZcr = number(a.zeroCrossingRate);
  const bZcr = number(b.zeroCrossingRate);
  if (aZcr !== null && bZcr !== null && aZcr > 0 && bZcr > 0) {
    const ratio = Math.max(aZcr, bZcr) / Math.max(0.000001, Math.min(aZcr, bZcr));
    if (ratio > 3) reasons.push('a-b-timbre-divergence');
  }

  const aDuration = number(a.declaredDurationSec);
  const bDuration = number(b.declaredDurationSec);
  if (aDuration !== null && bDuration !== null) {
    const tolerance = Math.max(5, Math.max(aDuration, bDuration) * 0.10);
    if (Math.abs(aDuration - bDuration) > tolerance) reasons.push('a-b-duration-divergence');
  }

  return { passed: reasons.length === 0, reasons };
}
"""
    text = replace_once(text, marker, insert, 'QUALITY_PAIR_COHERENCE_GATE')

    old_bypass = """    if (state.profile === 'quality' && primaryRank.ranked.length >= 2) {
      return finalize(request, env, jobId, state, [primaryData], {
        qualitySamePromptPair: true,
        qualityBPromptFidelity: 'literal-same-brief',
        secondaryBatchSkippedForPromptFidelity: true,
        primaryQualityReportsReused: true
      });
    }
"""
    new_bypass = """    if (state.profile === 'quality' && primaryRank.ranked.length >= 2) {
      state.primaryUnexpectedExtraCandidates = primaryRank.ranked.length;
      await saveState(env, jobId, state);
    }
"""
    text = replace_once(text, old_bypass, new_bypass, 'REMOVE_PRIMARY_QUALITY_BYPASS')

    old_hard_timeout = """    if (data.length) return finalize(request, env, jobId, state, data, { hardTimeoutFallback: true });
"""
    new_hard_timeout = """    if (data.length) {
      if (state.profile === 'quality') {
        return json(request, {
          jobId,
          status: 'FAILED',
          progress: 100,
          retryable: true,
          error: 'QUALITY B V7: timeout prima della validazione completa A/B. SONARA non pubblica una coppia non verificata.',
          metadata: { profile: state.profile, stabilityGuard: VERSION, qualityBHardLockV7: true, hardTimeoutBeforePairValidation: true }
        }, 504);
      }
      return finalize(request, env, jobId, state, data, { hardTimeoutFallback: true });
    }
"""
    text = replace_once(text, old_hard_timeout, new_hard_timeout, 'QUALITY_NO_TIMEOUT_BYPASS')

    old_no_secondary = """    if (primaryStatus === 'completed') return finalize(request, env, jobId, state, [primaryData], { secondaryBatchDegraded: true });
"""
    new_no_secondary = """    if (primaryStatus === 'completed' && state.profile === 'quality') {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 100,
        retryable: true,
        error: 'QUALITY B V7: il secondo take obbligatorio non e disponibile. A non viene trasformato artificialmente in una coppia A/B.',
        metadata: { profile: state.profile, stabilityGuard: VERSION, qualityBHardLockV7: true, secondaryRequired: true }
      }, 502);
    }
    if (primaryStatus === 'completed') return finalize(request, env, jobId, state, [primaryData], { secondaryBatchDegraded: true });
"""
    text = replace_once(text, old_no_secondary, new_no_secondary, 'QUALITY_REQUIRE_SECONDARY')

    old_timeout = """      return finalize(request, env, jobId, state, [primaryData], {
        secondaryBatchTimedOut: true,
        secondaryTransientPolls: state.secondaryTransientPolls,
        primaryQualityReportsReused: true
      });
"""
    new_timeout = """      if (state.profile === 'quality') {
        return json(request, {
          jobId,
          status: 'FAILED',
          progress: 100,
          retryable: true,
          error: 'QUALITY B V7: il lato B ha superato il timeout e viene rifiutato, non sostituito con un output non verificato.',
          metadata: { profile: state.profile, stabilityGuard: VERSION, qualityBHardLockV7: true, secondaryTransientPolls: state.secondaryTransientPolls }
        }, 504);
      }
      return finalize(request, env, jobId, state, [primaryData], {
        secondaryBatchTimedOut: true,
        secondaryTransientPolls: state.secondaryTransientPolls,
        primaryQualityReportsReused: true
      });
"""
    text = replace_once(text, old_timeout, new_timeout, 'QUALITY_NO_SECONDARY_TIMEOUT_DEGRADE')

    old_gate = """    const bItem = bRank.ranked[0] || null;
    const bScore = Number(bItem?.report?.professionalScore || 0);
    const bPassed = Boolean(bItem && bItem.report?.professionalReleasePassed === true && bScore >= Number(state.targetScore || PROFESSIONAL_RELEASE_SCORE));
    if (!bPassed) {
"""
    new_gate = """    const bItem = bRank.ranked[0] || null;
    const bScore = Number(bItem?.report?.professionalScore || 0);
    const aRank = await rankChildren([primaryData], state.requested || {}, state.qualityReportCache || {});
    state.qualityReportCache = mergeQualityCache(state.qualityReportCache, aRank.ranked);
    const aItem = aRank.ranked[0] || null;
    const pairCoherence = qualityPairCoherence(aItem?.report || {}, bItem?.report || {});
    state.qualityBPairCoherence = pairCoherence;
    await saveState(env, jobId, state);
    const bPassed = Boolean(
      bItem &&
      bItem.report?.professionalReleasePassed === true &&
      bScore >= Number(state.targetScore || PROFESSIONAL_RELEASE_SCORE) &&
      pairCoherence.passed === true
    );
    if (!bPassed) {
"""
    text = replace_once(text, old_gate, new_gate, 'QUALITY_B_PAIR_GATE')

    text = replace_once(
        text,
        "              rejectedBScore: bScore,\n              secondaryRetryCount: state.secondaryRetryCount",
        "              rejectedBScore: bScore,\n              pairCoherencePassed: pairCoherence.passed,\n              pairCoherenceReasons: pairCoherence.reasons,\n              secondaryRetryCount: state.secondaryRetryCount",
        'QUALITY_B_RETRY_PAIR_METADATA'
    )

    text = replace_once(
        text,
        "          rejectedBScore: bScore,\n          requiredBScore: Number(state.targetScore || PROFESSIONAL_RELEASE_SCORE),",
        "          rejectedBScore: bScore,\n          requiredBScore: Number(state.targetScore || PROFESSIONAL_RELEASE_SCORE),\n          pairCoherencePassed: pairCoherence.passed,\n          pairCoherenceReasons: pairCoherence.reasons,",
        'QUALITY_B_FAIL_PAIR_METADATA'
    )

    text = replace_once(
        text,
        "      qualityBStrictPublishGate: state.profile === 'quality',\n      humanRealismRequired: state.profile === 'ultra',",
        "      qualityBStrictPublishGate: state.profile === 'quality',\n      qualityBHardLockV7: state.profile === 'quality',\n      qualityBSameSeedBaseV7: state.profile === 'quality',\n      qualityBPairCoherence: state.profile === 'quality' ? (state.qualityBPairCoherence || null) : null,\n      humanRealismRequired: state.profile === 'ultra',",
        'QUALITY_FINAL_METADATA_V7'
    )

    GUARD.write_text(text, encoding='utf-8')


def patch_molab() -> None:
    text = MOLAB.read_text(encoding='utf-8')

    text = replace_once(
        text,
        "    weirdness: qualitySafeB ? Math.min(rawControls.weirdness, 25) : rawControls.weirdness,\n    styleInfluence: qualitySafeB ? Math.max(rawControls.styleInfluence, 85) : rawControls.styleInfluence",
        "    weirdness: qualitySafeB ? 0 : rawControls.weirdness,\n    styleInfluence: qualitySafeB ? 100 : rawControls.styleInfluence",
        'MOLAB_B_ZERO_WEIRDNESS_MAX_STYLE'
    )

    text = replace_once(
        text,
        "        ? clamp(0.72 + controls.weirdness * 0.0004, 0.73, 0.72, 0.74)",
        "        ? 0.68",
        'MOLAB_B_TEMPERATURE_HARD_LOCK'
    )

    text = replace_once(
        text,
        "  const humanLmCfgScale = realMusic ? clamp(2.10 + controls.styleInfluence * 0.004, 2.30, 2.10, 2.50) : 2.0;\n  const humanTopP = realMusic ? clamp(0.90 + controls.weirdness * 0.0006, 0.93, 0.90, 0.96) : 0.90;",
        "  const humanLmCfgScale = realMusic ? (qualitySafeB ? 2.50 : clamp(2.10 + controls.styleInfluence * 0.004, 2.30, 2.10, 2.50)) : 2.0;\n  const humanTopP = realMusic ? (qualitySafeB ? 0.88 : clamp(0.90 + controls.weirdness * 0.0006, 0.93, 0.90, 0.96)) : 0.90;",
        'MOLAB_B_CFG_TOPP_HARD_LOCK'
    )

    text = replace_once(
        text,
        "    ? 'QUALITY B SAFE SINGLE TAKE V6: execute the same creator brief literally. This is a conservative second take, not a new composition concept. Keep genre/subgenre, mood, era, groove family, instruments, production language, singer identity, lyrics/language, BPM, key and atmosphere locked. Use only small musical-performance differences. No experimental detours, no neighboring genre, no unrelated instruments, no bizarre harmony, no random structure. If there is any ambiguity, choose the most conventional genre-authentic solution.'",
        "    ? 'QUALITY B HARD-LOCK V7: use the EXACT SAME song world and seed-base as A. Preserve creator prompt, genre/subgenre, mood, era, groove family, instrument palette, production language, singer identity, lyrics/language, BPM, key and atmosphere literally. Weirdness is forced to zero and style adherence to maximum. B may differ only in conservative phrase timing, voicings, fills and transitions. Never create a remix, hybrid, experimental version, neighboring genre, bizarre harmony, random structure or unrelated instrumentation. If uncertain, stay closer to A and to the creator brief.'",
        'MOLAB_B_DIRECTION_V7'
    )

    text = replace_once(
        text,
        "    sonara_quality_safe_b_v6: qualitySafeB,\n    sonara_quality_seed_locked_v6: profile === 'quality',",
        "    sonara_quality_safe_b_v6: qualitySafeB,\n    sonara_quality_b_hard_lock_v7: qualitySafeB,\n    sonara_quality_same_seed_base_v7: profile === 'quality',\n    sonara_quality_seed_locked_v6: profile === 'quality',",
        'MOLAB_B_METADATA_V7'
    )

    MOLAB.write_text(text, encoding='utf-8')


patch_guard()
patch_molab()
print('SONARA_QUALITY_B_HARD_LOCK_V7=PATCHED')
