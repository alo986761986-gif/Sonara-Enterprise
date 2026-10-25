// Stock ACE-Step 1.5 XL Turbo request policy for the HTTPS/R2 path only.
// Official API/INFERENCE/Tutorial at ca1e85fe recommend 8 steps and shift 3
// for Turbo. Native `thinking` generates LM audio codes; it does not require
// SONARA's optional, custom realism API. It is intentionally opt-in via ULTRA.
export const R2_GENERATION_POLICY = 'sonara-stock-xl-turbo-quality-v1';

const text = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const firstText = (...values) => values.map(text).find(Boolean) || '';
const unique = values => [...new Set(values.map(text).filter(Boolean))];

function profileOf(body) {
  const raw = firstText(body.generationProfileV3, body.renderProfile, body.generationProfile, body.qualityProfile).toLowerCase();
  if (['fast', 'speed', 'preview'].includes(raw)) return 'fast';
  if (['ultra', 'maximum', 'max', 'studio', 'master'].includes(raw)) return 'ultra';
  return 'quality';
}

export function r2GenerationSettings(body = {}) {
  const profile = profileOf(body);
  return { profile, steps: profile === 'fast' ? 1 : 8,
    shift: profile === 'fast' ? 1.0 : 3.0, thinking: profile === 'ultra' };
}

export function r2GenerationMetadata(body = {}, count = 2) {
  const { profile, steps, shift, thinking } = r2GenerationSettings(body);
  return {
    generationPolicy: R2_GENERATION_POLICY,
    generationProfile: profile,
    requestedGenerationProfile: profile,
    executionProfile: thinking ? 'xl-turbo-lm-planned-batch' : `${profile}-single-gpu-batch`,
    inferenceSteps: steps, shift, samplerMode: 'euler', lmThinking: thinking,
    lmAudioPlanning: thinking, lmModel: 'acestep-5Hz-lm-4B',
    batchSize: count, candidateCount: count, singleGpuBatch: true,
    visibleCandidateTarget: count, internalCandidateTarget: count,
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
  const instrumentsValue = body.selectedInstruments || body.instruments;
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

  // A descriptive caption replaces thousands of generated, contradictory
  // director instructions. BPM/key/duration remain native structured fields.
  // Keep the creator's actual brief and lyrics, even when they exceed the
  // guide's recommended caption/lyrics lengths; never silently cut user text.
  return unique([style, mood, vocal, instruments, creativity, adherence, brief]).join('. ');
}

export function applyR2GenerationProfile(payload, resolvedBody = {}, sourceBody = resolvedBody) {
  const { profile, steps, shift, thinking } = r2GenerationSettings(resolvedBody);
  const lyrics = originalLyrics(payload, sourceBody);
  const next = {
    ...payload,
    prompt: caption(payload, resolvedBody, sourceBody, lyrics),
    lyrics,
    inference_steps: steps,
    shift,
    guidance_scale: 1.0,
    infer_method: 'ode',
    sampler_mode: 'euler',
    thinking,
    // Keep supplied lyrics, caption, language and numeric controls authoritative.
    // Stock API metadata completion can still run independently of `thinking`.
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
    lm_negative_prompt: 'NO USER INPUT',
    allow_lm_batch: thinking && Number(payload.batch_size) > 1,
    // Avoid custom MoLab compatibility patches overriding native parameters.
    sonara_generation_profile: 'auto',
    sonara_speed_inference_steps: steps,
    sonara_speed_sampler: 'euler',
    sonara_r2_generation_profile: profile,
    sonara_r2_generation_policy: R2_GENERATION_POLICY
  };
  // These legacy keys are not parsed by the stock REST request schema.
  delete next.lm_batch_chunk_size;
  delete next.use_cot_metas;
  delete next.use_constrained_decoding;
  return next;
}
