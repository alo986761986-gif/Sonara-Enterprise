export interface GenreFamilyDefinition {
  id: string;
  name: string;
  defaultBpm: number;
  bpmRange: [number, number];
  defaultTimeSignature: string;
  keySignature: string;
  acousticKeywords: string[];
  aliases: string[];
  subgenres: string[];
  overrides?: Record<string, { bpm?: number; timeSignature?: string }>;
}

export interface ResolvedGenreSelection {
  requestedGenre: string;
  matchedGenre: string | null;
  familyId: string;
  familyName: string;
  recommendedBpm: number;
  bpmRange: [number, number];
  timeSignature: string;
  keySignature: string;
  acousticKeywords: string[];
  isCatalogEntry: boolean;
}

export type HousePatternArchetype =
  | 'house'
  | 'deep house'
  | 'tech house'
  | 'afro house'
  | 'melodic house'
  | 'progressive house'
  | 'organic house';

export interface HouseStyleDefinition {
  name: string;
  aliases: string[];
  recommendedBpm: number;
  bpmRange: [number, number];
  keySignature: string;
  atmosphere: string;
  groove: string;
  bass: string;
  harmony: string;
  soundPalette: string;
  arrangement: string;
  vocalStyle: string;
  bannedKeywords: string[];
  patternArchetype: HousePatternArchetype;
}

const houseStyle = (
  name: string,
  recommendedBpm: number,
  bpmRange: [number, number],
  keySignature: string,
  atmosphere: string,
  groove: string,
  bass: string,
  harmony: string,
  soundPalette: string,
  arrangement: string,
  vocalStyle: string,
  patternArchetype: HousePatternArchetype,
  bannedKeywords: string[] = [],
  aliases: string[] = []
): HouseStyleDefinition => ({
  name,
  aliases,
  recommendedBpm,
  bpmRange,
  keySignature,
  atmosphere,
  groove,
  bass,
  harmony,
  soundPalette,
  arrangement,
  vocalStyle,
  patternArchetype,
  bannedKeywords: [
    'trap hi-hat rolls',
    'dubstep wobble drop',
    'heavy metal guitars',
    ...bannedKeywords
  ]
});

/**
 * Production-ready House identities. These are deliberately descriptive rather
 * than merely taxonomic: every entry controls the sonic mood, rhythm section,
 * harmony, arrangement and negative constraints sent to the audio model.
 */
export const HOUSE_STYLE_DEFINITIONS: HouseStyleDefinition[] = [
  houseStyle('House', 124, [120, 128], 'C Major',
    'energetic, welcoming, soulful and club-focused',
    'classic four-on-the-floor kick, offbeat open hats and a lightly swung sixteenth-note pocket',
    'round syncopated bassline locked tightly to the kick',
    'seventh chords, gospel-informed turnarounds and concise piano or organ stabs',
    '909 drums, sampled claps, M1-style piano, warm organ and short vocal cuts',
    'DJ-friendly intro, groove-led body, hook lift, breakdown and clean outro in complete phrases',
    'short soulful hooks or tasteful instrumental focus', 'house',
    ['techno rumble', 'festival supersaw overload'], ['Classic House', 'House Music']),

  houseStyle('Deep House', 122, [118, 124], 'E Minor',
    'warm, intimate, deep, nocturnal and relaxed',
    'soft four-on-the-floor kick, shuffled hats and understated percussion with generous breathing room',
    'enveloping sub bass with smooth syncopation and no aggressive mid-bass',
    'Rhodes ninth chords, jazz and soul voicings, mellow minor progressions',
    'atmospheric pads, electric piano, muted plucks, tape warmth and subtle field texture',
    'patient late-night evolution, restrained transitions and a flowing lounge-to-club arc',
    'breathy soulful phrases used sparingly and blended into the atmosphere', 'deep house',
    ['screeching lead', 'hardstyle kick', 'peak-time techno aggression']),

  houseStyle('Tech House', 126, [124, 128], 'A Minor',
    'minimal, hypnotic, cheeky and relentlessly dancefloor-focused',
    'tight punchy kick, rolling hats, crisp claps and syncopated micro-percussion with controlled swing',
    'bouncy short-decay bass groove built around negative space',
    'sparse one-chord tension, chromatic stabs and rhythmic rather than lyrical harmony',
    'dry drums, filtered percussion, short synth stabs, FX hits and compact vocal chops',
    'long mixable groove sections, eight-bar mutations, tension fills and efficient club drops',
    'minimal spoken or chopped hook, never a full pop chorus', 'tech house',
    ['euphoric trance breakdown', 'lush orchestral score', 'rock guitar solo'], ['Techno House']),

  houseStyle('Afro House', 120, [118, 123], 'D Minor',
    'earthy, spiritual, expansive, communal and hypnotic',
    'layered African polyrhythms, shakers, congas and hand drums around a grounded four-on-the-floor pulse',
    'deep warm bass with patient call-and-response movement',
    'modal minor harmony, chant-like motifs and emotionally suspended chords',
    'organic percussion, marimba or kalimba accents, airy pads, ceremonial textures and natural ambience',
    'gradual ritual build, percussion-led section changes and a powerful but spacious central release',
    'authentic call-and-response, chant or restrained soulful topline without caricature', 'afro house',
    ['industrial synth', 'hardstyle kick', 'big-room EDM drop']),

  houseStyle('Tribal House', 124, [122, 128], 'D Minor',
    'primal, percussive, physical and darkly celebratory',
    'dense interlocking toms, congas, bongos and shakers driving a strong club kick',
    'simple sub pulse that leaves maximum room for percussion',
    'minimal modal drones and short ritual stabs',
    'raw hand drums, whistles, wood hits, crowd energy and spacious delay throws',
    'extended percussion passages, layered entrances and drum-break tension releases',
    'short chants and rhythmic calls as percussion, not a pop lead', 'afro house',
    ['lush progressive supersaws', 'jazz lounge chords', 'metallic bass drop']),

  houseStyle('Melodic House', 124, [120, 126], 'F Minor',
    'emotional, cinematic, luminous and introspective',
    'steady clean four-on-the-floor groove with restrained hats and subtle syncopated percussion',
    'sidechained sub bass supporting the harmony without overpowering it',
    'memorable minor-key progression, suspended voicings and evolving melodic counterpoint',
    'analog plucks, expressive arpeggios, shimmering pads and wide atmospheric reverbs',
    'motif introduction, progressive layering, emotional breakdown and melodic peak with coherent reprise',
    'ethereal phrases or fully instrumental storytelling', 'melodic house',
    ['tech-house novelty vocal', 'raw industrial rumble', 'brostep drop']),

  houseStyle('Progressive House', 126, [122, 128], 'C Minor',
    'euphoric, expansive, uplifting and journey-like',
    'precise four-on-the-floor drive with gradually intensifying percussion and open hats',
    'rolling sidechained bassline that grows through automation',
    'long harmonic arcs, emotional chord lifts and clear tension-to-resolution movement',
    'layered arpeggios, evolving pads, risers, filtered synth stacks and controlled wide leads',
    'long build-ups, seamless eight- and sixteen-bar development, breakdown, crescendo and earned release',
    'anthemic but tasteful topline or instrumental melodic hook', 'progressive house',
    ['abrupt tech-house micro-drop', 'lo-fi drums', 'atonal industrial noise']),

  houseStyle('Organic House', 118, [114, 122], 'G Major',
    'natural, meditative, warm, worldly and gently adventurous',
    'soft kick with hand percussion, shakers and human timing rather than rigid quantization',
    'rounded analog or acoustic bass with flowing melodic motion',
    'open modal harmony, suspended chords and folk-informed melodic intervals',
    'woodwinds, plucked strings, hand drums, environmental textures and warm analog pads',
    'patient organic growth, instrumental conversation and smooth sunrise-style transitions',
    'wordless textures, intimate folk-inflected phrases or instrumental focus', 'organic house',
    ['harsh industrial acid', 'aggressive festival snare', 'synthetic brostep bass']),

  houseStyle('Acid House', 123, [120, 127], 'A Minor',
    'psychedelic, squelchy, hypnotic and underground',
    'raw 808/909 four-on-the-floor groove with claps, cowbell accents and persistent hats',
    'resonant TB-303 bass sequence with evolving cutoff, resonance and slides',
    'minimal repetitive harmony that prioritizes acid modulation',
    'authentic TB-303 squelch, analog drum machines, warehouse reverb and dubby delay',
    'gradual filter automation, acid peaks, drum dropouts and extended hypnotic phrases',
    'short surreal spoken samples or no lead vocal', 'house',
    ['supersaw festival chorus', 'acoustic ballad', 'clean pop bass']),

  houseStyle('Chicago House', 123, [118, 126], 'A Minor',
    'raw, soulful, jacking and warehouse-born',
    'machine-tight 808/909 kick and clap with shuffled hats and unmistakable jack rhythm',
    'rubbery sequenced bass or sampled disco bass riff',
    'gospel piano, organ sevenths and bluesy chord stabs',
    'vintage drum machines, sampler grit, piano, organ, strings and analog acid touches',
    'simple effective loop construction, live-feeling mutes and classic DJ-friendly transitions',
    'passionate gospel or spoken warehouse hook with raw character', 'house',
    ['modern big-room supersaw', 'polished EDM riser stack']),

  houseStyle('Soulful House', 122, [118, 124], 'Eb Major',
    'warm, uplifting, human, spiritual and emotionally generous',
    'smooth four-on-the-floor pocket with live-feeling percussion and gentle swing',
    'melodic electric or synth bass played with a deep soul pocket',
    'gospel seventh, ninth and thirteenth chords with expressive voice leading',
    'Rhodes, Hammond organ, piano, live brass or strings and tasteful disco percussion',
    'song-led verse and chorus development while retaining extended club phrasing',
    'full expressive soul or gospel vocal with space for ad-libs', 'deep house',
    ['minimal spoken tech-house hook', 'industrial darkness', 'hard distorted kick']),

  houseStyle('Funky House', 125, [122, 128], 'G Minor',
    'playful, bright, glamorous and irresistibly danceable',
    'syncopated disco-house drums, lively hats, claps and percussion fills',
    'slapped, plucked or sampled funk bassline with strong rhythmic hooks',
    'disco sevenths, chromatic passing chords and upbeat horn-like stabs',
    'wah guitar, brass hits, clavinet, filtered loops and celebratory vocal cuts',
    'hook-first club arrangement with breakdown edits, filter sweeps and energetic returns',
    'joyful soul phrases, call-and-response and tasteful chopped vocals', 'house',
    ['dark techno rumble', 'melancholic ambient drift']),

  houseStyle('Disco House', 124, [120, 128], 'A Major',
    'nostalgic, festive, radiant and glamorous',
    'four-on-the-floor disco pulse with open hats, handclaps and tambourine lift',
    'live-feeling octave bass or tightly filtered disco sample bass',
    'major seventh disco changes, string lifts and soulful cadences',
    'orchestral strings, rhythm guitar, brass, electric piano and filtered disco samples',
    'DJ-friendly filtered intro, verse-like groove, euphoric string lift and celebratory peak',
    'soulful disco chorus, falsetto accents or chopped sample hook', 'house',
    ['industrial percussion', 'acid-only arrangement', 'aggressive metallic bass'], ['Disco / Funky House']),

  houseStyle('French House', 124, [120, 128], 'F Minor',
    'stylish, compressed, nostalgic and euphorically funky',
    'punchy four-on-the-floor drums with pumping sidechain and crisp disco hats',
    'filtered disco bass loop with assertive compression movement',
    'sampled funk and disco harmony shaped through filter automation',
    'low-pass filtered samples, phaser, talkbox-like textures, drum-machine punch and vinyl character',
    'filter-open progression, loop recombination, breakdown mute and high-impact return',
    'heavily processed micro-vocal or vocoder phrase', 'house',
    ['dry minimalism', 'orchestral cinematic build'], ['Filter House']),

  houseStyle('Jackin House', 126, [123, 129], 'A Minor',
    'raw, funky, kinetic and basement-club playful',
    'hard-swinging jacking drums, shuffled hats, punchy claps and syncopated sample hits',
    'rubbery funk bass riff with lively offbeat accents',
    'short blues, funk and disco sample stabs rather than long progressions',
    'chopped funk loops, vocal grunts, gritty drum machines and turntable-style edits',
    'relentless groove, rapid mutes, fills and sample variations in DJ-ready blocks',
    'rhythmic shouts and one-shot phrases', 'tech house',
    ['lush ambient pads', 'long trance breakdown']),

  houseStyle('Electro House', 128, [126, 132], 'F Minor',
    'electric, bold, high-impact and festival-charged',
    'hard punchy four-on-the-floor kick, bright claps and driving offbeat hats',
    'distorted saw or square-wave mid-bass layered over a controlled sub',
    'simple minor progressions and tension stabs built to support the drop',
    'aggressive electro bass, sharp leads, digital FX and tightly gated synths',
    'compact builds, tension stop, forceful drop and clear second-drop development',
    'short commanding hook or processed chant', 'progressive house',
    ['deep lounge restraint', 'acoustic folk instrumentation']),

  houseStyle('Future House', 126, [124, 128], 'F Minor',
    'bouncy, glossy, futuristic and uplifting',
    'clean punchy kick, shuffled top loop and bright clap with elastic syncopation',
    'rubbery pitch-bending bass chords with a clean sub foundation',
    'catchy minor-to-major pop-aware chord movement',
    'metallic bass plucks, detuned chord stabs, vocal chops and polished transition FX',
    'short hook setup, filtered pre-drop, elastic bass drop and melodic variation',
    'polished chopped vocal motif or concise topline', 'tech house',
    ['raw warehouse acid', 'tribal drum dominance']),

  houseStyle('Bass House', 126, [124, 130], 'F Minor',
    'dark, swaggering, heavy and confrontational',
    'solid house kick, clipped snare, tense hats and syncopated pre-drop percussion',
    'gritty modulated mid-bass call-and-response above a mono sub',
    'minimal minor tension and chromatic bass movement',
    'distorted bass growls, FM stabs, siren FX and sharply edited silence',
    'direct build, bass-led drop, switch-up fills and a heavier second variation',
    'short spoken command or chopped rap-like texture used rhythmically', 'tech house',
    ['warm jazz lounge harmony', 'gentle tropical marimba']),

  houseStyle('G-House', 124, [122, 126], 'F Minor',
    'dark, low-slung, urban and confident',
    'stripped house drums with swung hats, tight claps and a deliberate head-nod pocket',
    'deep distorted or Reese-like bass riff with restrained movement',
    'sparse minor-key stabs and blues-inflected tension',
    'gritty bass, filtered synth brass, vinyl texture and minimal streetwise vocal cuts',
    'slow-burn intro, bass-hook drop and uncluttered groove variations',
    'low-register spoken or chopped hip-hop phrase as texture, never a genre switch', 'deep house',
    ['bright tropical instruments', 'euphoric trance supersaw'], ['Gangsta House']),

  houseStyle('Slap House', 124, [122, 126], 'F Minor',
    'darkly catchy, polished, compact and radio-club accessible',
    'tight four-on-the-floor drums with concise builds and clean top-end',
    'short plucky slap bass with octave movement and strong sidechain',
    'minor-key pop chords designed around an immediate hook',
    'muted bass pluck, atmospheric pad, risers and clean vocal processing',
    'fast verse-to-build motion, recognizable hook drop and concise reprise',
    'clear pop topline or memorable processed vocal phrase', 'deep house',
    ['raw acid jam', 'long progressive build', 'dense tribal percussion']),

  houseStyle('Big Room House', 128, [126, 130], 'F Minor',
    'monumental, euphoric, direct and mainstage-ready',
    'huge clean kick, wide clap, snare build and simple crowd-readable rhythm',
    'powerful offbeat sub or sustained drop bass with strict mono control',
    'anthemic minor-key progression and tension-focused pre-drop harmony',
    'supersaw lead, brass-like stab, festival risers, impacts and wide noise layers',
    'immediate theme, escalating build, one-beat silence, massive drop and second-drop variation',
    'short chant or anthem phrase designed for crowd response', 'progressive house',
    ['microhouse subtlety', 'lounge jazz intimacy']),

  houseStyle('Tropical House', 112, [100, 116], 'D Major',
    'sunlit, relaxed, summery and gently romantic',
    'soft four-on-the-floor or lightly syncopated kick with snaps, shakers and airy percussion',
    'warm rounded bass with simple melodic movement',
    'bright major-key pop harmony and open suspended chords',
    'marimba, steel drum, soft pluck, saxophone or flute accents and ocean-air ambience',
    'easy verse-like flow, breezy lift and restrained melodic drop suitable for sunset listening',
    'intimate clean vocal or wordless summer hook', 'organic house',
    ['aggressive metallic bass', 'warehouse darkness', 'hard distorted kick']),

  houseStyle('Balearic House', 116, [108, 122], 'A Major',
    'dreamy, coastal, spacious and sunset-euphoric',
    'unhurried house pulse with soft congas, shakers and gently open hats',
    'smooth melodic bass that drifts beneath the harmony',
    'open major-seventh chords, suspended movement and Mediterranean warmth',
    'acoustic guitar touches, airy pads, soft piano, saxophone or flute and wave-like ambience',
    'long horizon-building intro, gradual emotional bloom and relaxed afterglow outro',
    'ethereal phrase, soft soul vocal or instrumental focus', 'organic house',
    ['hard festival drop', 'industrial rumble', 'abrasive acid resonance'], ['Ibiza Chill House']),

  houseStyle('Ibiza House', 124, [120, 126], 'A Minor',
    'sunset-to-club, glamorous, uplifting and spacious',
    'polished four-on-the-floor groove with Latin-tinged percussion and open-hat lift',
    'warm club bass balancing smoothness and drive',
    'emotional piano or string progression with a memorable summer cadence',
    'piano, airy pads, tasteful saxophone, percussion and bright club FX',
    'sunset intro, vocal or piano lift, energetic club peak and elegant mixable outro',
    'soulful summer anthem vocal or melodic instrumental hook', 'progressive house',
    ['industrial harshness', 'minimal micro-click abstraction']),

  houseStyle('Latin House', 125, [122, 128], 'A Minor',
    'fiery, festive, sensual and percussion-driven',
    'four-on-the-floor kick interlocked with clave-aware congas, timbales, cowbells and shakers',
    'syncopated dance bass with salsa or funk inflection',
    'minor-to-dominant Latin cadences, piano montuno fragments and brass punctuation',
    'congas, timbales, brass, piano, guitar and lively crowd-ready percussion',
    'percussion introduction, groove call-and-response, brass lift and energetic central release',
    'Spanish or Portuguese phrases, chants or instrumental call-and-response used authentically', 'afro house',
    ['cold industrial ambience', 'trance supersaw wall']),

  houseStyle('Minimal House', 124, [120, 126], 'A Minor',
    'subtle, spacious, hypnotic and meticulously controlled',
    'lean kick, micro-shuffled hats and sparse percussive events with deliberate silence',
    'compact sub motif with tiny timbral changes over long phrases',
    'one-chord ambiguity, restrained chromatic tones and minimal harmonic motion',
    'dry clicks, soft bleeps, microscopic foley, short delays and carefully shaped transients',
    'incremental eight-bar mutations, subtraction-based transitions and no oversized drop',
    'tiny chopped syllables or purely instrumental texture', 'tech house',
    ['festival build', 'full gospel choir', 'dense orchestral layers']),

  houseStyle('Microhouse', 122, [118, 125], 'D Minor',
    'intimate, abstract, playful and late-night cerebral',
    'micro-edited four-on-the-floor pulse with clicks, glitches and softly shuffled fragments',
    'small rounded sub gestures and sampled bass particles',
    'fragmented jazz or soul micro-samples with unresolved harmonic color',
    'microscopic edits, vinyl dust, found sound, muted chords and short granular delays',
    'slow recombination of tiny motifs, subtle dropouts and seamless after-hours flow',
    'heavily fragmented syllables treated as sound design', 'deep house',
    ['big-room drop', 'aggressive saw lead', 'anthemic pop chorus']),

  houseStyle('Garage House', 126, [122, 130], 'G Minor',
    'soulful, swinging, raw and uplifting',
    'four-on-the-floor kick with strongly shuffled hats, punchy claps and gospel-derived rhythmic lift',
    'lively organ or synth bass with syncopated walking movement',
    'gospel piano, organ sevenths and expressive soulful cadences',
    'M1 piano, organ, sampled claps, string accents and raw club-room ambience',
    'vocal-led development, piano breakdown and energetic groove return',
    'powerful diva or gospel-inspired performance with call-and-response', 'deep house',
    ['two-step UK garage beat', 'industrial techno rumble']),

  houseStyle('Piano House', 124, [120, 128], 'C Major',
    'joyful, anthemic, uplifting and instantly human',
    'classic four-on-the-floor groove with bright claps, open hats and supportive percussion',
    'simple warm bassline that leaves room for the piano hook',
    'prominent major or gospel piano progression with memorable inversions',
    'acoustic or M1-style piano, organ support, string lift and clean house drums',
    'piano-hook opening, vocal or instrumental verse, breakdown reprise and triumphant return',
    'uplifting soulful chorus, crowd hook or instrumental piano lead', 'house',
    ['dark industrial drone', 'atonal bass growl']),

  houseStyle('Vocal House', 124, [120, 128], 'C Minor',
    'emotional, polished, accessible and club-ready',
    'clean four-on-the-floor rhythm with dynamics that support verses and choruses',
    'warm supportive bass with hook-aware movement',
    'song-forward chord progression with clear emotional resolution',
    'piano, pads, restrained plucks and production space centered around the lead voice',
    'intro, verse, pre-chorus, club chorus or drop, breakdown and final chorus in extended phrases',
    'full intelligible lead performance with harmonies, ad-libs and controlled ambience', 'house',
    ['instrumental-only acid jam', 'spoken tech-house loop only']),

  houseStyle('Hard House', 142, [135, 150], 'F Minor',
    'urgent, rave-driven, tough and exuberant',
    'fast pounding kick, sharp claps, rolling hats and energetic offbeat percussion',
    'hard offbeat bass or hoover-supported low end with disciplined sub control',
    'simple rave chord movement and tension stabs',
    'hoover synth, rave stab, reverse bass accents, snare rolls and bright FX',
    'rapid build, rave breakdown, forceful drop and high-energy variations',
    'shouted rave phrase or high-impact chopped hook', 'progressive house',
    ['deep lounge softness', 'acoustic singer-songwriter feel']),

  houseStyle('Lo-Fi House', 119, [114, 123], 'D Minor',
    'dusty, nostalgic, hazy and introspective',
    'soft saturated kick, loose hats and slightly imperfect shuffled percussion',
    'warm muffled bass with gentle sidechain breathing',
    'simple wistful seventh chords and detuned sample harmony',
    'tape hiss, vinyl noise, filtered chords, cassette wobble and muted drum samples',
    'loop-led development with subtle filter openings and understated transitions',
    'distant chopped memory-like vocal or instrumental focus', 'deep house',
    ['pristine festival polish', 'aggressive metallic drop'], ['Lofi House']),

  houseStyle('Outsider House', 118, [112, 124], 'A Minor',
    'raw, eccentric, imperfect and emotionally off-center',
    'distorted house pulse with loose timing, unusual percussion and deliberate rough edges',
    'overdriven or unstable bass loop with handmade character',
    'warped chords, detuned samples and unresolved nostalgic harmony',
    'cheap drum machines, cassette saturation, found sound and unstable analog texture',
    'anti-polished loop evolution, surprising dropouts and unconventional transitions',
    'obscured sample fragments or no conventional lead', 'deep house',
    ['radio-pop sheen', 'perfectly clean EDM master']),

  houseStyle('Ambient House', 116, [108, 122], 'D Major',
    'weightless, spacious, contemplative and gently propulsive',
    'soft house pulse partially submerged beneath evolving ambience and sparse percussion',
    'long rounded sub tones with minimal rhythmic intrusion',
    'slow suspended harmony, modal drift and unresolved luminous voicings',
    'evolving pads, environmental recordings, dub delay, soft piano and distant synthetic color',
    'long-form atmospheric evolution with subtle rhythmic entrances and exits instead of drops',
    'wordless vapor, distant phrase or instrumental soundscape', 'organic house',
    ['hard club drop', 'dense vocal chorus', 'abrasive distortion']),

  houseStyle('Dream House', 120, [116, 124], 'F Major',
    'dreamy, romantic, nostalgic and softly euphoric',
    'gentle four-on-the-floor kick with airy hats and lightly shuffled percussion',
    'smooth melodic bass with a soft-focus attack',
    'lush major-seventh and suspended chords with bittersweet resolution',
    'glassy piano, chorus-soaked pads, bell-like plucks and long diffused reverb',
    'gradual dream-state layering, melodic bloom and floating breakdown',
    'ethereal intimate vocal or wordless hook', 'melodic house',
    ['industrial percussion', 'aggressive bass growl']),

  houseStyle('Italo House', 122, [118, 126], 'C Major',
    'romantic, bright, nostalgic and piano-led',
    'classic machine house groove with claps, open hats and buoyant percussion',
    'melodic synth bass with energetic octave movement',
    'emotive piano chords, major-key lifts and Mediterranean pop sensibility',
    'bright piano, strings, analog pads, sampled vocal exclamations and vintage drum machines',
    'piano theme, sung or instrumental lift, euphoric breakdown and final reprise',
    'expressive diva phrase, Italian-inflected sample or instrumental piano focus', 'house',
    ['dark industrial rumble', 'minimal microhouse abstraction'])
];

export function resolveHouseStyleProfile(value: string): HouseStyleDefinition | null {
  const normalized = normalizeGenreName(value);
  if (!normalized) return null;
  return HOUSE_STYLE_DEFINITIONS.find(profile =>
    [profile.name, ...profile.aliases]
      .some(candidate => normalizeGenreName(candidate) === normalized)
  ) || null;
}

export function houseStylePromptKeywords(profile: HouseStyleDefinition): string[] {
  return [
    `ATMOSPHERE: ${profile.atmosphere}`,
    `GROOVE: ${profile.groove}`,
    `BASS_IDENTITY: ${profile.bass}`,
    `HARMONIC_LANGUAGE: ${profile.harmony}`,
    `SIGNATURE_PALETTE: ${profile.soundPalette}`,
    `ARRANGEMENT_ARC: ${profile.arrangement}`,
    `VOCAL_DIRECTION: ${profile.vocalStyle}`
  ];
}

export const GENRE_FAMILIES: GenreFamilyDefinition[] = [
  {
    id: 'house', name: 'House', defaultBpm: 124, bpmRange: [115, 132], defaultTimeSignature: '4/4', keySignature: 'A Minor',
    acousticKeywords: ['four-on-the-floor kick', 'syncopated bassline', 'offbeat open hats', 'club-focused groove'],
    aliases: ['house music'],
    subgenres: HOUSE_STYLE_DEFINITIONS.map(profile => profile.name)
  },
  {
    id: 'techno', name: 'Techno', defaultBpm: 132, bpmRange: [120, 155], defaultTimeSignature: '4/4', keySignature: 'F# Minor',
    acousticKeywords: ['driving repetitive pulse', 'machine percussion', 'hypnotic synthesis', 'controlled low-frequency rumble'],
    aliases: ['techno music'],
    subgenres: ['Techno', 'Detroit Techno', 'Minimal Techno', 'Dub Techno', 'Acid Techno', 'Industrial Techno', 'Peak Time Techno', 'Hypnotic Techno', 'Hardgroove', 'Schranz', 'Melodic Techno', 'Ambient Techno', 'Electro Techno', 'Ghettotech']
  },
  {
    id: 'trance', name: 'Trance', defaultBpm: 136, bpmRange: [125, 150], defaultTimeSignature: '4/4', keySignature: 'G Minor',
    acousticKeywords: ['rolling bass sequence', 'euphoric harmonic movement', 'long tension builds', 'wide sustained synth layers'],
    aliases: [],
    subgenres: ['Trance', 'Uplifting Trance', 'Progressive Trance', 'Psytrance', 'Goa Trance', 'Tech Trance', 'Vocal Trance', 'Hard Trance', 'Acid Trance', 'Balearic Trance', 'Dream Trance']
  },
  {
    id: 'bass_breaks', name: 'Bass & Breaks', defaultBpm: 140, bpmRange: [70, 180], defaultTimeSignature: '4/4', keySignature: 'F Minor',
    acousticKeywords: ['syncopated breakbeats', 'sub-heavy bass design', 'sharp transient drums', 'rhythmic edits'],
    aliases: ['bass music', 'breaks'],
    subgenres: ['Drum & Bass', 'Liquid Drum & Bass', 'Neurofunk', 'Jungle', 'Jump Up', 'Dancefloor Drum & Bass', 'Breakbeat', 'Big Beat', 'UK Breaks', 'Dubstep', 'Brostep', 'Riddim', 'Future Bass', 'EDM Trap', 'Bass Music', 'Glitch Hop', 'Leftfield Bass', 'Breakcore'],
    overrides: { 'Drum & Bass': { bpm: 174 }, 'Liquid Drum & Bass': { bpm: 174 }, Neurofunk: { bpm: 174 }, Jungle: { bpm: 170 }, Dubstep: { bpm: 140 }, Riddim: { bpm: 140 } }
  },
  {
    id: 'garage', name: 'UK Garage', defaultBpm: 132, bpmRange: [125, 142], defaultTimeSignature: '4/4', keySignature: 'D Minor',
    acousticKeywords: ['shuffled two-step drums', 'syncopated sub bass', 'chopped vocal texture', 'swinging percussion'],
    aliases: ['garage', 'ukg'],
    subgenres: ['UK Garage', '2-Step Garage', 'Speed Garage', 'Bassline', 'Grime', 'Future Garage', 'UK Funky', 'Breakstep']
  },
  {
    id: 'hard_dance', name: 'Hard Dance', defaultBpm: 155, bpmRange: [140, 220], defaultTimeSignature: '4/4', keySignature: 'F Minor',
    acousticKeywords: ['distorted high-energy kick', 'fast rave percussion', 'aggressive synth stabs', 'large tension releases'],
    aliases: ['hardcore dance'],
    subgenres: ['Hardcore', 'Gabber', 'Hardstyle', 'Rawstyle', 'Happy Hardcore', 'Frenchcore', 'Uptempo Hardcore', 'Speedcore', 'Makina']
  },
  {
    id: 'electronic', name: 'Electronic', defaultBpm: 120, bpmRange: [60, 160], defaultTimeSignature: '4/4', keySignature: 'D Minor',
    acousticKeywords: ['electronic sound design', 'layered synthesis', 'precise spatial production', 'genre-authentic programmed rhythm'],
    aliases: ['electronica', 'electronic music'],
    subgenres: ['Electronic', 'Electronica', 'IDM', 'Ambient', 'Downtempo', 'Chillout', 'Trip Hop', 'Synthwave', 'Vaporwave', 'Chillwave', 'Retrowave', 'Electro', 'EBM', 'Industrial', 'Noise', 'Glitch', 'Experimental Electronic', 'New Age', 'Drone']
  },
  {
    id: 'pop', name: 'Pop', defaultBpm: 116, bpmRange: [75, 140], defaultTimeSignature: '4/4', keySignature: 'C Major',
    acousticKeywords: ['immediate melodic hook', 'clear verse-chorus form', 'polished vocal space', 'radio-ready rhythm section'],
    aliases: ['popular music'],
    subgenres: ['Pop', 'Dance Pop', 'Electropop', 'Synthpop', 'Indie Pop', 'Dream Pop', 'Art Pop', 'Hyperpop', 'K-Pop', 'J-Pop', 'Latin Pop', 'Teen Pop', 'Power Pop', 'Pop Rock', 'Pop EDM']
  },
  {
    id: 'hip_hop', name: 'Hip Hop', defaultBpm: 92, bpmRange: [60, 160], defaultTimeSignature: '4/4', keySignature: 'C Minor',
    acousticKeywords: ['sample-aware drum pocket', 'strong kick and snare relationship', 'supportive sub bass', 'space for rhythmic vocal phrasing'],
    aliases: ['hip-hop', 'rap music'],
    subgenres: ['Hip Hop', 'Boom Bap', 'Trap', 'Drill', 'UK Drill', 'Cloud Rap', 'Lo-fi Hip Hop', 'Jazz Rap', 'Conscious Hip Hop', 'Gangsta Rap', 'G-Funk', 'Crunk', 'Phonk', 'Memphis Rap', 'Alternative Hip Hop', 'Afro Trap']
  },
  {
    id: 'rnb_soul_funk', name: 'R&B, Soul & Funk', defaultBpm: 98, bpmRange: [60, 130], defaultTimeSignature: '4/4', keySignature: 'Eb Major',
    acousticKeywords: ['expressive harmonic voicings', 'deep pocket rhythm section', 'melodic bass movement', 'warm human dynamics'],
    aliases: ['r&b', 'rhythm and blues'],
    subgenres: ['R&B', 'Contemporary R&B', 'Alternative R&B', 'Neo Soul', 'Soul', 'Motown', 'Funk', 'P-Funk', 'Disco', 'Nu Disco', 'Boogie', 'Quiet Storm', 'Gospel', 'New Jack Swing']
  },
  {
    id: 'rock', name: 'Rock', defaultBpm: 120, bpmRange: [70, 180], defaultTimeSignature: '4/4', keySignature: 'E Minor',
    acousticKeywords: ['live drum kit articulation', 'electric guitar interplay', 'human bass performance', 'dynamic band arrangement'],
    aliases: ['rock music'],
    subgenres: ['Rock', 'Rock and Roll', 'Classic Rock', 'Alternative Rock', 'Indie Rock', 'Psychedelic Rock', 'Progressive Rock', 'Hard Rock', 'Garage Rock', 'Surf Rock', 'Glam Rock', 'Southern Rock', 'Post-Rock', 'Shoegaze', 'Grunge', 'Britpop']
  },
  {
    id: 'metal', name: 'Metal', defaultBpm: 135, bpmRange: [60, 220], defaultTimeSignature: '4/4', keySignature: 'E Minor',
    acousticKeywords: ['heavy guitar articulation', 'powerful acoustic drum transients', 'tight low-register riffing', 'controlled aggressive dynamics'],
    aliases: ['heavy metal'],
    subgenres: ['Heavy Metal', 'Thrash Metal', 'Death Metal', 'Black Metal', 'Doom Metal', 'Power Metal', 'Progressive Metal', 'Symphonic Metal', 'Metalcore', 'Deathcore', 'Nu Metal', 'Folk Metal', 'Industrial Metal', 'Sludge Metal', 'Stoner Metal', 'Glam Metal']
  },
  {
    id: 'punk', name: 'Punk', defaultBpm: 165, bpmRange: [110, 220], defaultTimeSignature: '4/4', keySignature: 'A Minor',
    acousticKeywords: ['urgent live drums', 'direct distorted guitars', 'raw ensemble energy', 'concise song form'],
    aliases: ['punk music'],
    subgenres: ['Punk Rock', 'Hardcore Punk', 'Pop Punk', 'Post-Punk', 'Ska Punk', 'Emo', 'Screamo', 'Crust Punk', 'Oi!', 'Riot Grrrl', 'Post-Hardcore']
  },
  {
    id: 'jazz_blues', name: 'Jazz & Blues', defaultBpm: 110, bpmRange: [50, 220], defaultTimeSignature: '4/4', keySignature: 'Bb Major',
    acousticKeywords: ['human swing and phrasing', 'extended harmonic language', 'interactive rhythm section', 'natural instrumental dynamics'],
    aliases: ['jazz', 'blues'],
    subgenres: ['Jazz', 'Bebop', 'Cool Jazz', 'Hard Bop', 'Modal Jazz', 'Free Jazz', 'Jazz Fusion', 'Smooth Jazz', 'Swing', 'Big Band', 'Dixieland', 'Latin Jazz', 'Acid Jazz', 'Blues', 'Delta Blues', 'Chicago Blues', 'Electric Blues', 'Rhythm and Blues'],
    overrides: { Waltz: { timeSignature: '3/4' } }
  },
  {
    id: 'classical_cinematic', name: 'Classical & Cinematic', defaultBpm: 100, bpmRange: [40, 180], defaultTimeSignature: '4/4', keySignature: 'D Minor',
    acousticKeywords: ['acoustic orchestral depth', 'developed thematic motion', 'natural concert dynamics', 'detailed instrumental voicing'],
    aliases: ['classical', 'cinematic'],
    subgenres: ['Classical', 'Baroque', 'Romantic', 'Contemporary Classical', 'Minimalism', 'Opera', 'Chamber Music', 'Symphony', 'Orchestral', 'Choral', 'Film Score', 'Soundtrack', 'Trailer Music', 'Epic Music', 'Waltz', 'Viennese Waltz', 'Neoclassical'],
    overrides: { Waltz: { timeSignature: '3/4', bpm: 90 }, 'Viennese Waltz': { timeSignature: '3/4', bpm: 174 } }
  },
  {
    id: 'folk_country', name: 'Folk & Country', defaultBpm: 105, bpmRange: [60, 170], defaultTimeSignature: '4/4', keySignature: 'G Major',
    acousticKeywords: ['natural acoustic instrumentation', 'story-led melodic form', 'human timing', 'organic ensemble balance'],
    aliases: ['folk', 'country'],
    subgenres: ['Folk', 'Indie Folk', 'Contemporary Folk', 'Traditional Folk', 'Celtic Folk', 'Bluegrass', 'Country', 'Americana', 'Country Pop', 'Outlaw Country', 'Alternative Country', 'Western', 'Singer-Songwriter']
  },
  {
    id: 'reggae', name: 'Reggae & Caribbean', defaultBpm: 82, bpmRange: [65, 125], defaultTimeSignature: '4/4', keySignature: 'G Major',
    acousticKeywords: ['offbeat skank rhythm', 'deep rounded bass', 'spacious dub-aware production', 'relaxed pocket'],
    aliases: ['caribbean music'],
    subgenres: ['Reggae', 'Roots Reggae', 'Dub', 'Dancehall', 'Ska', 'Rocksteady', 'Lovers Rock', 'Ragga', 'Calypso', 'Soca']
  },
  {
    id: 'latin', name: 'Latin', defaultBpm: 104, bpmRange: [70, 180], defaultTimeSignature: '4/4', keySignature: 'A Minor',
    acousticKeywords: ['clave-aware percussion', 'interlocking rhythmic instruments', 'expressive melodic phrasing', 'dance-focused low end'],
    aliases: ['latin music'],
    subgenres: ['Reggaeton', 'Dembow', 'Salsa', 'Bachata', 'Merengue', 'Cumbia', 'Bossa Nova', 'Samba', 'Tango', 'Mambo', 'Bolero', 'Rumba', 'Flamenco', 'Mariachi', 'Regional Mexican', 'Latin Jazz', 'Latin Pop']
  },
  {
    id: 'african', name: 'African', defaultBpm: 116, bpmRange: [75, 135], defaultTimeSignature: '4/4', keySignature: 'D Minor',
    acousticKeywords: ['interlocking polyrhythm', 'organic percussion layers', 'call-and-response phrasing', 'deep dance-oriented bass'],
    aliases: ['african music'],
    subgenres: ['Afrobeats', 'Afrobeat', 'Amapiano', 'Highlife', 'Kwaito', 'Gqom', 'Soukous', 'Makossa', 'Coupé-Décalé', 'Gnawa', 'Rai', 'Mbalax', 'Bongo Flava']
  },
  {
    id: 'global', name: 'Global & Traditional', defaultBpm: 110, bpmRange: [40, 200], defaultTimeSignature: '4/4', keySignature: 'D Minor',
    acousticKeywords: ['culture-specific instrumentation', 'authentic regional rhythm', 'traditional melodic language', 'natural ensemble space'],
    aliases: ['world music', 'traditional music'],
    subgenres: ['World Music', 'Middle Eastern', 'Arabic Music', 'Indian Classical', 'Carnatic', 'Bollywood', 'Bhangra', 'Qawwali', 'Japanese Traditional', 'Chinese Traditional', 'Klezmer', 'Balkan Music', 'Polka', 'Fado', 'Celtic Music']
  }
];

export const GENRE_CATALOG_NAMES = Array.from(new Set(
  GENRE_FAMILIES.flatMap(family => [family.name, ...family.aliases, ...family.subgenres])
));

export function normalizeGenreName(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveGenreSelection(value: string): ResolvedGenreSelection {
  const requestedGenre = String(value || '').trim() || 'Custom Genre';
  const normalized = normalizeGenreName(requestedGenre);

  let matchedFamily: GenreFamilyDefinition | null = null;
  let matchedGenre: string | null = null;

  const directHouseStyle = resolveHouseStyleProfile(requestedGenre);
  if (directHouseStyle) {
    matchedFamily = GENRE_FAMILIES.find(family => family.id === 'house') || null;
    matchedGenre = directHouseStyle.name;
  }

  if (!matchedFamily) {
    for (const family of GENRE_FAMILIES) {
      const exactCandidate = [family.name, ...family.aliases, ...family.subgenres]
        .find(candidate => normalizeGenreName(candidate) === normalized);
      if (exactCandidate) {
        matchedFamily = family;
        matchedGenre = family.subgenres.find(
          candidate => normalizeGenreName(candidate) === normalized
        ) || exactCandidate;
        break;
      }
    }
  }

  if (!matchedFamily) {
    const candidates = GENRE_FAMILIES.flatMap(family =>
      [family.name, ...family.aliases, ...family.subgenres]
        .filter(candidate => normalizeGenreName(candidate).length >= 3)
        .map(candidate => ({ family, candidate, normalized: normalizeGenreName(candidate) }))
    ).sort((left, right) => right.normalized.length - left.normalized.length);
    const partial = candidates.find(candidate => normalized.includes(candidate.normalized));
    if (partial) {
      matchedFamily = partial.family;
      matchedGenre = partial.candidate;
    }
  }

  if (!matchedFamily) {
    return {
      requestedGenre,
      matchedGenre: null,
      familyId: 'custom',
      familyName: 'Custom / User Defined',
      recommendedBpm: 120,
      bpmRange: [40, 240],
      timeSignature: '4/4',
      keySignature: 'D Minor',
      acousticKeywords: [
        `authentic ${requestedGenre} instrumentation`,
        `genre-correct ${requestedGenre} rhythm`,
        `genre-correct ${requestedGenre} harmony`,
        'preserve the exact user-defined style without substitution'
      ],
      isCatalogEntry: false
    };
  }

  const override = matchedGenre
    ? matchedFamily.overrides?.[matchedGenre]
    : undefined;
  const houseProfile = matchedFamily.id === 'house'
    ? resolveHouseStyleProfile(matchedGenre || requestedGenre)
    : null;

  return {
    requestedGenre,
    matchedGenre,
    familyId: matchedFamily.id,
    familyName: matchedFamily.name,
    recommendedBpm: houseProfile?.recommendedBpm || override?.bpm || matchedFamily.defaultBpm,
    bpmRange: houseProfile?.bpmRange || matchedFamily.bpmRange,
    timeSignature: override?.timeSignature || matchedFamily.defaultTimeSignature,
    keySignature: houseProfile?.keySignature || matchedFamily.keySignature,
    acousticKeywords: houseProfile
      ? [
          `authentic ${houseProfile.name} style`,
          ...houseStylePromptKeywords(houseProfile)
        ]
      : [
          `authentic ${requestedGenre} style`,
          ...matchedFamily.acousticKeywords
        ],
    isCatalogEntry: Boolean(
      houseProfile || (matchedGenre && normalizeGenreName(matchedGenre) === normalized)
    )
  };
}
