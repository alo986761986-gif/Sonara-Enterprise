export const INSTRUMENT_REALISM_VERSION = 'sonara-instrument-realism-v1';

const text = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const list = value => {
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : item?.name || item?.label || '').map(text).filter(Boolean);
  const raw = text(value);
  return raw ? raw.split(/[,;|]/).map(text).filter(Boolean) : [];
};
const unique = values => [...new Set(values.map(text).filter(Boolean))];

const RULES = [
  {
    id: 'piano-keys',
    re: /\b(piano|rhodes|wurlitzer|wurli|clavinet|harpsichord|clavichord|celesta|electric piano)\b/i,
    cue: 'keys: velocity-shaped attacks, pedal/decay and register-specific resonance'
  },
  {
    id: 'bowed-strings',
    re: /\b(violin|viola|cello|double bass|contrabass|string section|strings|sarangi|erhu|haegeum|kamancheh|rebab)\b/i,
    cue: 'bowed strings: bow-pressure changes, legato transitions, vibrato and body resonance'
  },
  {
    id: 'guitars-fretted',
    re: /\b(guitar|mandolin|banjo|ukulele|bouzouki|charango|cavaquinho|vihuela|balalaika|domra|sitar|sarod|oud|baglama|bağlama|dombra|pipa|shamisen|koto|guzheng)\b/i,
    cue: 'plucked strings: pick/finger variation, fret/string resonance and natural note releases'
  },
  {
    id: 'bass',
    re: /\b(bass guitar|fretless bass|electric bass|upright bass|double bass|sub bass|mono bass|bass synth)\b/i,
    cue: 'bass: changing pluck/attack, note length, slides and physical low-end resonance'
  },
  {
    id: 'acoustic-drums',
    re: /\b(acoustic drum kit|jazz drum kit|rock drum kit|kick drum|snare drum|hi-hat|ride cymbal|crash cymbal|floor tom|rack tom|timpani|concert bass drum)\b/i,
    cue: 'drums: distinct stick velocities, ghost notes, cymbal decay and one believable kit/room image'
  },
  {
    id: 'hand-percussion',
    re: /\b(conga|bongo|djembe|tabla|caj[oó]n|darbuka|dhol|pakhawaj|mridangam|ghatam|kanjira|pandeiro|surdo|tambourine|shaker|maraca|claves|riq|bendir|talking drum|taiko|janggu|kendang|percussion)\b/i,
    cue: 'hand percussion: changing strike position/strength, real skin or wood decay and human subdivision'
  },
  {
    id: 'brass',
    re: /\b(trumpet|cornet|flugelhorn|french horn|trombone|euphonium|tuba|sousaphone|bugle|brass)\b/i,
    cue: 'brass: breath/embouchure attacks, dynamic swells and natural pitch connections'
  },
  {
    id: 'woodwinds',
    re: /\b(flute|piccolo|oboe|english horn|bassoon|clarinet|saxophone|sax|recorder|whistle|bansuri|shakuhachi|dizi|ney|duduk|shehnai|woodwind)\b/i,
    cue: 'winds: breath-shaped phrases, tongued/legato attacks, key noise kept subtle and natural'
  },
  {
    id: 'reeds-organs',
    re: /\b(accordion|bandoneon|concertina|harmonium|melodica|pipe organ|hammond organ|reed organ)\b/i,
    cue: 'reeds/organs: continuous air or tone, realistic key/bellows articulation and non-static sustain'
  },
  {
    id: 'electronic',
    re: /\b(synth|synthesizer|drum machine|tr-808|808|tr-909|909|tr-606|606|sampler|mpc|groovebox|mellotron|vocoder|modular|wavetable|granular|fm synthesizer)\b/i,
    cue: 'electronic sources: intentional oscillator/filter/envelope movement, stable clock and non-static modulation'
  }
];

function sourceInstruments(body = {}) {
  const genome = body?.sonaraTrackGenome?.instruments;
  return unique([
    ...list(body.selectedInstruments),
    ...list(body.instruments),
    ...list(genome)
  ]);
}

function sourceContext(body = {}) {
  return [
    ...sourceInstruments(body),
    text(body.sonaraWorldStyleInstrumentation),
    text(body.instrumentation),
    text(body.rawPrompt),
    text(body.creatorPrompt),
    text(body.creator_prompt),
    text(body.musicPrompt),
    text(body.prompt)
  ].filter(Boolean).join(' ');
}

export function instrumentRealismPlan(body = {}) {
  const instruments = sourceInstruments(body);
  const context = sourceContext(body);
  const matched = RULES.filter(rule => rule.re.test(context)).slice(0, 3);
  const cues = matched.map(rule => rule.cue);
  const cue = [
    'Recorded-performance realism',
    ...cues,
    'phrase-level dynamics and microtiming',
    'coherent mic/room perspective',
    'no cloned note envelopes or plastic transients'
  ].join('; ');
  return {
    version: INSTRUMENT_REALISM_VERSION,
    enabled: true,
    explicitInstruments: instruments.slice(0, 12),
    families: matched.map(rule => rule.id),
    cue
  };
}
