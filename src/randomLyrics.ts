import type { VocalMode } from './generationPrompt';

interface RandomLyricsInput {
  language: string;
  genre: string;
  subgenre: string;
  mood: string;
  vocalMode: VocalMode;
  variant: number;
}

interface LyricsVariant {
  verse1: string[];
  preChorus: string[];
  chorus: string[];
  verse2: string[];
  bridge: string[];
}

const italianLyrics: LyricsVariant[] = [
  {
    verse1: [
      'Scende piano la notte sui vetri',
      'la città cambia pelle con noi',
      'ogni luce ci chiama da lontano',
      'e il silenzio non basta mai',
    ],
    preChorus: ['Sento il battito salire', 'come un segnale dentro me'],
    chorus: [
      'Portami dove il cielo si accende',
      'dove la paura non ci prende',
      'questa notte non finisce qui',
      'resta ancora, resta qui con me',
    ],
    verse2: [
      'Passi veloci sopra l’asfalto',
      'una promessa stretta tra noi',
      'anche il vento conosce il tuo nome',
      'e lo ripete più forte che può',
    ],
    bridge: ['Se domani cambierà la strada', 'questa luce ci ritroverà'],
  },
  {
    verse1: [
      'Ho raccolto i giorni dalle tasche',
      'fotografie che non guardavo più',
      'tra le crepe è entrato un nuovo sole',
      'e mi ha riportato fino a te',
    ],
    preChorus: ['Non c’è distanza da temere', 'quando il cuore sa già dove andare'],
    chorus: [
      'Chiamami quando cade il mondo',
      'sarò la voce dentro al rumore',
      'stringimi ancora per un secondo',
      'e ricominciamo senza paura',
    ],
    verse2: [
      'Ogni errore diventa una porta',
      'se troviamo il coraggio di aprirla',
      'le parole rimaste sospese',
      'questa volta sapranno volare',
    ],
    bridge: ['Non siamo quello che abbiamo perso', 'siamo il passo che viene adesso'],
  },
  {
    verse1: [
      'Sono caduto contando le stelle',
      'ma ogni ferita mi ha insegnato a stare',
      'con le mani sporche di futuro',
      'ho disegnato un’altra direzione',
    ],
    preChorus: ['Alzo il volume dei miei sogni', 'non torno indietro proprio adesso'],
    chorus: [
      'Corro più forte del temporale',
      'oltre ogni limite da attraversare',
      'se questa vita mi sfida ancora',
      'io sono pronto, è la mia ora',
    ],
    verse2: [
      'Lascio a terra tutte le scuse',
      'porto con me soltanto verità',
      'ogni respiro diventa benzina',
      'per arrivare dove nessuno sa',
    ],
    bridge: ['Anche nel buio riconosco la strada', 'la mia voce non si fermerà'],
  },
  {
    verse1: [
      'Sale il profumo del mare la sera',
      'sulla tua pelle rimane l’estate',
      'ballano lente le ombre leggere',
      'mentre le onde cancellano il tempo',
    ],
    preChorus: ['Lascia che il vento ci porti lontano', 'senza una mappa, soltanto per mano'],
    chorus: [
      'Sotto lo stesso sole',
      'siamo due battiti e un solo colore',
      'fino all’ultima canzone',
      'rimani qui dentro questa emozione',
    ],
    verse2: [
      'Brillano gli occhi tra mille riflessi',
      'la luna ci guarda cambiare orizzonte',
      'non serve dire che cosa saremo',
      'se questo istante ci basta davvero',
    ],
    bridge: ['E quando l’alba ci sorprenderà', 'il nostro ritmo continuerà'],
  },
];

const neapolitanLyrics: LyricsVariant[] = [
  {
    verse1: [
      "'A notte scenne doce 'ncopp' 'e strate",
      "'o mare parla piano cu 'a città",
      "io cammino e penso sulo a tte",
      "pecché stu core nun te vo' lassà",
    ],
    preChorus: ["E quanno 'o viento chiamma 'o nomme tuo", "me pare ca turnasse ccà cu mme"],
    chorus: [
      "Resta cu mme, nun te ne jì",
      "senza 'e te nun saccio cchiù campà",
      "Napule canta dint' a stu core",
      "e ogni parola parla ancora 'e nuje",
    ],
    verse2: [
      "Sott' 'e balcone dorme 'a luna",
      "na luce lenta cade 'ncopp' 'o mare",
      "si me guardi nun me serve niente",
      "pecché cu tte me basta respirà",
    ],
    bridge: ["Si dimane cambia pure 'o tiempo", "io te cerco addó fernesce 'o mare"],
  },
  {
    verse1: [
      "Aggio tenuto 'e parole dint' 'o core",
      "senza sapé comme te l'aggia dì",
      "ogni ricordo torna tutte 'e sere",
      "e dint' 'o suonno staje vicino a mme",
    ],
    preChorus: ["Nun ce sta strada ca me porta luntano", "si 'a voce toja me chiamma ancora ccà"],
    chorus: [
      "Chiamme 'o nomme mio, famme turnà",
      "stringeme forte e nun parlà",
      "stu sentimento nun se po' scurdà",
      "è nato a Napule e nun fernesce maje",
    ],
    verse2: [
      "'E juorne passano comme 'o viento",
      "ma certi vase restano cu mme",
      "nun voglio perdere n'ato mumento",
      "si ancora 'o core batte pe' tte",
    ],
    bridge: ["E si 'a vita ce mette paura", "nuje ce tenimme ancora pe' mmane"],
  },
  {
    verse1: [
      "Me so' scetato cu 'o sole 'nfaccia",
      "cu mille penziere e na verità",
      "aggio deciso ca nun torno arreto",
      "sta vita mo' me l'aggia piglià",
    ],
    preChorus: ["Sento 'o sanghe ca corre cchiù forte", "e na voce me dice: va' annanze"],
    chorus: [
      "Corro cchiù forte d' 'o viento",
      "nun tengo paura 'e cadé",
      "Napule mia damme curaggio",
      "ca mo' è arrivato 'o tiempo pe' mme",
    ],
    verse2: [
      "Lasso 'e scuse fore d' 'a porta",
      "porto sulamente chello ca so'",
      "ogni ferita m'ha fatto cchiù forte",
      "e mo' nisciuno me ferma cchiù",
    ],
    bridge: ["Pure si 'a notte addeventa cchiù scura", "io veco 'a strada cu ll'uocchie d' 'o core"],
  },
  {
    verse1: [
      "Profuma 'e sale stasera 'o mare",
      "'a luna se specchia vicino a nuje",
      "na musica doce saglie d' 'e vicule",
      "e pare ca 'o tiempo se ferma pe' nuje",
    ],
    preChorus: ["Dammi 'a mano e nun guardà luntano", "sta sera basta sulamente nuje"],
    chorus: [
      "Sott' 'o stesso cielo 'e Napule",
      "duje core fanno na canzone",
      "ballammo fino a quanno vene 'o sole",
      "senza penzà a dimane e a nisciuno",
    ],
    verse2: [
      "'E stelle tremmano 'ncopp' 'e terrazze",
      "'o viento porta 'a voce toja cu mme",
      "nun serve sapé chello ca succede",
      "si chistu mumento parla già pe' nuje",
    ],
    bridge: ["E quanno ll'alba ce trova abbracciate", "sta melodia nun se ne va cchiù"],
  },
];

const englishLyrics: LyricsVariant[] = [
  {
    verse1: [
      'Midnight paints the windows silver',
      'city lights are calling our names',
      'every shadow moves to the rhythm',
      'and nothing ever feels the same',
    ],
    preChorus: ['I can feel the heartbeat rising', 'like a signal in the dark'],
    chorus: [
      'Take me where the sky is burning',
      'where the fear can never find us',
      'we are only getting started',
      'stay a little longer by my side',
    ],
    verse2: [
      'Running through the open avenues',
      'with a promise held between us',
      'even the wind remembers your name',
      'and keeps on singing it out loud',
    ],
    bridge: ['If tomorrow turns the road around', 'this light will lead us home again'],
  },
  {
    verse1: [
      'I found our days inside my pockets',
      'old photographs I could not face',
      'then a new sun crossed the silence',
      'and every road led to this place',
    ],
    preChorus: ['There is no distance left to fear', 'when the heart already knows the way'],
    chorus: [
      'Call me when the whole world falls down',
      'I will be your voice inside the noise',
      'hold me for another second',
      'we can start again without the fear',
    ],
    verse2: [
      'Every mistake can be a doorway',
      'if we find the nerve to walk on through',
      'all the words we left there waiting',
      'finally learned how to fly',
    ],
    bridge: ['We are more than what we left behind', 'we are every step we take tonight'],
  },
  {
    verse1: [
      'I was falling while I counted stars',
      'every scar taught me how to stand',
      'with my hands still full of tomorrow',
      'I drew a road across the sand',
    ],
    preChorus: ['Turn the volume on my dreams up', 'I am not turning back this time'],
    chorus: [
      'I run faster than the thunder',
      'past every wall I have to climb',
      'if this life keeps pushing harder',
      'I am ready, this is my time',
    ],
    verse2: [
      'Leaving every excuse behind me',
      'carrying only what is true',
      'every breath becomes a fire',
      'lighting up a different view',
    ],
    bridge: ['Even in the dark I know the road', 'my voice will never disappear'],
  },
  {
    verse1: [
      'Summer lingers softly on the water',
      'golden colors resting on your skin',
      'shadows dance beneath the evening',
      'while the tide erases time again',
    ],
    preChorus: ['Let the warm wind carry us away', 'no map to follow, only your hand'],
    chorus: [
      'Underneath the same sun',
      'two hearts moving like a single color',
      'till the final song is done',
      'stay with me inside this feeling',
    ],
    verse2: [
      'Moonlight flickers in your eyes now',
      'as we turn toward another shore',
      'we do not need to name tomorrow',
      'when this moment gives us something more',
    ],
    bridge: ['When the morning finds us face to face', 'our rhythm will be carrying on'],
  },
];

const hashSelection = (value: string) => {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
};

const sectionLabel = (
  section: string,
  vocalMode: VocalMode,
  role: 'first' | 'second' | 'together',
  italianLabels: boolean,
) => {
  if (vocalMode !== 'duet') return `[${section}]`;
  const roles = italianLabels
    ? { first: 'Voce maschile', second: 'Voce femminile', together: 'Insieme' }
    : { first: 'Male voice', second: 'Female voice', together: 'Together' };
  return `[${section} - ${roles[role]}]`;
};

export const buildRandomLyrics = ({
  language,
  genre,
  subgenre,
  mood,
  vocalMode,
  variant,
}: RandomLyricsInput) => {
  const neapolitan = language === 'nap';
  const italian = language === 'it';
  const italianLabels = italian || neapolitan;
  const bank = neapolitan ? neapolitanLyrics : italian ? italianLyrics : englishLyrics;
  const selectionSeed = hashSelection(`${genre}|${subgenre}|${mood}`);
  const selected = bank[(selectionSeed + Math.max(0, Math.trunc(variant))) % bank.length];

  const blocks = [
    [sectionLabel('Verse 1', vocalMode, 'first', italianLabels), ...selected.verse1],
    [sectionLabel('Pre-Chorus', vocalMode, 'first', italianLabels), ...selected.preChorus],
    [sectionLabel('Chorus', vocalMode, 'together', italianLabels), ...selected.chorus],
    [sectionLabel('Verse 2', vocalMode, 'second', italianLabels), ...selected.verse2],
    [sectionLabel('Bridge', vocalMode, 'together', italianLabels), ...selected.bridge],
    [sectionLabel('Final Chorus', vocalMode, 'together', italianLabels), ...selected.chorus],
  ];

  return blocks.map(block => block.join('\n')).join('\n\n');
};