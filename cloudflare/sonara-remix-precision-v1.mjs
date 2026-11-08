// SONARA Remix professional source-lock contract.
// Uses native ACE-Step 1.5 cover controls, never claims source analysis.
const clamp = (value, fallback, min, max) => {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const modes = {
  faithful: { strength: 0.86, noise: 0.08, name: 'Faithful' },
  balanced: { strength: 0.72, noise: 0.14, name: 'Balanced' },
  creative: { strength: 0.52, noise: 0.24, name: 'Creative' }
};
export const REMIX_PRECISION_VERSION = 'sonara-remix-source-precision-v1';

export function preparePreciseRemixPayload(configured, body = {}) {
  const requested = String(body.sonaraRemixPrecisionMode || 'balanced').toLowerCase();
  const mode = Object.hasOwn(modes, requested) ? requested : 'balanced';
  const preset = modes[mode];
  const duration = Math.round(clamp(body.durationSec ?? body.audio_duration, 30, 10, 600));
  // Do not silently treat a default UI BPM as a measurement of source tempo.
  const rawBpm = body.sonaraRemixTempoMode === 'auto' ? null : (body.sonaraRemixRequestedBpm ?? body.bpm);
  const hasBpm = rawBpm !== null && rawBpm !== undefined && String(rawBpm).trim() !== '';
  const bpmNumber = Number(rawBpm);
  const bpm = hasBpm && Number.isFinite(bpmNumber) && bpmNumber >= 40 && bpmNumber <= 220
    ? Math.round(bpmNumber) : null;
  const key = body.sonaraRemixKeyMode === 'auto' ? '' : String(body.sonaraRemixRequestedKey ?? body.key ?? body.key_scale ?? '').trim().slice(0, 40);
  const strength = clamp(body.audio_cover_strength, preset.strength, 0.35, 0.92);
  const noise = clamp(body.cover_noise_strength, preset.noise, 0.04, 0.30);
  const creatorPrompt = String(body.rawPrompt || body.prompt || '').trim().slice(0, 7000);
  const contract = [
    'SONARA PROFESSIONAL REMIX: use the uploaded source audio as the structural and rhythmic reference, not as background decoration.',
    'Create exactly one newly rendered coherent musical reinterpretation. Preserve the identifiable hook and core motif, musical phrases, harmonic center, original meter, groove accents, section transitions and phrase continuity where audible.',
    'Do not paste two whole songs together, randomly change beat subdivision or drift into an unrelated genre. Keep consistent instrument and performer identities, intelligible lead parts, clean stereo, defined bass, natural transients and clear non-harsh highs.',
    'Respect the creator prompt for transformations; allow new instrumental color and arrangement detail without introducing incompatible chords, arbitrary key changes or lost downbeats.',
    'Avoid repeated generic tu-tu-tu drum pulses, copy-paste loops, dead space, artificial endings and low-fidelity artifacts.',
    bpm !== null ? 'EXPLICIT CREATOR TEMPO: ' + bpm + ' BPM; keep this beat grid stable throughout the remix.' : 'TEMPO AUTO: follow the audible source pulse and meter. No numerical BPM has been measured or requested.',
    key ? 'EXPLICIT CREATOR TONALITY: ' + key + '; avoid unsupported key drift.' : 'KEY AUTO: preserve the audible source harmonic center. No numerical pitch/key analysis has been performed.',
    'Requested output duration: approximately ' + duration + ' seconds, reflecting the selected source excerpt, not an arbitrary 30-second minimum.',
    'Remix intent: ' + preset.name + '. Prefer source recognition and coherent musical editing over unnecessary novelty.'
  ].join(' ');
  const finalPrompt = [creatorPrompt, contract].filter(Boolean).join(' ').slice(0, 11000);
  return {
    ...configured,
    sonaraRemixSourceId: body.sonaraRemixSourceId,
    sonara_remix_precision_version: REMIX_PRECISION_VERSION,
    sonara_remix_precision_mode: mode,
    task_type: 'cover',
    batch_size: 1,
    candidateCount: 1,
    audio_cover_strength: strength,
    cover_noise_strength: noise,
    audio_duration: duration,
    ...(bpm === null ? { bpm: null, sonara_requested_bpm: null } : { bpm, sonara_requested_bpm: bpm }),
    key_scale: key || '',
    prompt: finalPrompt,
    instruction: finalPrompt
  };
}
