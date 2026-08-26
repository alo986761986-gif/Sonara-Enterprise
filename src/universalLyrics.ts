import type { VocalMode } from './generationPrompt';
import { getMusicStyleProfile } from './musicStyleIntelligence';

export interface UniversalLyricsInput {
  language: string;
  genreFamily: string;
  genre: string;
  subgenre: string;
  mood: string;
  vocalMode: VocalMode;
  variant: number;
  durationSec?: number;
}

type LyricMode = 'urban' | 'pop' | 'rock' | 'heavy' | 'soul' | 'jazz' | 'roots' | 'latin' | 'world' | 'folk' | 'classical' | 'gospel' | 'cinematic' | 'experimental' | 'lounge' | 'children';

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

function modeForFamily(family: string): LyricMode {
  const key = normalize(family);
  if (key === 'hip hop rap' || key === 'neomelodica napoletana') return 'urban';
  if (key === 'pop') return 'pop';
  if (key === 'rock') return 'rock';
  if (key === 'metal') return 'heavy';
  if (key === 'r b soul funk') return 'soul';
  if (key === 'jazz' || key === 'blues') return 'jazz';
  if (key === 'reggae jamaican' || key === 'country americana') return 'roots';
  if (key === 'latin america' || key === 'caribbean') return 'latin';
  if (['africa', 'middle east north africa', 'south asia', 'east asia', 'southeast asia'].includes(key)) return 'world';
  if (key === 'folk traditional europe') return 'folk';
  if (key === 'classical art music') return 'classical';
  if (key === 'gospel spiritual') return 'gospel';
  if (key === 'cinematic media') return 'cinematic';
  if (key === 'experimental avant garde') return 'experimental';
  if (key === 'easy listening lounge') return 'lounge';
  if (key === 'children novelty spoken') return 'children';
  return 'pop';
}

const IMAGE_BANK: Record<LyricMode, { it: string[]; en: string[] }> = {
  urban: { it: ['strade accese', 'scelte vere', 'fame di futuro', 'voce della città'], en: ['lit streets', 'real choices', 'hunger for tomorrow', 'the voice of the city'] },
  pop: { it: ['luce che ritorna', 'un momento da ricordare', 'cuori in movimento', 'un nuovo inizio'], en: ['light returning', 'a moment to remember', 'hearts in motion', 'a new beginning'] },
  rock: { it: ['amplificatori accesi', 'una strada senza paura', 'polvere e libertà', 'un coro contro il silenzio'], en: ['amplifiers burning', 'a road without fear', 'dust and freedom', 'a chorus against silence'] },
  heavy: { it: ['ferro e tempesta', 'ombre che si alzano', 'forza dentro le ferite', 'un giuramento nel rumore'], en: ['iron and storm', 'shadows rising', 'strength inside the scars', 'an oath inside the noise'] },
  soul: { it: ['un cuore senza difese', 'calore nella voce', 'una promessa sincera', 'il groove che ci riporta a casa'], en: ['an unguarded heart', 'warmth inside the voice', 'an honest promise', 'the groove bringing us home'] },
  jazz: { it: ['una notte piena di sfumature', 'frasi che cambiano direzione', 'un bicchiere e una memoria', 'il tempo che respira libero'], en: ['a night full of shades', 'phrases changing direction', 'a glass and a memory', 'time breathing freely'] },
  roots: { it: ['terra sotto le scarpe', 'una storia tramandata', 'vento sulla strada', 'una voce semplice e vera'], en: ['earth beneath our shoes', 'a story handed down', 'wind on the road', 'a simple truthful voice'] },
  latin: { it: ['calore sulla pelle', 'mani che seguono il ritmo', 'una notte piena di colore', 'il cuore che balla senza paura'], en: ['heat on the skin', 'hands following the rhythm', 'a night full of color', 'the heart dancing without fear'] },
  world: { it: ['radici che parlano', 'un canto che attraversa il tempo', 'terra e cielo nello stesso passo', 'una comunità che risponde'], en: ['roots speaking', 'a song crossing time', 'earth and sky in the same step', 'a community answering'] },
  folk: { it: ['una piazza al tramonto', 'una storia antica', 'legno, corde e memoria', 'una voce che conosce la strada'], en: ['a square at sunset', 'an old story', 'wood strings and memory', 'a voice that knows the road'] },
  classical: { it: ['un tema che prende forma', 'silenzio prima della frase', 'tensione che cerca risoluzione', 'un gesto musicale senza tempo'], en: ['a theme taking shape', 'silence before the phrase', 'tension seeking resolution', 'a timeless musical gesture'] },
  gospel: { it: ['luce dopo la prova', 'mani alzate insieme', 'fede che diventa voce', 'speranza che cresce nel coro'], en: ['light after the trial', 'hands raised together', 'faith becoming a voice', 'hope growing inside the choir'] },
  cinematic: { it: ['un orizzonte che si apre', 'una scena che cambia destino', 'il respiro prima del climax', 'una memoria grande come lo schermo'], en: ['a horizon opening', 'a scene changing destiny', 'the breath before the climax', 'a memory as wide as the screen'] },
  experimental: { it: ['parole fuori asse', 'frammenti che cambiano significato', 'rumore trasformato in segnale', 'una forma che rifiuta il confine'], en: ['words off axis', 'fragments changing meaning', 'noise transformed into signal', 'a form refusing borders'] },
  lounge: { it: ['luci soffuse', 'una stanza elegante', 'tempo che scorre piano', 'un sorriso dentro la notte'], en: ['soft lights', 'an elegant room', 'time moving slowly', 'a smile inside the night'] },
  children: { it: ['stelle da contare', 'una strada piena di giochi', 'una domanda curiosa', 'un piccolo sogno colorato'], en: ['stars to count', 'a road full of games', 'a curious question', 'a small colorful dream'] }
};

function rotate(values: string[], offset: number): string[] {
  const safe = ((offset % values.length) + values.length) % values.length;
  return [...values.slice(safe), ...values.slice(0, safe)];
}

function labels(language: string) {
  const it = language === 'it' || language === 'nap';
  return it
    ? { verse1: 'Strofa 1', verse2: 'Strofa 2', verse3: 'Strofa 3', pre: 'Pre-Ritornello', chorus: 'Ritornello', bridge: 'Bridge', breakdown: 'Breakdown', final: 'Ritornello Finale', outro: 'Outro', male: 'Voce maschile', female: 'Voce femminile', together: 'Insieme' }
    : { verse1: 'Verse 1', verse2: 'Verse 2', verse3: 'Verse 3', pre: 'Pre-Chorus', chorus: 'Chorus', bridge: 'Bridge', breakdown: 'Breakdown', final: 'Final Chorus', outro: 'Outro', male: 'Male voice', female: 'Female voice', together: 'Together' };
}

function section(label: string, vocalMode: VocalMode, role: 'first' | 'second' | 'together', language: string): string {
  if (vocalMode !== 'duet') return `[${label}]`;
  const l = labels(language);
  return `[${label} - ${role === 'first' ? l.male : role === 'second' ? l.female : l.together}]`;
}

function profileCue(identity: string, subgenre: string): string {
  const cleaned = String(identity || '').replace(/\s+/g, ' ').trim();
  const withoutName = cleaned.replace(new RegExp(subgenre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').trim();
  return (withoutName || cleaned).slice(0, 90).replace(/[.!?]+$/, '');
}

export function buildUniversalLyrics({ language, genreFamily, genre, subgenre, mood, vocalMode, variant, durationSec = 180 }: UniversalLyricsInput): string {
  const mode = modeForFamily(genreFamily);
  const images = IMAGE_BANK[mode];
  const localized = language === 'it' || language === 'nap' ? images.it : images.en;
  const c = rotate(localized, variant);
  const profile = getMusicStyleProfile(genreFamily, genre, subgenre);
  const cue = profileCue(profile.identity, subgenre);
  const l = labels(language);
  const italian = language === 'it' || language === 'nap';
  const atmosphere = String(mood || (italian ? 'autentica' : 'authentic')).toLowerCase();
  const genrePhrase = `${subgenre}`;

  const verse1 = italian
    ? [`Dentro ${c[0]}`, `porto il carattere di ${genrePhrase}`, `l’atmosfera diventa ${atmosphere}`, `e ${c[1]} cambia il modo di respirare`]
    : [`Inside ${c[0]}`, `I carry the character of ${genrePhrase}`, `the atmosphere turns ${atmosphere}`, `and ${c[1]} changes the way we breathe`];
  const pre1 = italian
    ? [`Sento ${c[2]} venire più vicino`, `questa storia appartiene a ${genrePhrase}`]
    : [`I feel ${c[2]} coming closer`, `this story belongs to ${genrePhrase}`];
  const chorus = italian
    ? [`Resta con me dentro ${c[3]}`, `lascia parlare ${genrePhrase}`, `Resta con me dentro ${c[0]}`, `finché ${c[1]} diventa verità`]
    : [`Stay with me inside ${c[3]}`, `let ${genrePhrase} speak`, `Stay with me inside ${c[0]}`, `until ${c[1]} becomes real`];
  const verse2 = italian
    ? [`Ogni passo porta un dettaglio diverso`, `il suono conserva ${cue}`, `sotto la pelle ritorna ${c[2]}`, `e il cammino riparte da ${c[3]}`]
    : [`Every step carries a different detail`, `the sound keeps ${cue}`, `beneath the skin ${c[2]} returns`, `and the journey begins again from ${c[3]}`];
  const breakdown = italian
    ? [`Per un momento resta solo il respiro`, `poi ritorna l’identità di ${genrePhrase}`]
    : [`For one moment only the breath remains`, `then the identity of ${genrePhrase} returns`];
  const verse3 = italian
    ? [`Il tempo apre un’altra direzione`, `la voce cambia senza perdere radici`, `${c[0]} incontra ${c[2]}`, `e l’atmosfera resta ${atmosphere}`]
    : [`Time opens another direction`, `the voice changes without losing its roots`, `${c[0]} meets ${c[2]}`, `and the atmosphere remains ${atmosphere}`];
  const bridge = italian
    ? [`Se cambia il mondo intorno a noi`, `${genrePhrase} conserva la sua anima`]
    : [`If the world around us changes`, `${genrePhrase} keeps its soul`];
  const outro = italian ? [chorus[0], `finché resta ${c[3]}`] : [chorus[0], `while ${c[3]} remains`];

  const blocks: string[][] = [
    [section(l.verse1, vocalMode, 'first', language), ...verse1],
    [section(l.pre, vocalMode, 'first', language), ...pre1],
    [section(l.chorus, vocalMode, 'together', language), ...chorus],
    [section(l.verse2, vocalMode, 'second', language), ...verse2],
    [section(l.chorus, vocalMode, 'together', language), ...chorus],
    [section(l.breakdown, vocalMode, 'together', language), ...breakdown]
  ];

  if (durationSec >= 240) blocks.push([section(l.verse3, vocalMode, 'first', language), ...verse3]);
  blocks.push(
    [section(l.bridge, vocalMode, 'together', language), ...bridge],
    [section(l.final, vocalMode, 'together', language), ...chorus]
  );
  if (durationSec >= 180) blocks.push([section(l.outro, vocalMode, 'together', language), ...outro]);

  return blocks.map(block => block.join('\n')).join('\n\n');
}
