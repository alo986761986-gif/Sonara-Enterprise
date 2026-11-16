// Pure, auditable ACE-Step-only free prompt contract for Cloudflare R2.
// No imports from old music taxonomy, prompt director or TS runtime.
function directProfileOf(body = {}) {
  const raw = String(body.generationProfileV3 || body.renderProfile || body.generationProfile || body.qualityProfile || 'quality').toLowerCase().trim();
  if (['fast', 'speed', 'preview', 'instant'].includes(raw)) return 'fast';
  if (['ultra', 'maximum', 'max', 'studio', 'master'].includes(raw)) return 'ultra';
  return 'quality';
}

/**
 * Prompt Libero is isolated from legacy music-director/taxonomy prompt wrappers.
 * Do not silently inject genre, atmosphere, instrument choices, key, or default BPM.
 * Preserve only the real creator brief and essential, supported ACE-Step options.
 */
export function buildFreeMolabR2Payload(body = {}) {
  const prompt = String(body.rawPrompt || body.prompt || '').trim().slice(0, 7600);
  const explicitInstrumental = /\b(?:instrumental(?:e)?|strumentale|no vocals?|without vocals?|sans voix|senza voce|solo strumenti|only instruments?)\b/i.test(prompt);
  const lyrics = explicitInstrumental ? '[Instrumental]' : String(body.lyrics || '').slice(0, 4096);
  if (!prompt) throw new TypeError('SONARA Prompt Libero requires a prompt');
  const bpmMatch = /\b(?:bpm\s*[:=]?\s*(\d{2,3})|(\d{2,3})\s*bpm)\b/i.exec(prompt);
  const proposedBpm = bpmMatch ? Number(bpmMatch[1] || bpmMatch[2]) : null;
  const bpm = Number.isInteger(proposedBpm) && proposedBpm >= 40 && proposedBpm <= 220 ? proposedBpm : null;
  const durationRaw = Number(body.durationSec ?? body.duration ?? body.audio_duration);
  const audioDuration = Number.isFinite(durationRaw) ? Math.max(30, Math.min(480, Math.round(durationRaw))) : 30;
  const profile = directProfileOf(body);
  const wantsSft = body.sonaraAceVariant === 'xl-sft' && body.sonaraSftQualityPro === true
    && body.sonaraRemixPro !== true && !body.sonaraRemixSourceId;
  const steps = wantsSft ? 50 : profile === 'fast' ? 1 : 8;
  return {
    model: wantsSft ? 'acestep-v15-xl-sft' : 'acestep-v15-xl-turbo',
    task_type: 'text2music',
    prompt,
    lyrics,
    instrumental: explicitInstrumental,
    audio_format: 'wav',
    audio_duration: audioDuration,
    batch_size: 1,
    inference_steps: steps,
    guidance_scale: wantsSft ? 7.0 : 1.0,
    shift: wantsSft ? 1.0 : profile === 'fast' ? 1.0 : 3.0,
    infer_method: 'ode',
    sampler_mode: 'euler',
    thinking: wantsSft ? false : profile !== 'fast',
    allow_lm_batch: false,
    use_random_seed: true,
    use_format: false,
    use_cot_caption: false,
    use_cot_language: false,
    enable_normalization: true,
    normalization_db: -1.0,
    ...(bpm === null ? {} : { bpm, sonara_requested_bpm: bpm }),
    ...(wantsSft ? { sonaraAceVariant: 'xl-sft', sonaraSftQualityPro: true,
      sonara_sft_lm_planning_policy: 'auto-gpu-health-verified' } : {}),
    sonaraPromptMode: 'free',
    sonara_r2_generation_profile: wantsSft ? 'pro' : profile,
    sonara_r2_generation_policy: 'sonara-prompt-direct-v1',
    sonara_physical_fidelity_required: false
  };
}

