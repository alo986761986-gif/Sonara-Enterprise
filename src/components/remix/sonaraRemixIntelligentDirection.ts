/**
 * SONARA Remix Pro: offline, context-aware creative direction composer.
 *
 * Generates a fresh actionable production brief from explicit user controls
 * with no API call, no model inference and no audio upload. Actual source
 * content is analyzed by the authorized MoLab engine only after enqueue.
 */
export type DirectionMode = 'balanced' | 'experimental' | 'wild' | 'explosive';
export type SmartDirectionInput = {
  genre: string;
  mode: DirectionMode;
  bInfluence: number;
  bassFrom: 'a' | 'b';
  master: 'club' | 'streaming';
  bpmA?: number | string;
  bpmB?: number | string;
  dna?: { melody: number; harmony: number; groove: number; timbre: number; humanize: number };
};
type Palette = {
  identity: string;
  rhythm: readonly string[];
  colors: readonly string[];
  emotion: readonly string[];
};
const PALETTES: Record<string, Palette> = {
  auto: {
    identity: 'a genre-defying hybrid chosen from the real harmonic, vocal and rhythmic character of both references',
    rhythm: [
      'invent an elastic groove whose subdivisions emerge organically from both references',
      'build an unexpected half-time to double-time rhythmic transformation without a jarring tempo jump',
      'shape a danceable pulse from the contrast of the two reference rhythms',
      'alternate spacious drum phrasing and tightly articulated percussion while keeping one coherent meter',
      'reinterpret the two rhythmic signatures as a fresh syncopated groove',
      'create a strong dance pulse supported by subtle polyrhythmic accents',
    ],
    colors: [
      'contrast organic live playing with precise modern synthesizers',
      'combine expressive piano, resonant bass and evolving textural synthesizers',
      'use a bold bass motif, melodic strings and layered hand percussion',
      'make acoustic guitar, analog keys and electronic bass sound like one band',
      'revoice A and B motifs across brass stabs, warm keys and wide synthesizers',
      'pair rich live drums with intricate atmospheric electronic details',
    ],
    emotion: ['euphoric but emotionally grounded','mysterious and kinetic','bold and hypnotic','warm yet explosive','cinematic and rebellious'],
  },
  house: {
    identity: 'original modern house, with an organic club feel and musical character from both sources',
    rhythm: ['swinging four-on-the-floor kick and shuffling hats','a punchy Chicago-influenced house groove','crisp off-beat open hats and syncopated percussion','rolling house drums with human ghost-note variation','a soulful jackin-house rhythmic pocket','a club-ready shuffled groove with layered rim and clap patterns'],
    colors: ['warm Rhodes chords, punchy bass guitar and subtle analog pads','percussive piano stabs, expressive strings and synth bass','soulful organ, filtered guitar accents and a rounded sub bass','tight piano riffs, electric bass and an uplifting synth lead','live congas, shimmering keys and vintage string phrases','clean house bass, sampled-feel keys recreated as new performances, and live-style percussion'],
    emotion: ['soulful and uplifting','late-night and hypnotic','joyful yet underground','funky and commanding','euphoric without becoming cheesy'],
  },
  'tech-house': {
    identity: 'club-focused contemporary tech house with a surprising melodic identity sourced from A+B',
    rhythm: ['a tight four-on-the-floor kick with syncopated ghost percussion','rolling low-end interplay and restless shuffled hats','a restrained minimal groove opening into an explosive drop','dry claps and offbeat percussive accents around a powerful kick','tense breakbeat-derived fills inside a driving 4/4 structure','a tribal-feeling groove with sparse synthetic percussion'],
    colors: ['rubbery mono bass, metallic hits and short filtered vocal chops','analog bass movement, clipped synth stabs and crisp percussion','bouncy FM bass, subtle acid accents and glitchy fills','tight bass plucks, dark atmospheric synths and syncopated congas','distorted yet controlled bass, percussive chords and evolving sweeps','live hand drums, snappy keys and dark textured sub bass'],
    emotion: ['raw and magnetic','dark and infectious','playful and punchy','hypnotic yet explosive','minimal but distinctive'],
  },
  'deep-house': {
    identity: 'deep house with rich harmony, believable instruments and a strong original hook',
    rhythm: ['soft but precise 4/4 pulse with unhurried shuffled hats','organic deep grooves with softly displaced rim hits','a warm rolling bass-and-kick conversation','subtle percussion with breathing room around each downbeat','laid-back deep house swing and expressive ghost notes','a sparse underground pulse that blooms into layered movement'],
    colors: ['warm Rhodes, velvet pads, upright-style bass and airy guitar','deep synth bass, live-feel piano voicings and soft string harmonies','delicate marimba, analog synth pads and smoky organ','jazz-inflected electric piano and layered atmospheric synthesizers','subtle acoustic guitar, rich chord extensions and nuanced bass','lush organ chords, restrained lead synth and reverberant hand percussion'],
    emotion: ['intimate and nocturnal','dreamy and sophisticated','soulful and immersive','melancholic yet uplifting','luxurious and hypnotic'],
  },
  'jazz-fusion': {
    identity: 'virtuosic but natural jazz fusion incorporating both references within one harmonic vocabulary',
    rhythm: ['lively syncopated live drums with fluid ghost-note phrasing','a tight electric-funk pocket with odd-grouping accents','a Latin-jazz pulse with responsive acoustic percussion','a half-time jazz-funk groove progressing to energetic fills','a floating broken-beat rhythm with expressive cymbal work','a sophisticated fusion shuffle anchored by human drums'],
    colors: ['expressive electric piano, fretless bass and clean guitar','brass ensemble, warm Rhodes and singing electric guitar','punchy fusion bass, sophisticated keyboard chords and live brass','nylon guitar, spacious synth textures and agile bass','analog synth leads, live drums and tight rhythmic guitar','detailed piano voicings, dynamic horn phrases and melodic bass'],
    emotion: ['adventurous and fluid','elegant yet powerful','playfully virtuosic','warm and emotionally expressive','exploratory and kinetic'],
  },
  'hip-hop': {
    identity: 'modern hip-hop and rap fusion with a distinctive groove and completely newly arranged hooks',
    rhythm: ['crisp boom-bap drums with live ghost-note nuance','a heavy half-time pocket with syncopated hi-hats','a head-nodding dusty-feel drum groove recreated cleanly','a rolling double-time trap-influenced pulse with real dynamics','a West Coast-inspired rhythmic bounce with fresh fills','an aggressive swung breakbeat with controlled low end'],
    colors: ['punchy bass, dramatic piano and evocative sampled-feel strings recreated originally','analog synth bass, cinematic brass and expressive keys','a warm electric piano figure, live bass and dark textural pads','funk guitar accents, deep bass and orchestral hits','minimal keys, expressive synth leads and layered drum percussion','live-style horns, tight electric bass and haunting melodic accents'],
    emotion: ['confident and cinematic','raw and reflective','intense but musical','uplifting and defiant','dark and focused'],
  },
  'latin-house': {
    identity: 'Latin and Brazilian house with authentic groove, fresh harmonic identity and club power',
    rhythm: ['energetic conga and timbal conversation over a house kick','Brazilian syncopated percussion with organic hand drums','a syncopated samba-house hybrid without losing the dance pulse','a salsa-derived clave feeling integrated into a coherent 4/4 groove','a tribal Latin groove with dynamic shaker layers','bouncy dembow-influenced accents used tastefully within house'],
    colors: ['expressive nylon guitar, Brazilian hand percussion and warm bass','tropical piano stabs, organic congas and melodic synth brass','swinging bass, lively guitar flourishes and layered hand percussion','bright brass, acoustic guitar and warm analog synth layers','expressive piano montunos, live drums and club-ready synthesizers','rich vocal harmonies, rhythmic guitar and powerful melodic bass'],
    emotion: ['sunlit and euphoric','sensual and hypnotic','festive yet sophisticated','fiery and uplifting','warm and nocturnal'],
  },
  pop: {
    identity: 'modern professional pop with a memorable new refrain that transforms both A and B',
    rhythm: ['clean contemporary drums with bold dynamic chorus changes','a pulsing pop groove with live percussion nuances','syncopated electronic drums and supportive acoustic fills','a high-energy club-pop rhythm with precise breaks','bouncy syncopation with a huge uplifting chorus pulse','a spacious verse beat building into powerful drums'],
    colors: ['expressive piano, cinematic strings and analog synthesizers','clean electric guitar, live bass and bright synth layers','rich keyboard voicings, airy guitars and controlled sub bass','punchy drums, colorful synth leads and emotional piano','melodic bass, layered guitars and shimmering keys','warm electric piano, orchestral textures and modern synth bass'],
    emotion: ['anthemic and optimistic','romantic and dramatic','bold and playful','bittersweet yet euphoric','expansive and cinematic'],
  },
};
const FORMS = [
  'start with an intriguing B-derived motif, move into an A-inspired verse, answer with B and resolve both in a new refrain',
  'open with the A motif in a stripped-down setting, reveal a transformed B answer, then combine them in a climactic final chorus',
  'use a cinematic instrumental intro, build the A hook through the first breakdown and introduce B as a surprising new response',
  'start rhythm-first, reveal a B-influenced melodic hook after the first drop, then transform the A theme into the main chorus',
  'alternate two short contrasting phrases before revealing a third memorable hybrid hook that unifies the song',
  'write a restrained first verse, a clear A-inspired pre-chorus and a B-inspired chorus transformed into a shared final drop',
  'reimagine an instrumental figure from A as the call and a contrasting B figure as the response, with one coherent song arc',
  'create a sparse beginning, a powerful first refrain, an emotional break and an even stronger final combined refrain',
  'make a fresh B-derived opening phrase lead into A-derived melodic tension, then release into an original singable chorus',
  'introduce a recognizable rhythmic idea, reinterpret both melodic references as counter-motifs and finish on a unified hook',
];
const VOCALS = [
  'when either reference contains singing, write fresh lead phrases and layered backing voices, with clear diction and responsive ad-libs',
  'when both references have vocals, let their contrasting phrasing inspire an original call-and-response chorus and natural choir harmonies',
  'preserve the emotional contours of any intelligible refrains as inspiration for new vocal lines; never claim verbatim lyric recovery',
  'use a restrained verse vocal, a memorable refrain and tasteful background harmonies only where compatible with the source material',
  'arrange fresh lead and backing vocals in contrasting textures, keeping the original singers out of any direct source overlay',
  'favor expressive dynamic singing and new supporting choir parts when the references warrant it; otherwise let instruments carry the refrain',
  'create a short original vocal motif answered by an instrumental hook, with human breathing and carefully controlled reverb',
  'when references contain voice, build strong hook phrases without artificial chorus duplication or robotic autotune effects',
];
const ENERGY = [
  'build pressure using filtered percussion, a short silence and a hard-impact drop',
  'use a deceptive half-time breakdown, quick turnaround fills and a powerful return to the chorus',
  'add a measured drum crescendo with live cymbal work and a dramatic final lift',
  'develop a tension-and-release arc with a spacious break followed by wider harmonic voicings',
  'keep a clean first drop, reveal a larger bass countermelody in the second drop and end decisively',
  'use rhythmic stop-start accents, subtle risers and a final full-band statement',
  'shape two distinct energy peaks separated by a controlled atmospheric reset',
  'begin understated and gradually unlock more instrument layers without flattening the groove',
];
const DETAILS = [
  'Use cinematic impacts, short delays and restrained spatial effects only at important transitions.',
  'Use dynamic percussion fills, rhythmic tape-like echoes recreated digitally and precise reverb tails.',
  'Use clean stereo width, expressive guitar or keyboard fills and bright but never harsh top end.',
  'Use call-and-answer instrument orchestration, intimate room ambience and carefully timed sweeps.',
  'Use a subtle evolving pad under the build, transient detail in the drums and a tight rhythmic ending.',
  'Use analog-feel saturation, believable performance variations and clear separation of lead and bass.',
  'Use micro-pauses, creative filter automation and subtle harmonic embellishments between phrases.',
  'Use short reverse-style transitions, live-style instrumental ornaments and natural room depth.',
];
const STEADY_FORMS = [
  'Introduce A-inspired main motif, answer with B-inspired hook over exactly the same uninterrupted four-bar groove and finish on a fuller shared chorus',
  'Keep one continuous kick and bass pocket while fresh vocal lines from A and B trade phrases and instruments gradually build',
  'Begin with the complete beat, develop two contrasting A/B melodic motifs and intensify the final refrain only by adding harmonies',
  'Maintain one consistent dance pulse and drum kit as transformed A and B melodic ideas flow into a single memorable chorus',
  'Use one steady bass and percussion foundation with tasteful A/B call-and-response and evolving synth and vocal layers',
];
const STEADY_ENERGY = [
  'Build excitement by adding choir harmonies, percussion textures and synth layers while the foundational groove never stops.',
  'Make the final hook more powerful using wider chords and harmonies over the identical kick/snare/bass pulse.',
  'Evolve timbre, phrasing and vocal dynamics without gaps, breakdowns, tempo shifts or drum drops.',
  'Maintain continuous danceable kick and bass throughout verses, hooks and transitions; change only supporting instrumentation.',
  'Create a flowing, energetic arrangement with no silence, stop-start stabs, rhythmic resets or half-time sections.',
];
const STEADY_DETAILS = [
  'Use restrained reverb, delay and risers above the same continuous kick and bass groove.',
  'Add instrument counter-melodies and subtle hi-hat velocity changes without breaking the beat.',
  'Build instrumental density and warm vocal harmonies without replacing or stopping the foundational rhythm.',
  'Keep drum timbres, tempo, swing and bass lock consistent as keys, guitars and background vocals evolve.',
];
const MODE_DIRECTION: Record<DirectionMode, string> = {
  balanced: 'Prioritize coherent genre, a strong groove and deliberate musical contrast; no disconnected medley.',
  experimental: 'Discover one surprising but harmonically compatible cross-genre idea, without making the structure incoherent.',
  wild: 'Take an audacious compositional risk with new counter-melodies, unexpected section contrasts and dramatic dynamic shifts.',
  explosive: 'EXPLOSIVE FUSION — CONTINUOUS RHYTHM LOCK: one BPM, one stable meter, one uninterrupted kick/snare/hat/bass pattern across every bar. Do not use silence, beat drops, breakdowns, stop-start transitions, half-time, double-time, rhythmic resets or changing drum kits. A and B hooks, rich instruments and natural choir call-and-response grow OVER the same steady dance groove. Full finale through harmony, never by changing the beat.',
};
const bound=(value:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,Number.isFinite(value)?value:lo));
const validBpm=(n: number|string|undefined)=>{const x=Number(n);return n!==''&&n!==undefined&&Number.isFinite(x)&&x>=55&&x<=200?Math.round(x):null;};
function random32():number {
  if (typeof crypto!=='undefined' && typeof crypto.getRandomValues==='function') {
    return crypto.getRandomValues(new Uint32Array(1))[0]>>>0;
  }
  return (Math.random()*0x100000000)>>>0;
}
function sampler(seed:number) {
  let state=seed>>>0;
  return (size:number):number=>{
    state=(state+0x6D2B79F5)>>>0;
    let t=state;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)%size;
  };
}

/**
 * Pass a monotonically increasing sequence to avoid an imposed shuffle cap.
 * The proposals are diverse musical instructions, not an AI interpretation
 * or a claim to have analyzed audio uploaded by the user.
 */
export function createIntelligentRemixDirection(input:SmartDirectionInput,sequence=0,seed=random32()):string {
  const style=PALETTES[input.genre]||PALETTES.auto;
  const pick=sampler((seed^(Math.imul((sequence+1)>>>0,2654435761)))>>>0);
  const constantGroove=input.mode==='explosive';
  const choose=(options:readonly string[])=>options[pick(options.length)];
  const balance=bound(Number(input.bInfluence),20,80);
  const bpmA=validBpm(input.bpmA);
  const bpmB=validBpm(input.bpmB);
  const bass=input.bassFrom==='b'?'B':'A';
  const master=input.master==='club'?'club':'streaming';
  const dna=input.dna||{melody:65,harmony:60,groove:65,timbre:55,humanize:60};
  const human=bound(dna.humanize,0,100)>=65
    ? 'Respect human groove, varying articulation, ghost notes, velocity and instrument microtiming.'
    : 'Keep timing tight and musical; leave just enough live performance nuance.';
  const emphasis=balance===50
    ? 'Give A and B equal creative weight.'
    : balance>50
      ? 'Prioritize B slightly as a creative inspiration but keep recognizable transformed ideas from A.'
      : 'Prioritize A slightly as a creative inspiration but keep recognizable transformed ideas from B.';
  const tempo=bpmA&&bpmB
    ? 'User-supplied tempo references: A '+bpmA+' BPM, B '+bpmB+' BPM; reconcile them into ONE coherent pulse'+(constantGroove?', then maintain its exact tempo through every section without half-time, double-time or any rhythmic breaks.':', with half-time/double-time ideas when appropriate.')+' Confirm source BPM during analysis.'
    : bpmA||bpmB
      ? 'User-supplied tempo reference '+(bpmA||bpmB)+' BPM; verify against both audio sources before anchoring the new groove.'
      : 'Derive the most musical common tempo from real A/B audio analysis; never fabricate a BPM.';
  const focus= [
    bound(dna.melody,0,100)>=75?'Develop the A melodic contour with clear transformations.':'Borrow melodic gestures creatively rather than tracing a source note-for-note.',
    bound(dna.harmony,0,100)>=75?'Give the A harmonic vocabulary a strong role in the new progression.':'Reharmonize the two sources into one sensible tonal language.',
    bound(dna.groove,0,100)>=75?'Put the B rhythmic signature at the center of the arrangement.':'Translate the rhythmic identity of B into a fresh unified beat.',
    bound(dna.timbre,0,100)>=75?'Preserve rich B timbral inspiration using newly performed instruments.':'Blend fresh timbres that suit both sources without directly copying recordings.',
  ].join(' ');
  return [
    'SONARA ORIGINAL A+B MUSIC DIRECTION — compose ONE newly generated track, not a collage or source overlay.',
    'Style: '+style.identity+'. Mood: '+choose(style.emotion)+'.',
    'Rhythm: '+(constantGroove?'one unwavering '+(input.genre.includes('house')?'four-on-the-floor':'genre-appropriate')+' drum groove with steady kick, hats, snare and bass for the full duration; vary only micro-articulation above it':choose(style.rhythm))+'. '+tempo,
    'Instrumentation: '+choose(style.colors)+'. Additional arrangement idea: '+choose(constantGroove?STEADY_DETAILS:DETAILS),
    'Song structure: '+choose(constantGroove?STEADY_FORMS:FORMS)+'.',
    'Vocal direction: '+choose(VOCALS)+'.',
    'Dynamics: '+choose(constantGroove?STEADY_ENERGY:ENERGY)+'.',
    emphasis+' Use the principal bass idea from reference '+bass+' as an inspiration, never as a pasted stem.',
    MODE_DIRECTION[input.mode]||MODE_DIRECTION.balanced,
    focus+' '+human,
    master==='club'
      ? 'Mix and master for a powerful club sound: controlled low end, clean transients, spacious mids and no clipping.'
      : 'Mix and master for natural streaming sound: clear vocals, balanced frequency response, spacious dynamics and no clipping.',
    'Preserve meaningful elements of BOTH source identities. Generate a single original composition and an engaging final refrain.',
  ].join(' ').slice(0,5000);
}
