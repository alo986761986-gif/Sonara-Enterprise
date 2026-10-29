export const INSTRUMENT_REALISM_VERSION = 'sonara-instrument-realism-v5-human-performance';

const text = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const list = value => {
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : item?.name || item?.label || '').map(text).filter(Boolean);
  const raw = text(value);
  return raw ? raw.split(/[,;|]/).map(text).filter(Boolean) : [];
};
const unique = values => [...new Set(values.map(text).filter(Boolean))];

const RULES = [
  { id:'piano-keys', re:/\b(piano|pianoforte|rhodes|wurlitzer|wurli|clavinet|harpsichord|clavichord|celesta|electric piano)\b/i,
    cue:'keys: velocity-shaped attacks, pedal and release timing, register-specific resonance and voicings that breathe' },
  { id:'bowed-strings', re:/\b(violin|violino|viola|cello|violoncello|double bass|contrabass|string section|strings|archi|sarangi|erhu|haegeum|kamancheh|rebab)\b/i,
    cue:'bowed strings: changing bow pressure and speed, connected legato, selective vibrato, section-size detail and body resonance' },
  { id:'guitars-fretted', re:/\b(guitar|chitarra|mandolin|mandolino|banjo|ukulele|bouzouki|charango|cavaquinho|vihuela|balalaika|domra|sitar|sarod|oud|baglama|bağlama|dombra|pipa|shamisen|koto|guzheng)\b/i,
    cue:'plucked strings: pick or finger variation, realistic chord releases, fret and string resonance, position-dependent tone and non-identical strums' },
  { id:'bass', re:/\b(bass guitar|fretless bass|electric bass|upright bass|double bass|sub bass|mono bass|bass synth|basso elettrico|contrabbasso|basso)\b/i,
    cue:'bass: changing pluck or attack, note-length decisions, slides where musical, finger-to-finger variation and physical low-end resonance' },
  { id:'acoustic-drums', re:/\b(acoustic drum kit|jazz drum kit|rock drum kit|drum kit|batteria acustica|batteria|kick drum|snare drum|hi-hat|ride cymbal|crash cymbal|floor tom|rack tom|timpani|concert bass drum)\b/i,
    cue:'drums: distinct stick velocities, ghost notes where stylistic, realistic rebounds and fills, cymbal decay and one believable kit-and-room image' },
  { id:'hand-percussion', re:/\b(conga|bongo|djembe|tabla|caj[oó]n|darbuka|dhol|pakhawaj|mridangam|ghatam|kanjira|pandeiro|surdo|tambourine|tamburello|shaker|maraca|claves|riq|bendir|talking drum|taiko|janggu|kendang|percussion|percussioni)\b/i,
    cue:'hand percussion: changing strike position and strength, hand-to-hand variation, real skin or wood decay and human subdivision' },
  { id:'brass', re:/\b(trumpet|tromba|cornet|flugelhorn|flicorno|french horn|corno|trombone|euphonium|tuba|sousaphone|bugle|brass|ottoni)\b/i,
    cue:'brass: breath and embouchure-shaped attacks, dynamic swells, valve or slide continuity and natural pitch connections' },
  { id:'woodwinds', re:/\b(flute|flauto|piccolo|oboe|english horn|bassoon|fagotto|clarinet|clarinetto|saxophone|sax|recorder|whistle|bansuri|shakuhachi|dizi|ney|duduk|shehnai|woodwind|legni)\b/i,
    cue:'winds: breath-shaped phrase lengths, tongued and legato attacks, natural register transitions and only subtle mechanical noise' },
  { id:'reeds-organs', re:/\b(accordion|fisarmonica|bandoneon|concertina|harmonium|melodica|pipe organ|organo|hammond organ|reed organ)\b/i,
    cue:'reeds and organs: continuous air or tone, believable key or bellows articulation, drawbar or register continuity and non-static sustain' },
  { id:'electronic', re:/\b(synth|synthesizer|sintetizzatore|drum machine|tr-808|808|tr-909|909|tr-606|606|sampler|mpc|groovebox|mellotron|vocoder|modular|wavetable|granular|fm synthesizer)\b/i,
    cue:'electronic sources: intentional oscillator, filter and envelope movement, stable programmed timing when appropriate and non-static modulation' }
];

function sourceInstruments(body = {}) {
  const genome = body?.sonaraTrackGenome?.instruments;
  return unique([...list(body.selectedInstruments), ...list(body.instruments), ...list(genome)]);
}

function sourceContext(body = {}) {
  return [
    ...sourceInstruments(body), text(body.sonaraWorldStyleInstrumentation), text(body.instrumentation),
    text(body.rawPrompt), text(body.creatorPrompt), text(body.creator_prompt), text(body.musicPrompt), text(body.prompt)
  ].filter(Boolean).join(' ');
}

function lyricStructure(body = {}) {
  const raw = typeof body.sonaraOriginalLyrics === 'string' ? body.sonaraOriginalLyrics
    : typeof body.lyrics === 'string' ? body.lyrics : '';
  const tags = [...raw.matchAll(/\[([^\]\r\n]{2,64})\]/g)].map(match => match[1].toLowerCase());
  const has = pattern => tags.some(tag => pattern.test(tag));
  return {
    tagged: tags.length > 0,
    intro: has(/\bintro\b/), verse: has(/\b(verse|strofa)\b/),
    chorus: has(/\b(chorus|ritornello|hook|refrain)\b/),
    bridge: has(/\b(bridge|ponte)\b/),
    instrumental: has(/\b(instrumental|interlude|solo|break|assolo)\b/),
    outro: has(/\b(outro|finale)\b/)
  };
}

function ensembleInteractions(families) {
  const has = id => families.includes(id);
  const cues = [];
  if (has('acoustic-drums') && has('bass')) cues.push('rhythm section: kick and bass share the pocket but keep independent attacks and note lengths; fills answer phrases instead of looping mechanically');
  if (has('piano-keys') && has('bass')) cues.push('keys and bass: complementary registers and voicings, avoiding doubled low notes and constant left-hand congestion');
  if (has('guitars-fretted') && has('bass')) cues.push('guitar and bass: separate rhythmic roles and registers, with chord releases leaving room for bass movement');
  if (has('piano-keys') && has('bowed-strings')) cues.push('keys and strings: complementary voicings and phrase hand-offs rather than sustained layers playing identical harmony');
  if ((has('brass') || has('woodwinds')) && has('bowed-strings')) cues.push('ensemble lines: winds or brass answer string phrases with breath-sized gaps instead of all sections sustaining together');
  if (has('electronic') && has('acoustic-drums')) cues.push('hybrid rhythm: programmed elements stay deliberately tight while live drums retain human velocity and timing variation');
  return cues;
}

function genrePocket(body = {}) {
  const context = [body.genre, body.subgenre, body.sonaraWorldStyleGenre, body.rawPrompt, body.creatorPrompt].map(text).join(' ').toLowerCase();
  if (/\b(jazz|soul|funk|neo soul|r&b|rhythm and blues)\b/.test(context))
    return 'pocket: preserve push-and-pull, ghost-note nuance and conversational comping; do not quantize every performed part to the same grid';
  if (/\b(rock|indie|alternative|punk|grunge|country|folk|americana)\b/.test(context))
    return 'band feel: keep a stable backbeat while fills, strums and bass attacks vary with phrases and section transitions';
  if (/\b(classical|orchestral|cinematic|symphonic|chamber|soundtrack)\b/.test(context))
    return 'ensemble arc: shape dynamics over phrases and sections, preserve natural orchestral depth and avoid every section peaking at once';
  if (/\b(hip hop|hip-hop|trap|drill|boom bap|rap)\b/.test(context))
    return 'programmed pocket: keep drum placement intentional and punchy, preserve kick/bass separation, and avoid random humanization of designed electronic hits';
  if (/\b(edm|dance|house|techno|trance|electronic|synthwave|drum and bass|dnb)\b/.test(context))
    return 'electronic groove: keep the clock stable while automation, fills, filter motion and accent changes create life; do not fake acoustic looseness on programmed parts';
  if (/\b(acoustic|unplugged|singer songwriter|cantautore)\b/.test(context))
    return 'acoustic feel: preserve hand dynamics, phrase breathing and a shared-room sense without over-wide or over-polished imaging';
  return '';
}

function sourceCharacterLock(body = {}, families = []) {
  const context = [
    body.genre, body.subgenre, body.sonaraWorldStyleGenre, body.sonaraWorldStyleInstrumentation,
    body.rawPrompt, body.creatorPrompt, body.creator_prompt, body.musicPrompt, body.prompt
  ].map(text).join(' ').toLowerCase();
  const electronicGenre = /\b(house|tech house|techno|edm|dance|electronic|trance|garage|drum and bass|dnb|trap|drill|synthwave|electro|breakbeat|dubstep)\b/.test(context)
    || (families.length > 0 && families.every(id => id === 'electronic'));

  if (electronicGenre) {
    return 'source-character lock: keep genre-authentic electronic drums and instruments professional and intentional; preserve the anchor kick pulse but reject cheap one-note drum pulses, machine-gun repetition, identical full-bar drum loops, toy percussion, static envelopes and the exact same transient on every hit; hats, claps/snares and percussion need believable accent, decay, texture, swing or phrase-level variation while the club clock remains stable';
  }
  if (families.includes('acoustic-drums') || families.includes('hand-percussion')) {
    return 'drum/percussion naturalism: repeated hits respond to phrase and dynamics; reject machine-gun repetition, identical sample resets, toy-like thuds and flat repeated transients; preserve stick or hand variation, decay overlap, ghost notes or fills where stylistic, and one coherent physical kit or percussion space';
  }
  return 'instrument-source lock: preserve believable source character, articulation and decay for every requested instrument; never replace a defined instrumental role with a generic synthetic pulse, toy-like sample or identical repeated articulation';
}

function sectionCue(structure, depth) {
  if (!structure.tagged) return depth === 'ultra'
    ? 'arrangement motion: create believable phrase-to-phrase changes in density, fills and dynamics without repetitive copy-paste accompaniment'
    : 'arrangement motion: vary density and dynamics naturally across phrases';
  const parts = [];
  if (structure.verse) parts.push('verses leave space and reduce density');
  if (structure.chorus) parts.push('choruses widen and intensify through performance, voicing or texture rather than simple loudness');
  if (structure.bridge) parts.push('bridge changes texture or register before returning');
  if (structure.instrumental) parts.push('instrumental sections feature purposeful lead-and-response playing');
  if (structure.intro) parts.push('intro establishes the room and core motif without exposing every layer immediately');
  if (structure.outro) parts.push('outro releases energy and resolves with natural tails');
  return 'section-aware arrangement: ' + (parts.length ? parts.join(', ') : 'follow the supplied section tags with clear but musical changes in density and dynamics');
}

function mixCue(families, depth) {
  const acoustic = families.some(id => id !== 'electronic');
  const base = [
    'mix realism: one coherent depth perspective',
    'preserve transient contrast, low-level detail and natural decay tails',
    'avoid identical stereo width on every source',
    'avoid constant brick-wall loudness and over-polished spectral sameness'
  ];
  if (acoustic) base.push('shared early reflections for acoustic performers with source-specific distance and stable position in the room');
  if (families.includes('bass') || families.includes('acoustic-drums')) base.push('solid centered low-frequency foundation with kick and bass remaining distinguishable');
  if (depth === 'ultra') base.push('automation follows musical phrases so balances move subtly between sections');
  return base.join(', ');
}

function performanceAuthenticityCue(families, depth) {
  const acoustic = families.some(id => id !== 'electronic');
  const cues = [
    'performance authenticity: repeated notes and repeated bars must not share identical attack, velocity, envelope or timing fingerprints',
    'human gesture continuity: dynamics, timing, articulation and tone must evolve as one connected performance across a phrase rather than as isolated note events',
    'musicians phrase in arcs across several beats and bars instead of triggering isolated MIDI-like notes',
    'ensemble response: accompaniment reacts to lead phrasing, section energy and groove changes; fills and accents answer musical events instead of appearing on a fixed loop',
    'arrangement breathes: not every instrument plays continuously; entrances, rests, pickups and releases follow musical phrases',
    'timbral non-repetition: repeated attacks should vary subtly in spectral balance, transient shape and decay whenever the source would physically vary'
  ];
  if (acoustic) cues.push('mechanical and performer noises may exist only at subtle natural levels and must follow the physical action that caused them');
  if (families.includes('acoustic-drums')) cues.push('drum shells, cymbals and room tails overlap naturally across hits; no sample-reset effect unless the genre explicitly asks for it');
  if (families.includes('guitars-fretted')) cues.push('strums are not sample-identical: string order, pick pressure and chord release vary with the phrase');
  if (families.includes('piano-keys')) cues.push('pedal resonance and note release depend on harmony and register instead of a fixed sample envelope');
  if (families.includes('bowed-strings')) cues.push('bow changes, vibrato depth and section attacks vary with phrase intensity rather than remaining fixed');
  if (families.includes('brass') || families.includes('woodwinds')) cues.push('breath capacity creates believable phrase endings, re-attacks and dynamic transitions');
  if (depth === 'ultra') cues.push('microtiming is relational: performers react to the groove and to each other, not independent random timing jitter');
  return cues.join('; ');
}

function recordingRealityCue(families) {
  const electronicOnly = families.length > 0 && families.every(id => id === 'electronic');
  return electronicOnly
    ? 'recording reality: programmed sources remain intentionally synthetic when requested, but avoid cheap preset repetition, static envelopes, phase-locked copy-paste loops and identical modulation cycles; preserve purposeful swing, velocity/accent hierarchy, evolving filter/envelope behavior and phrase-aware automation'
    : 'recording reality: preserve body resonance, air, room continuity, believable transient-to-sustain ratios, performer distance and small phrase-dependent tone changes; avoid plastic sample-library sameness, perfectly identical attacks and abrupt room resets';
}

export function instrumentRealismPlan(body = {}, options = {}) {
  const depth = options.depth === 'ultra' ? 'ultra' : 'quality';
  const instruments = sourceInstruments(body);
  const context = sourceContext(body);
  const maxFamilies = depth === 'ultra' ? 6 : 4;
  const matched = RULES.filter(rule => rule.re.test(context)).slice(0, maxFamilies);
  const families = matched.map(rule => rule.id);
  const structure = lyricStructure(body);
  const interactions = ensembleInteractions(families).slice(0, depth === 'ultra' ? 3 : 1);
  const pocket = genrePocket(body);
  const cue = [
    'Recorded-performance realism',
    ...matched.map(rule => rule.cue),
    ...interactions,
    pocket,
    sourceCharacterLock(body, families),
    sectionCue(structure, depth),
    performanceAuthenticityCue(families, depth),
    recordingRealityCue(families),
    'performed instruments use phrase-level dynamics and microtiming while programmed parts keep intentional timing',
    mixCue(families, depth),
    'no cloned note envelopes, plastic transients, machine-gun repetition, phase-locked acoustic doubles or identical repeated articulations'
  ].filter(Boolean).join('; ');
  return {
    version: INSTRUMENT_REALISM_VERSION,
    depth,
    enabled: true,
    explicitInstruments: instruments.slice(0, 12),
    families,
    ensembleInteractions: interactions,
    structureAware: structure.tagged,
    sourceCharacterLocked: true,
    naturalDrumAntiRepetition: true,
    cue
  };
}
