const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SPEED = path.join(ROOT, 'cloudflare', 'sonara-speed-v4-edge.mjs');
const DIRECTOR = path.join(ROOT, 'cloudflare', 'sonara-music-director-v3-entry.mjs');

function patchFile(file, replacements) {
  let text = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const { oldText, newText, label } of replacements) {
    if (text.includes(newText)) {
      console.log(`[SONARA SPEED V5] ${label}=ALREADY_ACTIVE`);
      continue;
    }
    if (!text.includes(oldText)) {
      throw new Error(`[SONARA SPEED V5] Pattern not found for ${label} in ${file}`);
    }
    text = text.replace(oldText, newText);
    changed = true;
    console.log(`[SONARA SPEED V5] ${label}=PATCHED`);
  }
  if (changed) fs.writeFileSync(file, text, 'utf8');
}

patchFile(SPEED, [
  {
    label: 'FAST_STEPS_4',
    oldText: "const ASR_TIMEOUT = 180_000;\nconst QUALITY_STEPS = 6;\nconst ULTRA_STEPS = 8;",
    newText: "const ASR_TIMEOUT = 180_000;\nconst FAST_STEPS = 4;\nconst QUALITY_STEPS = 6;\nconst ULTRA_STEPS = 8;"
  },
  {
    label: 'QUALITY_ONE_BATCH_NO_REPAIR',
    oldText: "      sonaraAutoRepair: true,\n      sonaraSpeedV4: VERSION,\n      sonaraFastUltra: false,\n      sonaraSpeedInferenceSteps: QUALITY_STEPS,\n      sonaraSpeedSampler: 'euler',\n      sonaraSpeedExecutionProfile: 'quality-director-auto-refine',\n      sonaraRequestedGenerationProfile: profile,\n      sonaraAutomaticCandidateRanking: true,\n      sonaraVisibleCandidateTarget: 2,\n      sonaraInternalCandidateTarget: 4,",
    newText: "      sonaraAutoRepair: false,\n      sonaraSpeedV4: VERSION,\n      sonaraFastUltra: false,\n      sonaraSpeedInferenceSteps: QUALITY_STEPS,\n      sonaraSpeedSampler: 'euler',\n      sonaraSpeedExecutionProfile: 'quality-director-single-batch',\n      sonaraRequestedGenerationProfile: profile,\n      sonaraAutomaticCandidateRanking: true,\n      sonaraVisibleCandidateTarget: 2,\n      sonaraInternalCandidateTarget: 2,"
  },
  {
    label: 'FAST_4_STEPS',
    oldText: "    sonaraSpeedInferenceSteps: QUALITY_STEPS,\n    sonaraSpeedSampler: 'euler',\n    sonaraSpeedExecutionProfile: 'fast-single-batch',",
    newText: "    sonaraSpeedInferenceSteps: FAST_STEPS,\n    sonaraSpeedSampler: 'euler',\n    sonaraSpeedExecutionProfile: 'fast-single-batch-4step',"
  },
  {
    label: 'EXECUTION_PROFILE_QUALITY_SINGLE_BATCH',
    oldText: "  if (profile === 'quality') return 'quality-director-auto-refine';\n  return 'fast-single-batch';",
    newText: "  if (profile === 'quality') return 'quality-director-single-batch';\n  return 'fast-single-batch-4step';"
  },
  {
    label: 'INFERENCE_PROFILE_FAST4',
    oldText: "function inferenceStepsOf(profile) {\n  return profile === 'ultra' ? ULTRA_STEPS : QUALITY_STEPS;\n}",
    newText: "function inferenceStepsOf(profile) {\n  if (profile === 'ultra') return ULTRA_STEPS;\n  if (profile === 'fast') return FAST_STEPS;\n  return QUALITY_STEPS;\n}"
  },
  {
    label: 'METADATA_NO_SECOND_BATCH_QUALITY',
    oldText: "      internalCandidateTarget: profile === 'fast' ? 2 : 4,\n      automaticSecondBatch: profile !== 'fast',\n      automaticCandidateRanking: true,\n      automaticQualityRepair: profile !== 'fast',",
    newText: "      internalCandidateTarget: profile === 'ultra' ? 4 : 2,\n      automaticSecondBatch: profile === 'ultra',\n      automaticCandidateRanking: true,\n      automaticQualityRepair: profile === 'ultra',"
  }
]);

patchFile(DIRECTOR, [
  {
    label: 'DIRECTOR_QUALITY_ONE_BATCH',
    oldText: "  return { profile: 'quality', internalBatches: 2, candidatesPerBatch: 2, targetScore: PROFESSIONAL_RELEASE_SCORE, autoRepair: true, downstreamProfile: 'quality' };",
    newText: "  return { profile: 'quality', internalBatches: 1, candidatesPerBatch: 2, targetScore: PROFESSIONAL_RELEASE_SCORE, autoRepair: false, downstreamProfile: 'quality' };"
  }
]);

console.log('[SONARA SPEED V5] FAST=4_STEPS / QUALITY=1x2_SINGLE_BATCH / ULTRA=2x2');
