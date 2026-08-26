import type { VocalMode } from './generationPrompt';

export interface ElectronicLyricsInput {
  language: string;
  genre: string;
  subgenre: string;
  mood: string;
  vocalMode: VocalMode;
  variant: number;
  durationSec?: number;
}

type Delivery = 'anthemic' | 'rolling' | 'bass' | 'swing' | 'broken' | 'hard' | 'machine' | 'ambient' | 'experimental' | 'retro';

type GenreProfile = {
  delivery: Delivery;
  it: [string, string, string, string];
  en: [string, string, string, string];
};

type Trait = { it: string; en: string };

const GENRE_PROFILES: Record<string, GenreProfile> = {
  trance: {
    delivery: 'anthemic',
    it: ['orizzonti di luce', 'melodie che salgono', 'un viaggio oltre la notte', 'il momento della liberazione'],
    en: ['horizons of light', 'melodies rising', 'a journey beyond the night', 'the moment of release']
  },
  'drum bass': {
    delivery: 'rolling',
    it: ['breakbeat che corre', 'basso profondo in movimento', 'la città ad alta velocità', 'energia tra tensione e fluidità'],
    en: ['breakbeats running fast', 'deep bass in motion', 'the city at high speed', 'energy between tension and flow']
  },
  dubstep: {
    delivery: 'bass',
    it: ['sub-bass nel buio', 'spazio tra colpi spezzati', 'pressione che piega la stanza', 'il vuoto prima dell’impatto'],
    en: ['sub bass in the dark', 'space between broken hits', 'pressure bending the room', 'the void before impact']
  },
  'uk garage': {
    delivery: 'swing',
    it: ['swing irregolare sotto i piedi', 'voci tagliate nella notte', 'basso elastico e urbano', 'una corsa tra pioggia e neon'],
    en: ['uneven swing beneath our feet', 'chopped voices in the night', 'elastic urban bass', 'a run through rain and neon']
  },
  breakbeat: {
    delivery: 'broken',
    it: ['batterie spezzate in avanti', 'basso che risponde ai break', 'movimento fuori dalla griglia', 'tensione ritmica senza quattro quarti'],
    en: ['broken drums pushing forward', 'bass answering the breaks', 'movement outside the grid', 'rhythmic tension beyond four four']
  },
  'hard dance': {
    delivery: 'hard',
    it: ['kick enorme e pressione continua', 'energia rave senza tregua', 'mani alzate prima dell’impatto', 'velocità che diventa euforia'],
    en: ['huge kick and nonstop pressure', 'rave energy without mercy', 'hands raised before impact', 'speed turning into euphoria']
  },
  electro: {
    delivery: 'machine',
    it: ['ritmo robotico e sincopato', 'bassline elettronica che parla', 'futuro urbano e circuiti', 'macchine che imparano a ballare'],
    en: ['robotic syncopated rhythm', 'an electronic bassline speaking', 'urban future and circuits', 'machines learning to dance']
  },
  'ambient electronic': {
    delivery: 'ambient',
    it: ['spazio aperto tra le frequenze', 'texture che respirano lentamente', 'tempo sospeso senza peso', 'un paesaggio che cambia da lontano'],
    en: ['open space between frequencies', 'textures breathing slowly', 'weightless suspended time', 'a landscape changing from afar']
  },
  'idm experimental electronic': {
    delivery: 'experimental',
    it: ['ritmi che si rompono e si ricompongono', 'micro-dettagli digitali', 'forme sonore imprevedibili', 'logica e caos nello stesso circuito'],
    en: ['rhythms breaking and rebuilding', 'digital micro details', 'unpredictable sonic shapes', 'logic and chaos inside one circuit']
  },
  synthwave: {
    delivery: 'retro',
    it: ['neon sopra l’asfalto', 'sintetizzatori da futuro immaginato', 'una notte anni ottanta che non finisce', 'strade luminose verso l’orizzonte'],
    en: ['neon over asphalt', 'synthesizers from an imagined future', 'an eighties night that never ends', 'bright roads toward the horizon']
  }
};

const TRAITS: Record<string, Trait> = {
  // Trance (13)
  'classic trance': { it: 'sequenze 909, supersaw e melodie trance classiche', en: '909 sequences, supersaws and classic trance melodies' },
  'progressive trance': { it: 'sviluppo graduale, groove profondo e tensione melodica lunga', en: 'gradual development, deep groove and long melodic tension' },
  'uplifting trance': { it: 'breakdown emotivo, lead euforico e grande rilascio armonico', en: 'emotional breakdown, euphoric lead and huge harmonic release' },
  'vocal trance': { it: 'voce centrale, accordi emotivi e ritornello ampio', en: 'central vocal, emotional chords and a wide chorus' },
  psytrance: { it: 'basso rolling psichedelico, sequenze acide e trance ipnotica', en: 'psychedelic rolling bass, acid sequences and hypnotic trance' },
  'goa trance': { it: 'linee acide cosmiche, arpeggi orientali e viaggio psichedelico', en: 'cosmic acid lines, eastern arpeggios and psychedelic journey' },
  'full on psytrance': { it: 'basso full-on energico, lead luminosi e cambi rapidi', en: 'energetic full-on bass, bright leads and fast transitions' },
  'dark psytrance': { it: 'basso oscuro, texture minacciose e psichedelia notturna', en: 'dark bass, threatening textures and nocturnal psychedelia' },
  'forest psytrance': { it: 'percussioni organiche, suoni boschivi e dettagli alieni', en: 'organic percussion, forest sounds and alien details' },
  'tech trance': { it: 'kick duro, groove techno e lead trance taglienti', en: 'hard kick, techno groove and sharp trance leads' },
  'hard trance': { it: 'ritmo veloce, kick aggressivo e riff rave euforici', en: 'fast rhythm, aggressive kick and euphoric rave riffs' },
  'dream trance': { it: 'piano sognante, pad ariosi e melodia nostalgica', en: 'dreamy piano, airy pads and nostalgic melody' },
  'balearic trance': { it: 'chitarre e pad solari, atmosfera marina e trance aperta', en: 'sunlit guitars and pads, seaside atmosphere and open trance' },

  // Drum & Bass (11)
  'liquid drum bass': { it: 'break fluidi, sub caldo, accordi soul e atmosfera emotiva', en: 'fluid breaks, warm sub, soulful chords and emotional atmosphere' },
  jungle: { it: 'Amen break tagliati, sub pesante e energia rave giamaicana', en: 'chopped Amen breaks, heavy sub and Jamaican rave energy' },
  neurofunk: { it: 'bassline neuro modulata, drums chirurgici e tensione futuristica', en: 'modulated neuro bassline, surgical drums and futuristic tension' },
  'jump up': { it: 'basso wobble giocoso, jump-up drums e call-and-response', en: 'playful wobble bass, jump-up drums and call-and-response' },
  techstep: { it: 'break freddi, bassline tecnologica e atmosfera distopica', en: 'cold breaks, technological bassline and dystopian atmosphere' },
  darkstep: { it: 'break aggressivi, bassi oscuri e pressione industriale', en: 'aggressive breaks, dark bass and industrial pressure' },
  drumfunk: { it: 'breakbeat complessi, ghost notes e micro-edit ritmici', en: 'complex breakbeats, ghost notes and rhythmic micro edits' },
  'atmospheric dnb': { it: 'break leggeri, pad profondi e spazio cinematografico', en: 'light breaks, deep pads and cinematic space' },
  'dancefloor dnb': { it: 'drop melodico enorme, drums puliti e energia da festival', en: 'huge melodic drop, clean drums and festival energy' },
  'minimal dnb': { it: 'drums essenziali, sub profondo e molto spazio negativo', en: 'essential drums, deep sub and lots of negative space' },
  'ragga jungle': { it: 'Amen break, bassi jungle e vocal ragga/dancehall', en: 'Amen breaks, jungle bass and ragga dancehall vocals' },

  // Dubstep (9)
  'uk dubstep': { it: 'sub-bass profondo, half-time swing e spazio scuro londinese', en: 'deep sub bass, half time swing and dark London space' },
  'deep dubstep': { it: 'sub molto basso, percussioni sparse e atmosfera meditativa', en: 'very low sub, sparse percussion and meditative atmosphere' },
  brostep: { it: 'mid-bass aggressivi, growl, drop enormi e sound design brillante', en: 'aggressive mid bass, growls, huge drops and bright sound design' },
  riddim: { it: 'pattern bass quadrati, swing minimale e ripetizione pesante', en: 'square bass patterns, minimal swing and heavy repetition' },
  'melodic dubstep': { it: 'accordi emotivi, vocal chops e drop bass melodico', en: 'emotional chords, vocal chops and melodic bass drops' },
  'future garage': { it: '2-step fragile, voci pitchate, pioggia e atmosfera intima', en: 'fragile two step, pitched vocals, rain and intimate atmosphere' },
  'post dubstep': { it: 'ritmi bass decostruiti, soul elettronico e spazio sperimentale', en: 'deconstructed bass rhythms, electronic soul and experimental space' },
  chillstep: { it: 'half-time morbido, pad caldi e bassi delicati', en: 'soft half time, warm pads and delicate bass' },
  deathstep: { it: 'bass estremi, distorsione metallica e drop brutali', en: 'extreme bass, metallic distortion and brutal drops' },

  // UK Garage (7)
  '2 step garage': { it: 'kick sincopati, snare spezzati e vocal R&B tagliati', en: 'syncopated kicks, broken snares and chopped R&B vocals' },
  'speed garage': { it: '4x4/2-step veloce, bassline reese e vocal pitchati', en: 'fast 4x4 and two step, reese bass and pitched vocals' },
  bassline: { it: 'bassline enorme e rimbalzante, drums UK e hook da club', en: 'huge bouncing bassline, UK drums and club hook' },
  'uk funky': { it: 'percussioni syncopate, house UK e influenze afro-latine', en: 'syncopated percussion, UK house and Afro Latin influence' },
  niche: { it: 'bassline Sheffield, 4x4 scattante e vocal garage', en: 'Sheffield bassline, snappy 4x4 and garage vocals' },
  '4x4 garage': { it: 'kick four-on-floor con swing garage e basso UK', en: 'four on floor kick with garage swing and UK bass' },

  // Breakbeat (7)
  breaks: { it: 'breakbeat moderni, basso funk e groove spezzato da club', en: 'modern breakbeats, funk bass and broken club groove' },
  'big beat': { it: 'break enormi, sample rock/funk e energia cinematografica', en: 'huge breaks, rock funk samples and cinematic energy' },
  'nu skool breaks': { it: 'break potenti, bassline acida e sound design futuristico', en: 'powerful breaks, acid bassline and futuristic sound design' },
  'florida breaks': { it: 'break electro, bassi Miami e atmosfera rave solare', en: 'electro breaks, Miami bass and sunlit rave atmosphere' },
  'electro breaks': { it: 'ritmo spezzato robotico, electro bass e vocoder', en: 'robotic broken rhythm, electro bass and vocoder' },
  'progressive breaks': { it: 'breakbeat profondi, pad evolutivi e sviluppo lungo', en: 'deep breakbeats, evolving pads and long development' },
  'broken beat': { it: 'groove jazzato, sincopi complesse e soul elettronico', en: 'jazzy groove, complex syncopation and electronic soul' },

  // Hard Dance (10)
  hardstyle: { it: 'kick reverse-bass, lead anthemico e climax hardstyle', en: 'reverse bass kick, anthemic lead and hardstyle climax' },
  rawstyle: { it: 'kick raw distorti, screech e atmosfera aggressiva', en: 'distorted raw kicks, screeches and aggressive atmosphere' },
  'euphoric hardstyle': { it: 'melodie emotive, vocal anthemici e kick hardstyle puliti', en: 'emotional melodies, anthemic vocals and clean hardstyle kicks' },
  hardcore: { it: 'kick veloci e duri, rave stabs e energia hardcore', en: 'fast hard kicks, rave stabs and hardcore energy' },
  gabber: { it: 'kick gabber distorti, ritmo martellante e rave olandese', en: 'distorted gabber kicks, hammering rhythm and Dutch rave energy' },
  frenchcore: { it: 'kick frenchcore elastici, melodie folli e velocità estrema', en: 'elastic frenchcore kicks, wild melodies and extreme speed' },
  'uptempo hardcore': { it: 'kick uptempo estremi, piep kicks e pressione continua', en: 'extreme uptempo kicks, piep kicks and nonstop pressure' },
  'happy hardcore': { it: 'piano euforici, vocal felici e breakbeat velocissimi', en: 'euphoric piano, happy vocals and very fast breakbeats' },
  'hard dance': { it: 'kick duri, bassline rave e hook da main room', en: 'hard kicks, rave basslines and main room hooks' },
  makina: { it: 'ritmo makina velocissimo, melodie rave e bassi rimbalzanti', en: 'very fast makina rhythm, rave melodies and bouncing bass' },

  // Electro (6)
  electro: { it: 'beat 808 sincopato, bassline robotica e synth futuristi', en: 'syncopated 808 beat, robotic bassline and futuristic synths' },
  'electro funk': { it: '808, vocoder, bass funk e groove da breakdance', en: '808s, vocoder, funk bass and breakdance groove' },
  electroclash: { it: 'synth freddi, drum machine secche e attitudine electro-punk', en: 'cold synths, dry drum machines and electro punk attitude' },
  'miami bass': { it: '808 sub enormi, clap secchi e groove Miami da party', en: 'huge 808 subs, sharp claps and Miami party groove' },
  freestyle: { it: 'drum machine latine, synth romantici e vocal dance anni ottanta', en: 'Latin drum machines, romantic synths and eighties dance vocals' },
  'nu electro': { it: 'electro moderno, bassi modulari e precisione futuristica', en: 'modern electro, modular bass and futuristic precision' },

  // Ambient Electronic (9)
  ambient: { it: 'pad lunghi, droni delicati e spazio senza ritmo obbligato', en: 'long pads, delicate drones and space without required rhythm' },
  'dark ambient': { it: 'droni scuri, rumore profondo e tensione cinematografica', en: 'dark drones, deep noise and cinematic tension' },
  drone: { it: 'toni sostenuti, armonici lenti e trasformazione quasi immobile', en: 'sustained tones, slow harmonics and nearly static transformation' },
  'space ambient': { it: 'pad cosmici, riverberi enormi e sensazione orbitale', en: 'cosmic pads, huge reverbs and orbital sensation' },
  chillout: { it: 'beat rilassato, pad caldi e melodia da tramonto', en: 'relaxed beat, warm pads and sunset melody' },
  downtempo: { it: 'ritmo lento, bassi morbidi e dettagli organici', en: 'slow rhythm, soft bass and organic details' },
  psybient: { it: 'texture psichedeliche, percussioni lente e viaggio cosmico', en: 'psychedelic textures, slow percussion and cosmic journey' },
  illbient: { it: 'ambient urbano oscuro, collage sonori e bassi dub', en: 'dark urban ambient, sound collage and dub bass' },
  'new age electronic': { it: 'pad luminosi, arpeggi delicati e atmosfera contemplativa', en: 'bright pads, delicate arpeggios and contemplative atmosphere' },

  // IDM / Experimental Electronic (10)
  idm: { it: 'beat complessi, timbri digitali e melodie oblique', en: 'complex beats, digital timbres and oblique melodies' },
  glitch: { it: 'errori digitali ritmici, stutter e frammenti microscopici', en: 'rhythmic digital errors, stutters and microscopic fragments' },
  'glitch hop': { it: 'beat hip-hop spezzati, bassi glitch e funk digitale', en: 'broken hip hop beats, glitch bass and digital funk' },
  braindance: { it: 'acid melodica, drum programming imprevedibile e ironia elettronica', en: 'melodic acid, unpredictable drum programming and electronic wit' },
  microsound: { it: 'granuli, click e texture quasi invisibili', en: 'grains, clicks and nearly invisible textures' },
  'deconstructed club': { it: 'ritmi club smontati, impatti asimmetrici e spazio radicale', en: 'dismantled club rhythms, asymmetric impacts and radical space' },
  wonky: { it: 'swing storto, synth instabili e groove fuori asse', en: 'crooked swing, unstable synths and off-axis groove' },
  vaporwave: { it: 'sample rallentati, nostalgia digitale e atmosfera da centro commerciale', en: 'slowed samples, digital nostalgia and mall atmosphere' },
  mallsoft: { it: 'riverberi da spazio commerciale vuoto, muzak e memoria sfocata', en: 'empty mall reverbs, muzak and blurred memory' },
  'future funk': { it: 'sample disco giapponesi, groove brillante e nostalgia accelerata', en: 'Japanese disco samples, bright groove and accelerated nostalgia' },

  // Synthwave (7)
  synthwave: { it: 'drum machine anni ottanta, bass synth e lead cinematografici', en: 'eighties drum machines, synth bass and cinematic leads' },
  retrowave: { it: 'nostalgia VHS, synth romantici e notte metropolitana', en: 'VHS nostalgia, romantic synths and metropolitan night' },
  outrun: { it: 'sequenze veloci, bassi pulsanti e autostrada al neon', en: 'fast sequences, pulsing bass and neon highway' },
  darksynth: { it: 'synth distorti, atmosfera horror e bassi minacciosi', en: 'distorted synths, horror atmosphere and threatening bass' },
  dreamwave: { it: 'pad sognanti, lead morbidi e nostalgia luminosa', en: 'dreamy pads, soft leads and bright nostalgia' },
  cyberpunk: { it: 'synth industriali, neon sporco e futuro distopico', en: 'industrial synths, dirty neon and dystopian future' },
  spacewave: { it: 'arpeggi cosmici, pad stellari e viaggio retro-futurista', en: 'cosmic arpeggios, stellar pads and retro futuristic journey' }
};

const REQUESTED_GENRES = new Set(Object.keys(GENRE_PROFILES));

function normalize(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' ')
    .replace(/\//g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function hasElectronicLyricsProfile(genre: string, subgenre: string): boolean {
  return REQUESTED_GENRES.has(normalize(genre)) && Boolean(TRAITS[normalize(subgenre)]);
}

function rotate<T>(values: readonly T[], offset: number): T[] {
  const safe = ((offset % values.length) + values.length) % values.length;
  return [...values.slice(safe), ...values.slice(0, safe)];
}

function labels(language: string) {
  const italian = language === 'it' || language === 'nap';
  return italian
    ? { verse1: 'Strofa 1', verse2: 'Strofa 2', verse3: 'Strofa 3', pre: 'Pre-Hook', hook: 'Hook', post: 'Post-Hook', breakdown: 'Breakdown', bridge: 'Bridge', final: 'Hook Finale', outro: 'Outro', male: 'Voce maschile', female: 'Voce femminile', together: 'Insieme' }
    : { verse1: 'Verse 1', verse2: 'Verse 2', verse3: 'Verse 3', pre: 'Pre-Hook', hook: 'Hook', post: 'Post-Hook', breakdown: 'Breakdown', bridge: 'Bridge', final: 'Final Hook', outro: 'Outro', male: 'Male voice', female: 'Female voice', together: 'Together' };
}

function section(label: string, vocalMode: VocalMode, role: 'first' | 'second' | 'together', language: string): string {
  if (vocalMode !== 'duet') return `[${label}]`;
  const l = labels(language);
  const voice = role === 'first' ? l.male : role === 'second' ? l.female : l.together;
  return `[${label} - ${voice}]`;
}

function sparseDelivery(delivery: Delivery): boolean {
  return delivery === 'bass' || delivery === 'swing' || delivery === 'broken' || delivery === 'hard' || delivery === 'machine' || delivery === 'experimental';
}

function buildItalian(profile: GenreProfile, trait: Trait, mood: string, variant: number) {
  const c = rotate(profile.it, variant);
  const sparse = sparseDelivery(profile.delivery);
  const moodText = mood ? mood.toLowerCase() : 'profonda';
  const hook = sparse
    ? [`Senti ${trait.it}`, `entra dentro ${c[1]}`, `Senti ${trait.it}`, `non fermare ${c[3]}`]
    : [`Portami dentro ${trait.it}`, `oltre ${c[0]}`, `Portami dentro ${trait.it}`, `finché ritorna ${c[3]}`];

  return {
    verse1: sparse
      ? [`Dentro ${c[0]}`, `il corpo segue ${trait.it}`, `la notte diventa ${moodText}`, `resta soltanto ${c[2]}`]
      : [`Cammino verso ${c[0]}`, `mentre nasce ${trait.it}`, `la notte diventa ${moodText}`, `e mi porta dentro ${c[2]}`],
    pre1: [`Lascia salire ${c[1]}`, `adesso entra in ${c[3]}`],
    hook,
    post: sparse ? [`Ancora ${trait.it}`, `ancora una volta`] : [`Resta dentro questa frequenza`, `non lasciare andare ${c[3]}`],
    verse2: sparse
      ? [`Il ritmo torna da ${c[2]}`, `la pressione cambia forma`, `ogni colpo porta ${trait.it}`, `e tutto riparte dentro ${c[0]}`]
      : [`Sotto le luci ritrovo ${c[1]}`, `ogni distanza perde il nome`, `il suono apre ${trait.it}`, `e torna a respirare ${c[0]}`],
    pre2: [`Ancora un giro, resta qui`, `lascia parlare il carattere di ${trait.it}`],
    breakdown: sparse ? [`Togli il peso, lascia il respiro`, `poi riporta ${trait.it}`] : [`Per un momento resta solo lo spazio`, `poi ritorna ${trait.it}`],
    verse3: sparse
      ? [`Poche parole, nuova pressione`, `il dettaglio cambia il ciclo`, `la stanza risponde a ${trait.it}`, `e ricomincia da ${c[1]}`]
      : [`Quando il tempo sembra rallentare`, `vedo più chiaro ${c[1]}`, `non torno indietro adesso`, `se davanti rimane ${trait.it}`],
    bridge: sparse ? [`Non cambiare il passo adesso`, `porta ${trait.it} fino alla fine`] : [`Se domani cambia il paesaggio`, `${trait.it} resterà con noi`],
    outro: [hook[0], sparse ? 'ancora una volta' : 'finché il segnale si allontana']
  };
}

function buildEnglish(profile: GenreProfile, trait: Trait, mood: string, variant: number) {
  const c = rotate(profile.en, variant);
  const sparse = sparseDelivery(profile.delivery);
  const moodText = mood ? mood.toLowerCase() : 'deep';
  const hook = sparse
    ? [`Feel ${trait.en}`, `move inside ${c[1]}`, `Feel ${trait.en}`, `do not stop ${c[3]}`]
    : [`Take me inside ${trait.en}`, `beyond ${c[0]}`, `Take me inside ${trait.en}`, `until ${c[3]} returns`];

  return {
    verse1: sparse
      ? [`Inside ${c[0]}`, `the body follows ${trait.en}`, `the night turns ${moodText}`, `only ${c[2]} remains`]
      : [`I move toward ${c[0]}`, `while ${trait.en} begins`, `the night turns ${moodText}`, `and carries me into ${c[2]}`],
    pre1: [`Let ${c[1]} rise`, `now step into ${c[3]}`],
    hook,
    post: sparse ? [`Again: ${trait.en}`, `one more time`] : [`Stay inside this frequency`, `do not let ${c[3]} go`],
    verse2: sparse
      ? [`The rhythm returns from ${c[2]}`, `the pressure changes shape`, `every hit carries ${trait.en}`, `and everything starts inside ${c[0]} again`]
      : [`Under the lights I find ${c[1]}`, `every distance loses its name`, `the sound opens ${trait.en}`, `and ${c[0]} starts breathing again`],
    pre2: [`One more cycle, stay here`, `let the character of ${trait.en} speak`],
    breakdown: sparse ? [`Take the weight away, leave the breath`, `then bring back ${trait.en}`] : [`For one moment only space remains`, `then ${trait.en} returns`],
    verse3: sparse
      ? [`Few words, new pressure`, `one detail changes the cycle`, `the room answers ${trait.en}`, `and begins again from ${c[1]}`]
      : [`When time begins to slow down`, `I see ${c[1]} more clearly`, `I do not turn around now`, `while ${trait.en} stays ahead`],
    bridge: sparse ? [`Do not change the step now`, `carry ${trait.en} to the end`] : [`If tomorrow changes the landscape`, `${trait.en} will stay with us`],
    outro: [hook[0], sparse ? 'one more time' : 'until the signal fades away']
  };
}

export function buildElectronicLyrics({ language, genre, subgenre, mood, vocalMode, variant, durationSec = 180 }: ElectronicLyricsInput): string {
  const profile = GENRE_PROFILES[normalize(genre)];
  const trait = TRAITS[normalize(subgenre)];
  if (!profile || !trait) return '';

  const localized = language === 'it' || language === 'nap'
    ? buildItalian(profile, trait, mood, variant)
    : buildEnglish(profile, trait, mood, variant);
  const l = labels(language);
  const blocks: string[][] = [
    [section(l.verse1, vocalMode, 'first', language), ...localized.verse1],
    [section(l.pre, vocalMode, 'first', language), ...localized.pre1],
    [section(l.hook, vocalMode, 'together', language), ...localized.hook],
    [section(l.post, vocalMode, 'together', language), ...localized.post],
    [section(l.verse2, vocalMode, 'second', language), ...localized.verse2],
    [section(l.pre, vocalMode, 'second', language), ...localized.pre2],
    [section(l.hook, vocalMode, 'together', language), ...localized.hook],
    [section(l.breakdown, vocalMode, 'together', language), ...localized.breakdown],
  ];

  if (durationSec >= 240) blocks.push([section(l.verse3, vocalMode, 'first', language), ...localized.verse3]);
  blocks.push(
    [section(l.bridge, vocalMode, 'together', language), ...localized.bridge],
    [section(l.final, vocalMode, 'together', language), ...localized.hook],
  );
  if (durationSec >= 180) blocks.push([section(l.outro, vocalMode, 'together', language), ...localized.outro]);

  return blocks.map(block => block.join('\n')).join('\n\n');
}

export const ELECTRONIC_LYRICS_GENRE_COUNT = Object.keys(GENRE_PROFILES).length;
export const ELECTRONIC_LYRICS_SUBGENRE_COUNT = Object.keys(TRAITS).length;
