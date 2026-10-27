import { instrumentRealismPlan, INSTRUMENT_REALISM_VERSION } from './sonara-instrument-realism-v3.mjs';
import { mixMasterPlan, safePeakTarget, MIX_MASTER_VERSION } from './sonara-mix-master-v1.mjs';

// Stock ACE-Step 1.5 XL Turbo request policy for the HTTPS/R2 path only.
// Official API/INFERENCE/Tutorial at ca1e85fe recommend 8 steps and shift 3
// for Turbo. Native `thinking` generates LM audio codes; it does not require
// SONARA's optional, custom realism API. REALISTIC and ULTRA use native LM planning; INSTANT remains the speed preview.
export const R2_GENERATION_POLICY = 'sonara-xl-turbo-realistic-fast-v4-natural-ab';
export const NATURAL_INSTRUMENT_AB_PROFILE = 'sonara-natural-instruments-ab-v1';

const text = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const firstText = (...values) => values.map(text).find(Boolean) || '';
const unique = values => [...new Set(values.map(text).filter(Boolean))];

function profileOf(body) {
  const raw = firstText(body.generationProfileV3, body.renderProfile, body.generationProfile, body.qualityProfile).toLowerCase();
  if (['fast', 'speed', 'preview', 'instant'].includes(raw)) return 'fast';
  if (['ultra', 'maximum', 'max', 'studio', 'master'].includes(raw)) return 'ultra';
  return 'quality';
}

export function r2GenerationSettings(body = {}) {
  const profile = profileOf(body);
  return {
    profile,
    steps: profile === 'fast' ? 1 : profile === 'quality' ? 4 : 8,
    shift: profile === 'fast' ? 1.0 : 3.0,
    thinking: profile === 'ultra'
  };
}

export function r2GenerationMetadata(body = {}, count = null) {
  const { profile, steps, shift, thinking } = r2GenerationSettings(body);
  const effectiveCount = Number.isFinite(Number(count)) ? Math.max(1, Math.min(2, Math.round(Number(count)))) : profile === 'ultra' ? 2 : 1;
  const realism = profile === 'fast' ? null : instrumentRealismPlan(body, { depth: profile });
  const mixMaster = profile === 'fast' ? null : mixMasterPlan(body, { depth: profile });
  return {
    generationPolicy: R2_GENERATION_POLICY,
    generationProfile: profile,
    requestedGenerationProfile: profile,
    executionProfile: profile === 'fast' ? 'xl-turbo-instant-single-track' : profile === 'quality' ? 'xl-turbo-realistic-fast-single-track' : 'xl-turbo-ultra-lm-batch',
    inferenceSteps: steps, shift, samplerMode: 'euler', lmThinking: thinking,
    lmAudioPlanning: thinking, lmModel: 'acestep-5Hz-lm-4B',
    instrumentRealismEnabled: Boolean(realism),
    instrumentRealismVersion: realism ? INSTRUMENT_REALISM_VERSION : null,
    instrumentRealismFamilies: realism?.families || [],
    instrumentRealismDepth: realism?.depth || null,
    ensembleInteractionCount: realism?.ensembleInteractions?.length || 0,
    sectionAwareArrangement: realism?.structureAware || false,
    naturalInstrumentABProfile: realism ? NATURAL_INSTRUMENT_AB_PROFILE : null,
    naturalInstrumentABRequired: Boolean(realism),
    naturalDrumAntiRepetition: Boolean(realism?.naturalDrumAntiRepetition),
    mixMasterEnabled: Boolean(mixMaster),
    mixMasterVersion: mixMaster ? MIX_MASTER_VERSION : null,
    mixMasterProfile: mixMaster?.id || null,
    targetPeakDb: mixMaster?.targetPeakDb ?? null,
    batchSize: effectiveCount, candidateCount: effectiveCount, singleGpuBatch: true,
    visibleCandidateTarget: effectiveCount, internalCandidateTarget: effectiveCount,
    automaticSecondBatch: false, automaticCandidateRanking: false,
    automaticQualityRepair: false, realMusicV3: false, trackGenome: false,
    humanizer: false, vocalRefinement: false, stemPostProductionReady: false,
    lyricVerificationMode: 'not-performed', lyricVerificationPending: false
  };
}

function originalLyrics(payload, source) {
  if (typeof source.sonaraOriginalLyrics === 'string') return source.sonaraOriginalLyrics;
  if (typeof source.lyrics === 'string') return source.lyrics;
  return payload.lyrics;
}

function caption(payload, body, source, lyrics) {
  // The older ULTRA wrapper replaces rawPrompt with its generated directions.
  // The UI's original-brief fields survive that wrapper unchanged.
  const brief = firstText(source.sonaraOriginalCreatorBrief, source.sonaraCreatorPromptAuthoritative,
    source.rawPrompt, source.creatorPrompt, source.creator_prompt, source.musicPrompt, source.prompt);
  const style = unique([body.genre, body.subgenre]).join(', ');
  const mood = firstText(body.mood, body.atmosphere);
  const mode = firstText(body.vocalMode, body.vocal_mode).toLowerCase();
  const language = firstText(payload.vocal_language, body.vocalLanguage, body.vocal_language);
  const languageName = ({ it: 'Italian', en: 'English', es: 'Spanish', fr: 'French',
    de: 'German', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', zh: 'Chinese' })[language] || language;
  const instrumental = /^(instrumental|no vocals|none|off)$/.test(mode)
    || (!mode && (!text(lyrics) || /^\[instrumental\]$/i.test(text(lyrics))));
  const vocal = instrumental ? 'Instrumental' : [
    mode === 'male' ? 'Male vocals' : mode === 'female' ? 'Female vocals' : mode === 'duet' ? 'Duet vocals' : 'Vocals',
    languageName && languageName !== 'unknown' && languageName !== 'auto' ? `in ${languageName}` : ''
  ].filter(Boolean).join(' ');
  const instrumentsValue = source.selectedInstruments || source.instruments || body.selectedInstruments || body.instruments;
  const instruments = Array.isArray(instrumentsValue)
    ? unique(instrumentsValue.map(item => typeof item === 'string' ? item : item?.name || item?.label)).join(', ')
    : text(instrumentsValue);
  const weirdness = body.weirdness == null ? null : Number(body.weirdness);
  const influenceValue = body.styleInfluence ?? body.style_influence;
  const influence = influenceValue == null ? null : Number(influenceValue);
  const creativity = Number.isFinite(weirdness)
    ? weirdness >= 75 ? 'Adventurous melodic and rhythmic variations within the style'
      : weirdness >= 45 ? 'Balanced melodic variation' : 'Conventional, coherent phrasing'
    : '';
  const adherence = Number.isFinite(influence)
    ? influence >= 80 ? 'Strict genre identity'
      : influence >= 55 ? 'Recognizable genre identity with compatible variation'
        : 'Flexible interpretation within the selected genre'
    : '';
  const selectedProfile = profileOf(body);
  const realism = selectedProfile === 'fast' ? '' : instrumentRealismPlan({ ...body, ...source, lyrics }, { depth: selectedProfile }).cue;
  const mixMaster = selectedProfile === 'fast' ? '' : mixMasterPlan({ ...body, ...source, lyrics }, { depth: selectedProfile }).cue;

  // Keep the creator's real brief and add one compact performance-reality cue.
  // The cue describes how instruments behave physically; it does not add new
  // instruments and therefore cannot override the creator's instrumentation.
  return unique([style, mood, vocal, instruments, realism, mixMaster, creativity, adherence, brief]).join('. ');
}

export function applyR2GenerationProfile(payload, resolvedBody = {}, sourceBody = resolvedBody) {
  const { profile, steps, shift, thinking } = r2GenerationSettings(resolvedBody);
  const lyrics = originalLyrics(payload, sourceBody);
  const mixMaster = profile === 'fast' ? null : mixMasterPlan({ ...resolvedBody, ...sourceBody, lyrics }, { depth: profile });
  const normalizationEnabled = payload.enable_normalization !== false;
  const normalizationDb = mixMaster && normalizationEnabled
    ? safePeakTarget(payload.normalization_db, mixMaster.targetPeakDb)
    : payload.normalization_db;
  const requestedBatchSize = Math.max(1, Math.min(2, Math.round(Number(payload.batch_size) || (profile === 'ultra' ? 2 : 1))));
  const effectiveBatchSize = profile === 'ultra' ? requestedBatchSize : 1;
  const durationSeconds = Number(payload.audio_duration);
  const directVaeDecode = profile !== 'fast' && (!Number.isFinite(durationSeconds) || durationSeconds <= 240);
  const next = {
    ...payload,
    prompt: caption(payload, resolvedBody, sourceBody, lyrics),
    lyrics,
    batch_size: effectiveBatchSize,
    inference_steps: steps,
    shift,
    guidance_scale: 1.0,
    infer_method: 'ode',
    sampler_mode: 'euler',
    thinking,
    sample_mode: false,
    use_format: false,
    use_cot_caption: false,
    use_cot_language: false,
    constrained_decoding: true,
    use_adg: false,
    lm_temperature: 0.85,
    lm_cfg_scale: 2.5,
    lm_top_k: 0,
    lm_top_p: 0.9,
    lm_repetition_penalty: 1.0,
    lm_negative_prompt: profile === 'fast'
      ? 'NO USER INPUT'
      : 'robotic quantization, static velocity, identical repeated bars, MIDI-like note triggering, machine-gun drums, cheap one-note drum pulse, repetitive synthetic thud, toy percussion, identical kick snare or tom transient on every beat, flat drum envelopes, genre-inappropriate drum substitution, plastic acoustic timbre, phase-locked acoustic doubles, metallic artifacts, brittle cymbals, fake room resets, overcompression, clipped transients',
    allow_lm_batch: thinking && effectiveBatchSize > 1,
    dcw_enabled: profile === 'fast' ? payload.dcw_enabled : true,
    dcw_mode: profile === 'fast' ? payload.dcw_mode : 'double',
    dcw_scaler: profile === 'fast' ? payload.dcw_scaler : (thinking ? 0.02 : 0.05),
    dcw_high_scaler: profile === 'fast' ? payload.dcw_high_scaler : (thinking ? 0.06 : 0.02),
    dcw_wavelet: profile === 'fast' ? payload.dcw_wavelet : 'haar',
    use_tiled_decode: profile === 'fast' ? payload.use_tiled_decode : !directVaeDecode,
    sonara_generation_profile: 'auto',
    sonara_speed_inference_steps: steps,
    sonara_speed_sampler: 'euler',
    sonara_r2_generation_profile: profile,
    sonara_r2_generation_policy: R2_GENERATION_POLICY,
    sonara_instrument_realism: profile === 'fast' ? null : INSTRUMENT_REALISM_VERSION,
    sonara_instrument_realism_depth: profile === 'fast' ? null : profile,
    sonara_natural_instrument_ab_profile: profile === 'fast' ? null : NATURAL_INSTRUMENT_AB_PROFILE,
    sonara_natural_instrument_ab_required: profile !== 'fast',
    enable_normalization: profile === 'fast' ? payload.enable_normalization : normalizationEnabled,
    normalization_db: profile === 'fast' ? payload.normalization_db : normalizationDb,
    sonara_mix_master_profile: mixMaster?.id || null,
    sonara_mix_master_version: mixMaster ? MIX_MASTER_VERSION : null,
    sonara_target_peak_db: mixMaster ? normalizationDb : null,
    sonara_instant_mode: profile === 'fast'
  };
  delete next.lm_batch_chunk_size;
  delete next.use_cot_metas;
  delete next.use_constrained_decoding;
  return next;
}
