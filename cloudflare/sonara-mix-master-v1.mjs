export const MIX_MASTER_VERSION = 'sonara-mix-master-v1';

const text = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const contextOf = body => [
  body?.genre, body?.subgenre, body?.mood, body?.atmosphere,
  body?.sonaraWorldStyleGenre, body?.sonaraWorldStyleInstrumentation,
  body?.instrumentation, body?.rawPrompt, body?.creatorPrompt,
  body?.creator_prompt, body?.musicPrompt, body?.prompt,
  ...(Array.isArray(body?.selectedInstruments) ? body.selectedInstruments : []),
  ...(Array.isArray(body?.instruments) ? body.instruments : [])
].map(value => typeof value === 'string' ? value : value?.name || value?.label || '').map(text).filter(Boolean).join(' ').toLowerCase();

function profileId(context) {
  if (/\b(classical|orchestral|symphonic|chamber|baroque|romantic era|opera|classica|orchestrale|sinfonic)\b/.test(context)) return 'orchestral-dynamic';
  if (/\b(ambient|drone|soundscape|meditation|new age)\b/.test(context)) return 'ambient-open';
  if (/\b(acoustic|unplugged|folk|americana|singer songwriter|cantautore|cantautrice|bluegrass)\b/.test(context)) return 'acoustic-natural';
  if (/\b(jazz|soul|neo soul|r&b|rhythm and blues|funk|gospel)\b/.test(context)) return 'organic-groove';
  if (/\b(rock|indie|alternative|punk|metal|grunge)\b/.test(context)) return 'band-forward';
  if (/\b(hip hop|hip-hop|trap|drill|boom bap|rap)\b/.test(context)) return 'urban-punch';
  if (/\b(edm|house|techno|trance|dance|electronic|synthwave|dnb|drum and bass|future bass|club)\b/.test(context)) return 'electronic-punch';
  if (/\b(cinematic|soundtrack|score|trailer)\b/.test(context)) return 'cinematic-depth';
  return 'modern-balanced';
}

const PEAKS = {
  'orchestral-dynamic': -2.0,
  'ambient-open': -2.0,
  'acoustic-natural': -1.5,
  'organic-groove': -1.2,
  'cinematic-depth': -1.5,
  'band-forward': -1.0,
  'urban-punch': -1.0,
  'electronic-punch': -1.0,
  'modern-balanced': -1.0
};

const BASE = {
  'orchestral-dynamic': 'mix/master: preserve macro-dynamics and front-to-back orchestral depth, keep natural crest factor, stable center image and unforced high-frequency air',
  'ambient-open': 'mix/master: preserve long tails and low-level detail, wide but phase-coherent ambience, restrained transient density and generous headroom',
  'acoustic-natural': 'mix/master: keep hand dynamics and body resonance, believable near/far placement, natural transients and room continuity without over-compression',
  'organic-groove': 'mix/master: preserve pocket and transient nuance, warm midrange, controlled low-end overlap and vocal/instrument call-and-response without flattening dynamics',
  'band-forward': 'mix/master: keep drums punchy, guitars layered without masking the vocal, bass centered and readable, cymbals energetic without harshness',
  'urban-punch': 'mix/master: focused vocal and snare, deep centered bass with kick separation, intentional dry/wet contrast and controlled high-frequency bite',
  'electronic-punch': 'mix/master: mono-compatible sub foundation, clear kick/bass separation, controlled transient punch, stereo width concentrated above the low bass and automation-driven depth',
  'cinematic-depth': 'mix/master: strong foreground/midground/background depth, preserve impact without constant maximum density, wide ambience with a stable low-frequency center',
  'modern-balanced': 'mix/master: preserve transient contrast, readable low end, stable vocal or lead focus, coherent depth and stereo width without constant limiting'
};

function instrumentationCues(context, depth) {
  const cues = [];
  const drums = /\b(drum|drums|batteria|kick|snare|hi-hat|percussion|percussioni)\b/.test(context);
  const bass = /\b(bass|basso|contrabbasso|808|sub bass)\b/.test(context);
  const keysGuitar = /\b(piano|pianoforte|rhodes|guitar|chitarra|keys|keyboard)\b/.test(context);
  const orchestral = /\b(strings|archi|violin|violino|cello|violoncello|brass|ottoni|woodwind|legni|flute|flauto|trumpet|tromba)\b/.test(context);
  const vocal = /\b(vocal|vocals|voce|singer|cantante|male vocals|female vocals|duet)\b/.test(context);

  if (drums && bass) cues.push('low end: kick and bass stay distinguishable in attack and sustain instead of becoming one continuous block');
  if (keysGuitar) cues.push('midrange: chordal instruments occupy complementary registers and leave a clear lead/vocal lane');
  if (orchestral) cues.push('depth: section placement uses level, articulation and ambience rather than making every family equally wide and close');
  if (vocal) cues.push('lead focus: vocal stays intelligible through arrangement space and balance, not by crushing the backing track');
  if (depth === 'ultra') cues.push('master motion: section-to-section balance and density may move subtly; do not hold every element at the same loudness for the whole song');
  return cues;
}

export function mixMasterPlan(body = {}, options = {}) {
  const depth = options.depth === 'ultra' ? 'ultra' : 'quality';
  const context = contextOf(body);
  const id = profileId(context);
  const targetPeakDb = PEAKS[id];
  const cues = instrumentationCues(context, depth);
  return {
    version: MIX_MASTER_VERSION,
    depth,
    id,
    targetPeakDb,
    cues,
    cue: [BASE[id], ...cues, 'final peak normalization is safety headroom only; keep musical dynamics inside the performance'].join('; ')
  };
}

export function safePeakTarget(requestedValue, plannedValue) {
  const planned = Number.isFinite(Number(plannedValue)) ? Number(plannedValue) : -1.0;
  const requested = Number(requestedValue);
  if (!Number.isFinite(requested)) return planned;
  // Never make a user's explicitly more conservative headroom louder.
  // Never allow an aggressive value above the selected safety target.
  return Math.min(requested, planned);
}
