// SONARA Remix: guide audible instrument distinction in the newly generated
// cover. This is generative conditioning, NOT source stem extraction.
export const REMIX_INSTRUMENT_DEFINITION_VERSION = 'sonara-remix-instrument-definition-v2';

const FOCUS = Object.freeze({
  balanced: 'All present instrumental roles must remain individually readable, with coherent ensemble glue and a natural front-to-back mix.',
  rhythm: 'RHYTHM FOCUS: distinguish the kick, snare/clap, hi-hat, cymbals and secondary percussion by different attack, decay, dynamics and phrase-level accents; keep the original groove and a believable drum kit or electronic drum source.',
  bass: 'BASS FOCUS: bass notes need identifiable pitch, attack, release and rhythmic phrasing; resolve kick/bass overlap through timing, articulation and sensible spectral allocation rather than merely making the sub louder.',
  harmony: 'HARMONY FOCUS: piano, keys, guitars, pads and orchestral harmonies should use complementary chord voicings, octaves, entrances and note lengths; keep the original harmony and do not smother the melodic hook.',
  lead: 'MELODY FOCUS: preserve the recognizable original hook and melody; place one lead clearly in the foreground while supporting instruments respond between phrases rather than competing at the same pitch and time.',
  vocals: 'VOCAL FOCUS: where vocals are requested or present, protect intelligible words, phrasing and singer identity by leaving a center-midrange lane; do not drown the voice in pads, synth leads, cymbals or dense chord stacks.'
});

const FOCUS_NAMES = Object.freeze(Object.keys(FOCUS));

const clamp = (value, fallback, min, max) => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

function selectedInstruments(raw) {
  const entries = Array.isArray(raw) ? raw : String(raw || '').split(/[,;|]/);
  return [...new Set(entries
    .map(value => String(value || '').normalize('NFKC').replace(/[^\p{L}\p{N} '\-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 38))
    .filter(Boolean))].slice(0, 6);
}

export function remixInstrumentDefinitionPlan(body = {}) {
  const instrumental = /^(instrumental|no vocals|none|off)$/i.test(String(body.vocalMode || body.vocal_mode || '').trim());
  const requested = String(body.sonaraRemixInstrumentFocus || 'balanced').trim().toLowerCase();
  const focus = FOCUS_NAMES.includes(requested) && !(instrumental && requested === 'vocals') ? requested : 'balanced';
  const clarity = Math.round(clamp(body.sonaraRemixInstrumentClarity, 65, 30, 90));
  const instruments = selectedInstruments(body.sonaraRemixInstrumentList);

  const dynamicLevel = clarity >= 80
    ? 'HIGH INSTRUMENT READABILITY: optimize overlapping phrases and register collisions aggressively but musically; preserve room, natural warmth and dynamic glue rather than sounding like disconnected stems.'
    : clarity >= 55
      ? 'BALANCED INSTRUMENT READABILITY: keep each foreground and background role clear, without excessive hard panning, hyped treble or unnatural separation.'
      : 'NATURAL INSTRUMENT READABILITY: subtle arrangement spacing and articulation differences; preserve an organic warm ensemble and avoid artificial disconnection.';

  const cue = [
    'SONARA REMIX INSTRUMENT DEFINITION V2: clearly distinguish the audible instruments and production roles during generation, without adding instruments that do not belong to the requested style or source.',
    instruments.length
      ? 'CREATOR-IDENTIFIED INSTRUMENTS (not automatically detected): ' + instruments.join(', ') + '. Preserve their identities and distinguish their timbres, musical roles, envelopes and registers.'
      : 'No individual instruments were identified by the creator; use the audible source and genre as the sole guide. Never claim to have identified particular instruments or force new ones.',
    'Separate rhythm section from harmony and lead by intentional arrangement, non-competing registers, micro-dynamics, transients, timing and selective phrase gaps; do not simply boost everything.',
    'Where drums and bass exist: a defined kick attack plus bass pitch and note articulation, without low-end masking, endless sub sustain or a monotonous identical tu-tu-tu hit pattern.',
    'Where chordal instruments exist: complementary register, voicing and note length, not a cloud of indistinguishable guitars, keyboards, pads or strings.',
    'Where a melodic lead or vocal exists: leave it readable and continuous; the rest of the ensemble supports it with call-and-response instead of fighting at the same pitch and time.',
    'Maintain mono-compatible low frequencies, cohesive room/reverb perspective, restrained wide ambience where genre-appropriate, smooth but detailed high frequencies and natural transient contrast. Avoid phasey stereo, excessive upper-mid sharpness, glassy hi-hats, muddy low mids, artificial instrument tones and crushed dynamics.',
    'Apply these rules only to sounds actually present or requested. Do not remove the original hook, alter the original tempo/key, invent vocals for an instrumental track, or replace source timbres with generic synthetic sounds.',
    dynamicLevel,
    FOCUS[focus]
  ].join(' ');

  return {
    version: REMIX_INSTRUMENT_DEFINITION_VERSION,
    focus,
    clarity,
    creatorInstruments: instruments,
    cue
  };
}
