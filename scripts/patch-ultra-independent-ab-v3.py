from pathlib import Path

PATH = Path('cloudflare/sonara-quality-ultra-stability-guard.mjs')
text = PATH.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'missing marker: {label}')
    text = text.replace(old, new, 1)


replace_once(
"""  const direction = variantIndex === 0
    ? 'Candidate batch A: prioritize hook strength, groove, vocal clarity, coherent arrangement and clean release-ready balance.'
    : 'Candidate batch B: preserve the exact genre, BPM, key, lyrics and singer identity, but use a different melody, voicing, transitions, fills and timbral balance.';""",
"""  const entropy = crypto.getRandomValues(new Uint32Array(2));
  const suppliedSeed = Number(body.seed) > 0 ? Math.floor(Number(body.seed)) : Number(entropy[0]);
  const independentSeed = Math.max(1, (suppliedSeed + Number(entropy[0]) + Number(entropy[1]) + (variantIndex + 1) * 15485863) % 1999999973);
  const direction = variantIndex === 0
    ? 'SONARA SONG A — independent composition. Create a complete song with its own melody, harmony, bass phrasing, drum groove, hook, arrangement, transitions, sound palette, climax and ending.'
    : 'SONARA SONG B — completely independent composition. Do NOT reuse Song A melodic contour, chord progression or voicing flow, bass rhythm, drum groove, hook rhythm, intro, build, drop or chorus contour, fills, transitions, sound palette or section architecture. Preserve only the creator locks: requested genre and subgenre, exact BPM, key, duration, lyrics and language, and singer identity.';""",
'makeVariantBody direction',
)

replace_once(
"""    seed: Number(body.seed) > 0 ? Math.floor(Number(body.seed)) + variantIndex * 104729 : undefined,
    prompt: [prompt, `SONARA ${profile.toUpperCase()} STABILITY DIRECTOR.`, fidelity, direction].filter(Boolean).join('\\n\\n').slice(0, 12000)""",
"""    seed: independentSeed,
    sonaraCompositionIdentity: variantIndex === 0 ? 'A' : 'B',
    sonaraIndependentAB: profile === 'ultra',
    prompt: [prompt, `SONARA ${profile.toUpperCase()} STABILITY DIRECTOR.`, fidelity, direction, `Independent composition seed=${independentSeed}.`].filter(Boolean).join('\\n\\n').slice(0, 12000)""",
'makeVariantBody seed',
)

replace_once(
"""  const visible = combined.ranked.slice(0, 2).map((item, index) => ({
    ...(item.candidate && typeof item.candidate === 'object' ? item.candidate : {}),
    audioUrl: item.url,
    sonaraQuality: item.report,
    sonaraRecommended: index === 0,
    releaseEligible: item.report?.professionalReleasePassed === true,
    directorRank: index + 1
  }));""",
"""  let visibleSource = combined.ranked.slice(0, 2);
  if (state.profile === 'ultra') {
    const bestByChild = new Map();
    for (const item of combined.ranked) {
      const childIndex = Number(item?.report?.childIndex);
      if (Number.isInteger(childIndex) && !bestByChild.has(childIndex)) bestByChild.set(childIndex, item);
    }
    visibleSource = [bestByChild.get(0), bestByChild.get(1)].filter(Boolean);
    if (visibleSource.length < 2) {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 100,
        retryable: true,
        error: 'ULTRA richiede due brani indipendenti A e B. Uno dei due batch non ha prodotto audio valido.',
        metadata: { profile: state.profile, stabilityGuard: VERSION, independentABRequired: true, independentChildrenReady: visibleSource.length }
      }, 502);
    }
  }
  const visible = visibleSource.map((item, index) => ({
    ...(item.candidate && typeof item.candidate === 'object' ? item.candidate : {}),
    audioUrl: item.url,
    sonaraQuality: item.report,
    sonaraRecommended: index === 0,
    releaseEligible: item.report?.professionalReleasePassed === true,
    directorRank: index + 1,
    sonaraCompositionIdentity: index === 0 ? 'A' : 'B',
    independentComposition: state.profile === 'ultra'
  }));""",
'visible selection',
)

replace_once(
"""    if (primaryRank.ranked.length && bestScore >= Number(state.targetScore) && primaryRank.ranked[0]?.report?.professionalReleasePassed === true) {""",
"""    if (state.profile !== 'ultra' && primaryRank.ranked.length && bestScore >= Number(state.targetScore) && primaryRank.ranked[0]?.report?.professionalReleasePassed === true) {""",
'early release',
)

replace_once(
"""    if (!secondary.childJobId) {
      return finalize(request, env, jobId, state, [primaryData], {
        secondaryBatchDegraded: true,
        secondarySubmitStatus: secondary.response?.status || 0,
        primaryQualityReportsReused: true
      });
    }""",
"""    if (!secondary.childJobId) {
      if (state.profile === 'ultra') {
        return json(request, {
          jobId,
          status: 'FAILED',
          progress: 100,
          retryable: true,
          error: 'ULTRA non ha potuto avviare il brano B indipendente. La coppia A/B non viene completata con due variazioni dello stesso batch.',
          metadata: { profile: state.profile, stabilityGuard: VERSION, independentABRequired: true, secondarySubmitStatus: secondary.response?.status || 0 }
        }, 502);
      }
      return finalize(request, env, jobId, state, [primaryData], {
        secondaryBatchDegraded: true,
        secondarySubmitStatus: secondary.response?.status || 0,
        primaryQualityReportsReused: true
      });
    }""",
'secondary submit failure',
)

replace_once(
"""    if (primaryStatus === 'completed' && (state.secondaryTransientPolls >= MAX_TRANSIENT_POLLS || secondaryAge > SECONDARY_SOFT_TIMEOUT_MS)) {
      return finalize(request, env, jobId, state, [primaryData], {
        secondaryBatchTimedOut: true,
        secondaryTransientPolls: state.secondaryTransientPolls,
        primaryQualityReportsReused: true
      });
    }""",
"""    if (primaryStatus === 'completed' && (state.secondaryTransientPolls >= MAX_TRANSIENT_POLLS || secondaryAge > SECONDARY_SOFT_TIMEOUT_MS)) {
      if (state.profile === 'ultra') {
        return json(request, {
          jobId,
          status: 'FAILED',
          progress: 100,
          retryable: true,
          error: 'ULTRA: il brano B indipendente ha superato il timeout. B non viene sostituito con una variazione di A.',
          metadata: { profile: state.profile, stabilityGuard: VERSION, independentABRequired: true, secondaryTransientPolls: state.secondaryTransientPolls }
        }, 504);
      }
      return finalize(request, env, jobId, state, [primaryData], {
        secondaryBatchTimedOut: true,
        secondaryTransientPolls: state.secondaryTransientPolls,
        primaryQualityReportsReused: true
      });
    }""",
'secondary timeout',
)

replace_once(
"""  if (!state.secondaryJobId) {
    if (primaryStatus === 'completed') return finalize(request, env, jobId, state, [primaryData], { secondaryBatchDegraded: true });
    return primaryResponse;
  }""",
"""  if (!state.secondaryJobId) {
    if (primaryStatus === 'completed' && state.profile === 'ultra') {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 100,
        retryable: true,
        error: 'ULTRA richiede entrambi i brani indipendenti A e B; il brano B non è disponibile.',
        metadata: { profile: state.profile, stabilityGuard: VERSION, independentABRequired: true }
      }, 502);
    }
    if (primaryStatus === 'completed') return finalize(request, env, jobId, state, [primaryData], { secondaryBatchDegraded: true });
    return primaryResponse;
  }""",
'no secondary fallback',
)

replace_once(
"""      secondaryBatchUsed: Boolean(state.secondaryJobId),
      ...extra""",
"""      secondaryBatchUsed: Boolean(state.secondaryJobId),
      independentAB: state.profile === 'ultra',
      independentABSelection: state.profile === 'ultra' ? 'best-one-per-independent-batch' : 'global-ranking',
      humanRealismRequired: state.profile === 'ultra',
      ...extra""",
'metadata',
)

for marker in [
    'sonaraIndependentAB',
    'SONARA SONG B',
    'best-one-per-independent-batch',
    "state.profile !== 'ultra'",
    'B non viene sostituito con una variazione di A',
]:
    if marker not in text:
        raise SystemExit(f'missing final marker: {marker}')

PATH.write_text(text, encoding='utf-8')
print('SONARA_ULTRA_INDEPENDENT_AB_V3=PATCHED')
# trigger-v3-20260903
