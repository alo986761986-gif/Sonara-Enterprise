import type { VocalMode } from './generationPrompt';

export interface TechnoLyricsInput {
  language: string;
  subgenre: string;
  mood: string;
  vocalMode: VocalMode;
  variant: number;
  durationSec?: number;
}

type TechnoDelivery = 'machine' | 'minimal' | 'dub' | 'acid' | 'industrial' | 'hard' | 'hypnotic' | 'melodic' | 'ambient';

type TechnoLyricProfile = {
  delivery: TechnoDelivery;
  conceptsIt: [string, string, string, string];
  conceptsEn: [string, string, string, string];
  hooksIt: [string, string, string, string];
  hooksEn: [string, string, string, string];
};

const p = (
  delivery: TechnoDelivery,
  conceptsIt: TechnoLyricProfile['conceptsIt'],
  conceptsEn: TechnoLyricProfile['conceptsEn'],
  hooksIt: TechnoLyricProfile['hooksIt'],
  hooksEn: TechnoLyricProfile['hooksEn'],
): TechnoLyricProfile => ({ delivery, conceptsIt, conceptsEn, hooksIt, hooksEn });

const TECHNO_LYRIC_PROFILES: Record<string, TechnoLyricProfile> = {
  'detroit techno': p('machine',
    ['una città costruita di circuiti', 'il futuro che pulsa sotto il cemento', 'macchine con un’anima', 'l’alba sopra fabbriche e autostrade'],
    ['a city built from circuits', 'the future pulsing beneath concrete', 'machines carrying a soul', 'dawn above factories and highways'],
    ['Il futuro batte sotto la città', 'Macchine vive, cuore elettrico', 'Detroit sogna ancora avanti', 'Dentro il circuito siamo umani'],
    ['The future beats beneath the city', 'Living machines, electric heart', 'Detroit keeps dreaming forward', 'Inside the circuit we are human']),
  'minimal techno': p('minimal',
    ['un dettaglio che cambia il ciclo', 'spazio tra kick e impulso', 'una parola che ritorna', 'la tensione di ciò che manca'],
    ['one detail changing the cycle', 'space between kick and pulse', 'one word returning', 'the tension of what is missing'],
    ['Meno suono, più pressione', 'Resta nel ciclo', 'Una volta ancora', 'Lascia vuoto lo spazio'],
    ['Less sound, more pressure', 'Stay inside the cycle', 'One more time', 'Leave the space empty']),
  'dub techno': p('dub',
    ['accordi che affondano nella nebbia', 'eco che attraversa la distanza', 'basso profondo sotto la superficie', 'una stanza che continua oltre le pareti'],
    ['chords sinking into fog', 'echo crossing the distance', 'deep bass under the surface', 'a room continuing beyond its walls'],
    ['Lascia l’eco andare lontano', 'Più profondo, ancora più lento', 'Il suono ritorna dalla nebbia', 'Dentro il delay non c’è confine'],
    ['Let the echo travel far', 'Deeper, slower again', 'The sound returns from the fog', 'Inside the delay there is no border']),
  'acid techno': p('acid',
    ['una sequenza che cambia pelle', 'risonanza che sale senza tregua', 'una linea acida dentro il tunnel', 'il filtro che piega la notte'],
    ['a sequence changing its skin', 'resonance rising without mercy', 'an acid line inside the tunnel', 'the filter bending the night'],
    ['Acido su, non fermarlo', 'Gira il filtro ancora', 'Quella linea brucia dentro', 'Risonanza fino al limite'],
    ['Acid up, do not stop it', 'Turn the filter again', 'That line burns inside', 'Resonance to the limit']),
  'industrial techno': p('industrial',
    ['metallo che colpisce il cemento', 'catene dentro il ritmo', 'una fabbrica accesa nella notte', 'rumore trasformato in disciplina'],
    ['metal striking concrete', 'chains inside the rhythm', 'a factory lit in the night', 'noise transformed into discipline'],
    ['Metallo contro metallo', 'Nessuna luce morbida qui', 'La macchina continua', 'Pressione, ferro, movimento'],
    ['Metal against metal', 'No soft light in here', 'The machine keeps moving', 'Pressure, iron, motion']),
  'hard techno': p('hard',
    ['un kick che prende tutta la stanza', 'pressione che sale senza pausa', 'il corpo spinto oltre il limite', 'un comando secco prima dell’impatto'],
    ['a kick taking over the whole room', 'pressure rising without pause', 'the body pushed beyond the limit', 'a sharp command before impact'],
    ['Più forte, non rallentare', 'Kick duro, testa alta', 'Spingi ancora dentro il buio', 'Nessuna pausa fino alla fine'],
    ['Harder, do not slow down', 'Hard kick, head up', 'Push again into the dark', 'No pause until the end']),
  'peak time techno': p('hard',
    ['il momento in cui tutta la pista esplode', 'un riff che apre il picco', 'pressione costruita battuta dopo battuta', 'la folla sospesa prima del ritorno'],
    ['the moment the whole floor erupts', 'a riff opening the peak', 'pressure built bar by bar', 'the crowd suspended before the return'],
    ['Adesso arriva il momento', 'Tutto su quando torna il kick', 'Questa è l’ora del picco', 'Stringi la tensione, poi lasciala andare'],
    ['Now the moment arrives', 'Everything up when the kick returns', 'This is peak time', 'Hold the tension, then let it go']),
  'hypnotic techno': p('hypnotic',
    ['un pattern che gira senza fine', 'piccole variazioni dentro il trance', 'il tempo che perde i bordi', 'un impulso che diventa pensiero'],
    ['a pattern turning without end', 'small changes inside the trance', 'time losing its edges', 'a pulse becoming thought'],
    ['Dentro il ciclo, sempre più dentro', 'Non cercare l’uscita', 'Segui il pattern', 'Il tempo gira ancora'],
    ['Inside the cycle, deeper still', 'Do not look for the exit', 'Follow the pattern', 'Time keeps turning']),
  'melodic techno': p('melodic',
    ['una melodia fredda che cresce nel buio', 'un arpeggio sopra la pressione', 'emozione trattenuta dentro la macchina', 'un cielo enorme dietro il club'],
    ['a cold melody growing in the dark', 'an arpeggio above the pressure', 'emotion held inside the machine', 'a huge sky behind the club'],
    ['Portami oltre questa notte', 'La macchina sa ancora sentire', 'Questa melodia non si spegne', 'Sali con me dentro il buio'],
    ['Take me beyond this night', 'The machine can still feel', 'This melody will not go out', 'Rise with me into the dark']),
  'ambient techno': p('ambient',
    ['un battito lontano dentro lo spazio', 'texture sospese senza peso', 'la città vista da molto lontano', 'tempo lento tra rumore e silenzio'],
    ['a distant pulse inside space', 'weightless suspended textures', 'the city seen from very far away', 'slow time between noise and silence'],
    ['Resta sospeso qui', 'Il battito arriva da lontano', 'Nessun confine nello spazio', 'Lascia il tempo dissolversi'],
    ['Stay suspended here', 'The pulse arrives from far away', 'No borders in this space', 'Let time dissolve']),
  schranz: p('hard',
    ['loop percussivi martellanti', 'kick compresso e pressione continua', 'voci tagliate come ordini', 'energia ruvida senza respiro'],
    ['hammering percussion loops', 'compressed kick and nonstop pressure', 'voices chopped like commands', 'rough energy without breathing room'],
    ['Martella ancora, non mollare', 'Più pressione, più veloce', 'Taglia la voce, spingi il kick', 'Schranz fino alla fine'],
    ['Hammer it again, do not let go', 'More pressure, faster', 'Cut the voice, push the kick', 'Schranz to the end']),
  'birmingham techno': p('industrial',
    ['ritmo duro ridotto all’essenziale', 'metallo secco e groove meccanico', 'spazio grigio tra fabbrica e club', 'ripetizione austera senza decorazione'],
    ['hard rhythm reduced to essentials', 'dry metal and mechanical groove', 'grey space between factory and club', 'austere repetition without decoration'],
    ['Freddo, secco, avanti', 'Niente ornamenti, solo pressione', 'Il cemento tiene il tempo', 'La macchina non guarda indietro'],
    ['Cold, dry, forward', 'No decoration, only pressure', 'Concrete keeps the time', 'The machine never looks back']),
  'raw techno': p('machine',
    ['drum machine sporche e dirette', 'un groove ruvido senza lucidatura', 'stabs secchi dentro il vuoto', 'energia da warehouse senza compromessi'],
    ['dirty direct drum machines', 'a rough unpolished groove', 'dry stabs inside empty space', 'warehouse energy without compromise'],
    ['Crudo, diretto, resta così', 'Niente trucco sopra il groove', 'Lascia sporco quel battito', 'Warehouse fino al mattino'],
    ['Raw and direct, keep it that way', 'No polish over the groove', 'Leave that pulse dirty', 'Warehouse until morning']),
  'deep techno': p('dub',
    ['basso profondo sotto strati scuri', 'percussioni che emergono lentamente', 'una stanza sotterranea senza luce', 'movimento ipnotico dentro la profondità'],
    ['deep bass beneath dark layers', 'percussion emerging slowly', 'an underground room without light', 'hypnotic movement inside the depth'],
    ['Scendi ancora più in profondità', 'Sotto la superficie c’è il ritmo', 'Resta nel buio con il basso', 'Più giù, più dentro'],
    ['Go deeper still', 'The rhythm lives under the surface', 'Stay in the dark with the bass', 'Lower, deeper inside'])
};

function normalize(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function hasTechnoLyricsProfile(subgenre: string): boolean {
  return Boolean(TECHNO_LYRIC_PROFILES[normalize(subgenre)]);
}

function rotate<T>(values: readonly T[], offset: number): T[] {
  if (!values.length) return [];
  const safe = ((offset % values.length) + values.length) % values.length;
  return [...values.slice(safe), ...values.slice(0, safe)];
}

function labels(language: string) {
  const italian = language === 'it' || language === 'nap';
  return italian
    ? { verse1: 'Strofa 1', verse2: 'Strofa 2', verse3: 'Strofa 3', pre: 'Pre-Ritornello', hook: 'Hook', post: 'Post-Hook', breakdown: 'Breakdown', bridge: 'Bridge', final: 'Hook Finale', outro: 'Outro', male: 'Voce maschile', female: 'Voce femminile', together: 'Insieme' }
    : { verse1: 'Verse 1', verse2: 'Verse 2', verse3: 'Verse 3', pre: 'Pre-Chorus', hook: 'Hook', post: 'Post-Hook', breakdown: 'Breakdown', bridge: 'Bridge', final: 'Final Hook', outro: 'Outro', male: 'Male voice', female: 'Female voice', together: 'Together' };
}

function section(label: string, vocalMode: VocalMode, role: 'first' | 'second' | 'together', language: string): string {
  if (vocalMode !== 'duet') return `[${label}]`;
  const l = labels(language);
  const voice = role === 'first' ? l.male : role === 'second' ? l.female : l.together;
  return `[${label} - ${voice}]`;
}

function buildItalian(profile: TechnoLyricProfile, mood: string, variant: number) {
  const c = rotate(profile.conceptsIt, variant);
  const h = rotate(profile.hooksIt, variant);
  const moodText = mood ? mood.toLowerCase() : 'scuro';
  const lyrical = profile.delivery === 'melodic' || profile.delivery === 'ambient' || profile.delivery === 'dub';
  const aggressive = profile.delivery === 'hard' || profile.delivery === 'industrial' || profile.delivery === 'acid';

  return {
    verse1: lyrical
      ? [`Entro dentro ${c[0]}`, `la notte diventa ${moodText}`, `sento ${c[1]}`, `e continuo verso ${c[2]}`]
      : [`Dentro ${c[0]}`, `il corpo segue ${c[1]}`, aggressive ? 'nessuna tregua dentro il battito' : 'ogni dettaglio cambia il ciclo', `resta soltanto ${c[2]}`],
    pre1: lyrical ? [`Non serve una direzione`, `basta seguire ${c[3]}`] : [`Tieni il passo ancora`, `porta ${c[3]} più vicino`],
    hook: [h[0], h[1], h[0], h[2]],
    post: [h[3], h[3]],
    verse2: lyrical
      ? [`Sotto la superficie ritrovo ${c[2]}`, `le distanze perdono forma`, `il suono attraversa ${c[3]}`, `e ritorna dentro ${c[0]}`]
      : [`Il kick ritorna sotto i piedi`, `la pressione stringe ${c[3]}`, `una voce rompe il silenzio`, `e tutto riparte da ${c[0]}`],
    pre2: lyrical ? [`Lascia che il tempo si allarghi`, `poi riporta il battito vicino`] : [`Ancora un giro senza fermarti`, `lascia parlare soltanto il ritmo`],
    breakdown: lyrical ? [`Per un momento resta solo lo spazio`, `poi il battito torna da lontano`] : [`Togli tutto, lascia la tensione`, `poi riporta kick e pressione`],
    verse3: lyrical
      ? [`Quando il tempo sembra rallentare`, `vedo più chiaro ${c[1]}`, `non torno indietro adesso`, `se davanti rimane ${c[3]}`]
      : [`Poche parole, stessa direzione`, `più pressione dentro il suono`, `la stanza risponde al richiamo`, `e ricomincia da ${c[1]}`],
    bridge: lyrical ? [`Se domani cambia il paesaggio`, `questa frequenza resterà con noi`] : [`Non cambiare il passo adesso`, `porta il ciclo fino alla fine`],
    outro: lyrical ? [h[0], 'finché il segnale si allontana'] : [h[0], 'ancora una volta']
  };
}

function buildEnglish(profile: TechnoLyricProfile, mood: string, variant: number) {
  const c = rotate(profile.conceptsEn, variant);
  const h = rotate(profile.hooksEn, variant);
  const moodText = mood ? mood.toLowerCase() : 'dark';
  const lyrical = profile.delivery === 'melodic' || profile.delivery === 'ambient' || profile.delivery === 'dub';
  const aggressive = profile.delivery === 'hard' || profile.delivery === 'industrial' || profile.delivery === 'acid';

  return {
    verse1: lyrical
      ? [`I move inside ${c[0]}`, `the night turns ${moodText}`, `I can feel ${c[1]}`, `and keep moving toward ${c[2]}`]
      : [`Inside ${c[0]}`, `the body follows ${c[1]}`, aggressive ? 'no mercy inside the pulse' : 'every detail changes the cycle', `only ${c[2]} remains`],
    pre1: lyrical ? [`We do not need a direction`, `we only need to follow ${c[3]}`] : [`Hold the step again`, `bring ${c[3]} closer`],
    hook: [h[0], h[1], h[0], h[2]],
    post: [h[3], h[3]],
    verse2: lyrical
      ? [`Under the surface I find ${c[2]}`, `distance loses its shape`, `the sound crosses ${c[3]}`, `and returns inside ${c[0]}`]
      : [`The kick returns beneath our feet`, `the pressure pulls ${c[3]} closer`, `one voice breaks the silence`, `and everything starts from ${c[0]} again`],
    pre2: lyrical ? [`Let time grow wider`, `then bring the heartbeat close again`] : [`One more cycle, do not stop`, `let the rhythm do the talking`],
    breakdown: lyrical ? [`For one moment only space remains`, `then the pulse returns from far away`] : [`Take it away, leave the tension`, `then bring back kick and pressure`],
    verse3: lyrical
      ? [`When time begins to slow down`, `I can see ${c[1]} more clearly`, `I do not turn around now`, `while ${c[3]} stays ahead`]
      : [`Few words, same direction`, `more pressure inside the sound`, `the room answers the call`, `and begins again from ${c[1]}`],
    bridge: lyrical ? [`If tomorrow changes the landscape`, `this frequency will stay with us`] : [`Do not change the step now`, `carry the cycle to the end`],
    outro: lyrical ? [h[0], 'until the signal fades away'] : [h[0], 'one more time']
  };
}

export function buildTechnoLyrics({ language, subgenre, mood, vocalMode, variant, durationSec = 180 }: TechnoLyricsInput): string {
  const profile = TECHNO_LYRIC_PROFILES[normalize(subgenre)] || TECHNO_LYRIC_PROFILES['detroit techno'];
  const localized = language === 'it' || language === 'nap'
    ? buildItalian(profile, mood, variant)
    : buildEnglish(profile, mood, variant);
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

  if (durationSec >= 240) {
    blocks.push([section(l.verse3, vocalMode, 'first', language), ...localized.verse3]);
  }

  blocks.push(
    [section(l.bridge, vocalMode, 'together', language), ...localized.bridge],
    [section(l.final, vocalMode, 'together', language), ...localized.hook],
  );

  if (durationSec >= 180) {
    blocks.push([section(l.outro, vocalMode, 'together', language), ...localized.outro]);
  }

  return blocks.map(block => block.join('\n')).join('\n\n');
}

export const TECHNO_LYRICS_PROFILE_COUNT = Object.keys(TECHNO_LYRIC_PROFILES).length;
