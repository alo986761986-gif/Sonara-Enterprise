import type { VocalMode } from './generationPrompt';

export interface HouseLyricsInput {
  language: string;
  subgenre: string;
  mood: string;
  vocalMode: VocalMode;
  variant: number;
  durationSec?: number;
}

type Delivery = 'sparse' | 'deep' | 'soulful' | 'anthemic' | 'percussive' | 'dreamy' | 'raw';

type HouseLyricProfile = {
  delivery: Delivery;
  conceptsIt: [string, string, string, string];
  conceptsEn: [string, string, string, string];
  hooksIt: [string, string, string, string];
  hooksEn: [string, string, string, string];
};

const p = (
  delivery: Delivery,
  conceptsIt: HouseLyricProfile['conceptsIt'],
  conceptsEn: HouseLyricProfile['conceptsEn'],
  hooksIt: HouseLyricProfile['hooksIt'],
  hooksEn: HouseLyricProfile['hooksEn'],
): HouseLyricProfile => ({ delivery, conceptsIt, conceptsEn, hooksIt, hooksEn });

const HOUSE_LYRIC_PROFILES: Record<string, HouseLyricProfile> = {
  house: p('anthemic',
    ['la pista che si accende', 'il battito che unisce', 'la notte che cambia forma', 'la libertà dentro il ritmo'],
    ['the floor coming alive', 'the beat bringing us together', 'the night changing shape', 'freedom inside the rhythm'],
    ['Questa notte vive con noi', 'Senti il ritmo, lascialo andare', 'Non fermare questo momento', 'Balla finché torna il sole'],
    ['This night is alive with us', 'Feel the rhythm, let it go', 'Do not stop this moment', 'Dance until the sun comes back']),
  'classic house': p('soulful',
    ['un piano che riporta indietro', 'una voce che sale dal club', 'il calore di una notte senza tempo', 'mani alzate sotto le luci'],
    ['a piano taking us back', 'a voice rising from the club', 'the warmth of a timeless night', 'hands raised under the lights'],
    ['Portami indietro dentro quel suono', 'Quel piano sa già dove andare', 'Una voce, una notte, un battito', 'Casa è dove suona questo groove'],
    ['Take me back inside that sound', 'That piano already knows the way', 'One voice, one night, one heartbeat', 'Home is where this groove is playing']),
  'chicago house': p('raw',
    ['il magazzino che vibra', 'il jack che entra nelle gambe', 'il sudore sopra il cemento', 'una voce tagliata nel loop'],
    ['the warehouse shaking', 'the jack moving through the body', 'sweat on the concrete', 'a voice chopped into the loop'],
    ['Jack your body, non fermarti', 'Il pavimento chiama ancora', 'Crudo, diretto, fino al mattino', 'Questo groove non chiede permesso'],
    ['Jack your body, do not stop', 'The floor is calling again', 'Raw and direct until morning', 'This groove does not ask permission']),
  'deep house': p('deep',
    ['la città che respira piano', 'una distanza che si scioglie', 'riflessi scuri sull’acqua', 'due respiri dentro la stessa notte'],
    ['the city breathing slowly', 'a distance dissolving', 'dark reflections on the water', 'two breaths inside the same night'],
    ['Resta qui dentro il mio respiro', 'Scendi più a fondo insieme a me', 'Tra le luci sento ancora te', 'Questa notte parla piano'],
    ['Stay here inside my breathing', 'Go deeper with me', 'I still feel you between the lights', 'This night is speaking softly']),
  'tech house': p('sparse',
    ['il basso che prende il controllo', 'un comando breve nella notte', 'corpi che seguono lo stesso impulso', 'la tensione prima del drop'],
    ['the bass taking control', 'a short command in the dark', 'bodies following one impulse', 'the tension before the drop'],
    ['Muoviti, non pensare', 'Uno, due, dentro il groove', 'Basso giù, mani su', 'Ancora una volta, fallo adesso'],
    ['Move, do not think', 'One, two, into the groove', 'Bass down, hands up', 'One more time, do it now']),
  'progressive house': p('dreamy',
    ['una strada che continua oltre l’orizzonte', 'la luce che cresce senza fretta', 'un ricordo che diventa futuro', 'il viaggio che cambia mentre lo viviamo'],
    ['a road continuing beyond the horizon', 'light growing without hurry', 'a memory becoming the future', 'the journey changing while we live it'],
    ['Portami oltre quello che conosco', 'La strada si apre davanti a noi', 'Ogni passo diventa più grande', 'Non tornare indietro stanotte'],
    ['Take me beyond what I know', 'The road is opening in front of us', 'Every step becomes bigger', 'Do not turn back tonight']),
  'melodic house': p('dreamy',
    ['una melodia che torna come memoria', 'il cielo aperto sopra la città', 'un’emozione che cresce nota dopo nota', 'la notte che diventa colore'],
    ['a melody returning like a memory', 'the open sky above the city', 'an emotion growing note by note', 'the night turning into color'],
    ['Questa melodia mi porta a te', 'Lascia che il cielo entri dentro', 'Ogni nota ci avvicina', 'Resta finché il suono cambia luce'],
    ['This melody carries me to you', 'Let the sky come inside', 'Every note brings us closer', 'Stay until the sound changes light']),
  'afro house': p('percussive',
    ['il passo che risponde al tamburo', 'la terra sotto i piedi', 'voci che si incontrano nel cerchio', 'il sole che ritorna dopo la notte'],
    ['the step answering the drum', 'the earth beneath our feet', 'voices meeting in the circle', 'the sun returning after the night'],
    ['Senti la terra, segui il ritmo', 'Una voce chiama, mille rispondono', 'Cammina con me dentro il battito', 'Il giorno ritorna dal suono'],
    ['Feel the earth, follow the rhythm', 'One voice calls, a thousand answer', 'Walk with me inside the heartbeat', 'Daylight returns through the sound']),
  'tribal house': p('percussive',
    ['tamburi che si rincorrono', 'un cerchio di movimento', 'la notte ridotta a ritmo', 'il corpo che risponde agli accenti'],
    ['drums chasing each other', 'a circle of movement', 'the night reduced to rhythm', 'the body answering the accents'],
    ['Segui il tamburo, torna al centro', 'Batti le mani, senti il richiamo', 'Il ritmo gira ancora', 'Niente parole, solo movimento'],
    ['Follow the drum, return to the center', 'Clap your hands, hear the call', 'The rhythm turns again', 'No words, only movement']),
  'soulful house': p('soulful',
    ['una promessa cantata a cuore aperto', 'il coraggio di ricominciare', 'una voce che solleva la stanza', 'l’amore che torna a respirare'],
    ['a promise sung with an open heart', 'the courage to begin again', 'a voice lifting the room', 'love learning to breathe again'],
    ['Alza la voce insieme a me', 'Siamo ancora qui per amare', 'Lascia che il cuore trovi casa', 'Questa luce non si spegnerà'],
    ['Raise your voice with me', 'We are still here to love', 'Let the heart find a home', 'This light will not go out']),
  'funky house': p('anthemic',
    ['un basso che sorride', 'chitarre che tagliano la notte', 'la pista che diventa festa', 'un ritornello che non vuole stare fermo'],
    ['a bassline that smiles', 'guitars cutting through the night', 'the floor turning into a party', 'a chorus that refuses to stand still'],
    ['Fallo funky, fallo adesso', 'Metti il sorriso dentro il groove', 'Tutta la notte senza frenare', 'Quel basso mi riporta qui'],
    ['Make it funky, make it now', 'Put a smile inside the groove', 'All night without slowing down', 'That bassline brings me back']),
  'french house': p('anthemic',
    ['un frammento disco che torna diverso', 'la luce filtrata sopra i vetri', 'un loop che diventa desiderio', 'la città compressa dentro un battito'],
    ['a disco fragment returning transformed', 'filtered light across the glass', 'a loop becoming desire', 'the city compressed into one heartbeat'],
    ['Filtra la notte, fammela sentire', 'Ancora quel loop, ancora noi', 'Brilla tutto quando entra il basso', 'Lascia pompare questa memoria'],
    ['Filter the night, let me feel it', 'That loop again, us again', 'Everything shines when the bass comes in', 'Let this memory keep pumping']),
  'filter house': p('sparse',
    ['il suono che si apre lentamente', 'frequenze che tornano alla luce', 'un loop nascosto dietro il filtro', 'la tensione prima che tutto esploda'],
    ['the sound opening slowly', 'frequencies returning to the light', 'a loop hidden behind the filter', 'the tension before everything opens'],
    ['Apri il filtro, fammi entrare', 'Togli il buio da questo suono', 'Ancora un giro, ancora più su', 'Quando si apre, restiamo qui'],
    ['Open the filter, let me in', 'Pull the darkness off this sound', 'One more turn, take it higher', 'When it opens, we stay here']),
  'disco house': p('anthemic',
    ['specchi e luci sulla pista', 'archi che salgono sopra il basso', 'un amore nato dentro un ritornello', 'la notte vestita di oro'],
    ['mirrors and lights on the floor', 'strings rising above the bass', 'a love born inside a chorus', 'the night dressed in gold'],
    ['Brilla con me fino all’alba', 'Questa pista è tutta nostra', 'L’amore gira a quattro quarti', 'Non spegnere quelle luci'],
    ['Shine with me until sunrise', 'This dance floor is all ours', 'Love is moving in four-four', 'Do not turn those lights off']),
  'jackin house': p('raw',
    ['un sample spezzato che prende vita', 'il clap che spinge il corpo avanti', 'un basso elastico sotto i piedi', 'la pista che salta fuori tempo'],
    ['a chopped sample coming alive', 'the clap pushing the body forward', 'an elastic bass under our feet', 'the floor jumping around the beat'],
    ['Jack it up, torna nel groove', 'Taglia il sample, fallo girare', 'Quel clap mi spinge ancora', 'Non stare fermo, jack it'],
    ['Jack it up, get back in the groove', 'Cut the sample, spin it again', 'That clap keeps pushing me', 'Do not stand still, jack it']),
  'acid house': p('raw',
    ['una linea acida che cambia faccia', 'il filtro che sale fino a bruciare', 'un magazzino pieno di risonanza', 'la notte che si piega alla sequenza'],
    ['an acid line changing shape', 'the filter rising until it burns', 'a warehouse full of resonance', 'the night bending to the sequence'],
    ['Acido dentro, fallo salire', 'Gira la manopola, ancora più su', 'Quella linea non finisce mai', 'Squelch nella notte, resta qui'],
    ['Acid inside, take it higher', 'Turn the knob, push it again', 'That line never ends', 'Squelch in the night, stay here']),
  'electro house': p('anthemic',
    ['un riff tagliente sopra il kick', 'energia elettrica nella stanza', 'il momento prima dell’impatto', 'una notte fatta di scintille'],
    ['a sharp riff over the kick', 'electric energy in the room', 'the moment before impact', 'a night made of sparks'],
    ['Accendi tutto, fallo esplodere', 'Senti l’elettricità salire', 'Quando cade il drop restiamo su', 'Nessuno spegne questa scarica'],
    ['Light it up, let it explode', 'Feel the electricity rising', 'When the drop lands we stay high', 'Nobody shuts this current down']),
  'future house': p('anthemic',
    ['un basso elastico che rimbalza', 'voci tagliate dentro la luce', 'una città brillante e veloce', 'il futuro che entra dalla pista'],
    ['a bouncy bassline springing back', 'chopped voices inside the light', 'a bright fast-moving city', 'the future entering through the floor'],
    ['Rimbalza con me dentro il suono', 'Il futuro comincia adesso', 'Più in alto quando entra il basso', 'Questa luce non sta ferma'],
    ['Bounce with me inside the sound', 'The future starts right now', 'Higher when the bass comes in', 'This light will not stand still']),
  'bass house': p('raw',
    ['un sub che muove le pareti', 'il basso che risponde al kick', 'ombre spezzate sopra la pista', 'energia scura sotto la pelle'],
    ['a sub moving the walls', 'the bass answering the kick', 'broken shadows over the floor', 'dark energy under the skin'],
    ['Giù col basso, dentro il corpo', 'Fai tremare tutta la stanza', 'Kick e bass, niente di più', 'Questa notte pesa forte'],
    ['Bass down, inside the body', 'Make the whole room shake', 'Kick and bass, nothing more', 'This night hits heavy']),
  'big room house': p('anthemic',
    ['migliaia di mani sopra il cielo', 'un conto alla rovescia prima del salto', 'il kick che attraversa la folla', 'una luce enorme sopra il palco'],
    ['thousands of hands under the sky', 'a countdown before the jump', 'the kick running through the crowd', 'a huge light above the stage'],
    ['Tre, due, uno, salta con me', 'Tutto il cielo sopra di noi', 'Questo momento è gigantesco', 'Mani in alto fino al drop'],
    ['Three, two, one, jump with me', 'The whole sky above us', 'This moment is enormous', 'Hands up until the drop']),
  'organic house': p('deep',
    ['vento caldo sulle mani', 'una strada tra terra e cielo', 'strumenti che respirano con noi', 'un viaggio lento verso la luce'],
    ['warm wind across our hands', 'a road between earth and sky', 'instruments breathing with us', 'a slow journey toward the light'],
    ['Cammina piano dentro il suono', 'Lascia che la terra ci guidi', 'Respira insieme a questa notte', 'La strada vive sotto i piedi'],
    ['Walk slowly inside the sound', 'Let the earth guide us', 'Breathe together with this night', 'The road is alive beneath our feet']),
  'latin house': p('percussive',
    ['mani che seguono la clave', 'piano e percussioni che si rincorrono', 'calore che sale dalla pista', 'una notte piena di movimento'],
    ['hands following the clave', 'piano and percussion chasing each other', 'heat rising from the floor', 'a night full of movement'],
    ['Dale, muoviti dentro il ritmo', 'Senti la clave, vieni con me', 'Calore fino al mattino', 'Questa pista non si ferma'],
    ['Dale, move inside the rhythm', 'Feel the clave, come with me', 'Heat until the morning', 'This floor will not stop']),
  'minimal house': p('sparse',
    ['un dettaglio che cambia tutto', 'silenzio tra kick e basso', 'un frammento di voce che ritorna', 'pochi suoni nel posto giusto'],
    ['one detail changing everything', 'silence between kick and bass', 'a vocal fragment returning', 'a few sounds in exactly the right place'],
    ['Poco basta, resta nel groove', 'Togli tutto, lascia il battito', 'Una parola, poi silenzio', 'Ancora meno, ancora più dentro'],
    ['Less is enough, stay in the groove', 'Take it away, leave the pulse', 'One word, then silence', 'Even less, even deeper']),
  microhouse: p('sparse',
    ['piccoli frammenti tra i battiti', 'click che diventano ritmo', 'una voce ridotta a granelli', 'dettagli che cambiano ad ogni giro'],
    ['tiny fragments between the beats', 'clicks turning into rhythm', 'a voice reduced to grains', 'details changing every cycle'],
    ['Piccolo suono, grande movimento', 'Taglia la voce, falla brillare', 'Tra un click e l’altro resto qui', 'Ogni frammento cambia il groove'],
    ['Tiny sound, big movement', 'Slice the voice, make it shine', 'I stay here between the clicks', 'Every fragment changes the groove']),
  'lo fi house': p('deep',
    ['un nastro che gira nella memoria', 'accordi stonati di poco', 'pioggia dietro una finestra', 'una notte sfocata che sembra ieri'],
    ['a tape turning inside a memory', 'chords slightly out of tune', 'rain behind a window', 'a blurred night that feels like yesterday'],
    ['Resta dentro questa vecchia luce', 'Il nastro gira ancora per noi', 'Sporco il suono, non il ricordo', 'Questa notte sembra già lontana'],
    ['Stay inside this old light', 'The tape keeps turning for us', 'Make the sound dirty, not the memory', 'This night already feels far away']),
  'g house': p('raw',
    ['una voce bassa dentro il club', 'swagger sopra il quattro quarti', 'strade scure dietro le luci', 'un basso pesante che detta le regole'],
    ['a low voice inside the club', 'swagger over four-four', 'dark streets behind the lights', 'a heavy bassline making the rules'],
    ['Cammina lento, basso pesante', 'Niente fretta, guarda il groove', 'Parla poco, fallo sentire', 'Questa notte detta le regole'],
    ['Walk slow, bass heavy', 'No rush, watch the groove', 'Talk less, make it felt', 'This night makes the rules']),
  'garage house': p('soulful',
    ['una voce gospel sopra il groove', 'l’organo che riempie la stanza', 'un amore cantato senza difese', 'la pista che diventa comunità'],
    ['a gospel voice above the groove', 'the organ filling the room', 'a love sung without defenses', 'the floor becoming a community'],
    ['Canta con me, non avere paura', 'Questa casa è piena di voce', 'Alza il cuore sopra il groove', 'Siamo insieme dentro questa notte'],
    ['Sing with me, do not be afraid', 'This house is full of voices', 'Lift your heart above the groove', 'We are together inside this night']),
  'hard house': p('raw',
    ['il kick che non lascia spazio', 'energia rave fino al limite', 'un comando urlato prima del salto', 'la notte spinta oltre la velocità'],
    ['a kick leaving no space', 'rave energy pushed to the limit', 'a shouted command before the jump', 'the night pushed beyond speed'],
    ['Più forte, ancora più forte', 'Non rallentare adesso', 'Kick duro, cuore acceso', 'Spingi tutto fino al limite'],
    ['Harder, push it harder', 'Do not slow down now', 'Hard kick, heart on fire', 'Push everything to the limit']),
  'piano house': p('soulful',
    ['un piano che apre il cielo', 'accordi che fanno cantare la pista', 'un ritornello pieno di luce', 'la gioia che torna ad ogni battuta'],
    ['a piano opening the sky', 'chords making the floor sing', 'a chorus full of light', 'joy returning every bar'],
    ['Suona quel piano ancora per me', 'Ogni accordo ci porta più su', 'Questa gioia entra dal cuore', 'Lascia il piano parlare stanotte'],
    ['Play that piano for me again', 'Every chord takes us higher', 'This joy comes through the heart', 'Let the piano speak tonight']),
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

export function hasHouseLyricsProfile(subgenre: string): boolean {
  return Boolean(HOUSE_LYRIC_PROFILES[normalize(subgenre)]);
}

function rotate<T>(values: readonly T[], offset: number): T[] {
  if (!values.length) return [];
  const safe = ((offset % values.length) + values.length) % values.length;
  return [...values.slice(safe), ...values.slice(0, safe)];
}

function labels(language: string) {
  if (language === 'it' || language === 'nap') {
    return {
      verse1: 'Strofa 1', verse2: 'Strofa 2', verse3: 'Strofa 3', pre: 'Pre-Ritornello', chorus: 'Ritornello', post: 'Post-Ritornello', bridge: 'Bridge', breakdown: 'Breakdown', final: 'Ritornello Finale', outro: 'Outro',
      male: 'Voce maschile', female: 'Voce femminile', together: 'Insieme'
    };
  }
  return {
    verse1: 'Verse 1', verse2: 'Verse 2', verse3: 'Verse 3', pre: 'Pre-Chorus', chorus: 'Chorus', post: 'Post-Chorus', bridge: 'Bridge', breakdown: 'Breakdown', final: 'Final Chorus', outro: 'Outro',
    male: 'Male voice', female: 'Female voice', together: 'Together'
  };
}

function section(label: string, vocalMode: VocalMode, role: 'first' | 'second' | 'together', language: string): string {
  if (vocalMode !== 'duet') return `[${label}]`;
  const l = labels(language);
  const voice = role === 'first' ? l.male : role === 'second' ? l.female : l.together;
  return `[${label} - ${voice}]`;
}

function italianLines(profile: HouseLyricProfile, mood: string, variant: number) {
  const c = rotate(profile.conceptsIt, variant);
  const h = rotate(profile.hooksIt, variant);
  const moodText = mood ? mood.toLowerCase() : 'profondo';
  const sparse = profile.delivery === 'sparse' || profile.delivery === 'raw' || profile.delivery === 'percussive';
  return {
    verse1: sparse
      ? [`Dentro ${c[0]}`, `il corpo segue ${c[1]}`, `nessun pensiero fuori tempo`, `resta soltanto ${c[2]}`]
      : [`Cammino dentro ${c[0]}`, `mentre la notte diventa ${moodText}`, `porto con me ${c[1]}`, `e ogni battito cambia ${c[2]}`],
    pre1: sparse
      ? [`Senti come cambia il battito`, `adesso lascia entrare ${c[3]}`]
      : [`Non serve sapere dove andremo`, `basta sentire ${c[3]}`],
    chorus: [h[0], h[1], h[0], h[2]],
    post: sparse ? [h[3], h[3]] : [h[3], `resta qui, resta dentro il suono`],
    verse2: sparse
      ? [`Il kick ritorna sotto i piedi`, `il basso stringe ${c[3]}`, `una voce taglia il silenzio`, `e il groove riparte da ${c[0]}`]
      : [`Sotto le luci ritrovo ${c[2]}`, `ogni distanza perde il nome`, `la musica apre ${c[3]}`, `e torna a respirare ${c[0]}`],
    pre2: sparse
      ? [`Ancora un giro, senza fermarti`, `lascia parlare soltanto il ritmo`]
      : [`Se la notte ci porta più lontano`, `questa melodia saprà seguirci`],
    breakdown: sparse
      ? [`Togli tutto, lascia il respiro`, `poi riporta il basso dentro`]
      : [`Per un momento resta soltanto il cielo`, `poi il battito ci ritrova`],
    verse3: sparse
      ? [`Poche parole, stessa direzione`, `più pressione dentro il suono`, `la stanza risponde al richiamo`, `e ricomincia da ${c[1]}`]
      : [`Quando il tempo sembra rallentare`, `vedo più chiaro ${c[1]}`, `non ho bisogno di tornare indietro`, `se davanti resta ${c[3]}`],
    bridge: sparse
      ? [`Non cambiare il passo adesso`, `porta il groove fino alla fine`]
      : [`Se domani avrà un altro colore`, `questa notte resterà con noi`],
    outro: sparse ? [h[0], `ancora una volta`] : [h[0], `finché il suono si allontana`]
  };
}

function englishLines(profile: HouseLyricProfile, mood: string, variant: number) {
  const c = rotate(profile.conceptsEn, variant);
  const h = rotate(profile.hooksEn, variant);
  const moodText = mood ? mood.toLowerCase() : 'deep';
  const sparse = profile.delivery === 'sparse' || profile.delivery === 'raw' || profile.delivery === 'percussive';
  return {
    verse1: sparse
      ? [`Inside ${c[0]}`, `the body follows ${c[1]}`, `no thought outside the pulse`, `only ${c[2]} remains`]
      : [`I move inside ${c[0]}`, `while the night turns ${moodText}`, `I carry ${c[1]} with me`, `and every heartbeat changes ${c[2]}`],
    pre1: sparse
      ? [`Feel the pulse changing now`, `let ${c[3]} come in`]
      : [`We do not need to know the destination`, `we only need to feel ${c[3]}`],
    chorus: [h[0], h[1], h[0], h[2]],
    post: sparse ? [h[3], h[3]] : [h[3], `stay here, stay inside the sound`],
    verse2: sparse
      ? [`The kick returns beneath our feet`, `the bass pulls ${c[3]} closer`, `one voice cuts through the silence`, `and the groove begins with ${c[0]} again`]
      : [`Under the lights I find ${c[2]}`, `every distance loses its name`, `the music opens ${c[3]}`, `and ${c[0]} starts breathing again`],
    pre2: sparse
      ? [`One more cycle, do not stop`, `let the rhythm do the talking`]
      : [`If the night takes us farther`, `this melody will follow`],
    breakdown: sparse
      ? [`Take it all away, leave the breath`, `then bring the bass back in`]
      : [`For one moment only the sky remains`, `then the heartbeat finds us again`],
    verse3: sparse
      ? [`Few words, same direction`, `more pressure inside the sound`, `the room answers the call`, `and starts again from ${c[1]}`]
      : [`When time begins to slow down`, `I can see ${c[1]} more clearly`, `I do not need to turn around`, `while ${c[3]} stays ahead`],
    bridge: sparse
      ? [`Do not change the step now`, `carry the groove to the end`]
      : [`If tomorrow comes in another color`, `this night will stay with us`],
    outro: sparse ? [h[0], `one more time`] : [h[0], `until the sound fades into distance`]
  };
}

export function buildHouseLyrics({ language, subgenre, mood, vocalMode, variant, durationSec = 180 }: HouseLyricsInput): string {
  const profile = HOUSE_LYRIC_PROFILES[normalize(subgenre)] || HOUSE_LYRIC_PROFILES.house;
  const localized = language === 'it' || language === 'nap'
    ? italianLines(profile, mood, variant)
    : englishLines(profile, mood, variant);
  const l = labels(language);

  const blocks: string[][] = [
    [section(l.verse1, vocalMode, 'first', language), ...localized.verse1],
    [section(l.pre, vocalMode, 'first', language), ...localized.pre1],
    [section(l.chorus, vocalMode, 'together', language), ...localized.chorus],
    [section(l.post, vocalMode, 'together', language), ...localized.post],
    [section(l.verse2, vocalMode, 'second', language), ...localized.verse2],
    [section(l.pre, vocalMode, 'second', language), ...localized.pre2],
    [section(l.chorus, vocalMode, 'together', language), ...localized.chorus],
    [section(l.breakdown, vocalMode, 'together', language), ...localized.breakdown],
  ];

  if (durationSec >= 240) {
    blocks.push([section(l.verse3, vocalMode, 'first', language), ...localized.verse3]);
  }

  blocks.push(
    [section(l.bridge, vocalMode, 'together', language), ...localized.bridge],
    [section(l.final, vocalMode, 'together', language), ...localized.chorus],
  );

  if (durationSec >= 180) {
    blocks.push([section(l.outro, vocalMode, 'together', language), ...localized.outro]);
  }

  return blocks.map(block => block.join('\n')).join('\n\n');
}

export const HOUSE_LYRICS_PROFILE_COUNT = Object.keys(HOUSE_LYRIC_PROFILES).length;
