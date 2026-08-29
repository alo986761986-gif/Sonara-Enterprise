import { WORLD_MUSIC_GENRES } from './data/worldMusicGenres';

export type TempoEnergy = 'very-slow' | 'slow' | 'mid' | 'mid-fast' | 'fast' | 'very-fast' | 'extreme';

export type ProfessionalTempoProfile = {
  family: string;
  genre: string;
  subgenre: string;
  minBpm: number;
  maxBpm: number;
  idealBpm: number;
  energy: TempoEnergy;
  feel: string;
  rhythmicDensity: string;
  source: 'explicit-prompt' | 'prompt-subgenre' | 'subgenre' | 'genre' | 'family';
};

type CoreProfile = Omit<ProfessionalTempoProfile, 'family' | 'genre' | 'subgenre' | 'source'>;

const MIN_BPM = 40;
const MAX_BPM = 220;

function clampBpm(value: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value)));
}

function energyForBpm(bpm: number): TempoEnergy {
  if (bpm >= 190) return 'extreme';
  if (bpm >= 160) return 'very-fast';
  if (bpm >= 145) return 'fast';
  if (bpm >= 125) return 'mid-fast';
  if (bpm >= 90) return 'mid';
  if (bpm >= 70) return 'slow';
  return 'very-slow';
}

function densityForBpm(bpm: number): string {
  if (bpm >= 180) return 'extreme full-time subdivision density';
  if (bpm >= 160) return 'very dense full-time eighth/sixteenth-note motion';
  if (bpm >= 145) return 'dense fast rhythmic motion';
  if (bpm >= 125) return 'driving uptempo rhythmic motion';
  if (bpm >= 105) return 'active medium rhythmic motion';
  if (bpm >= 85) return 'balanced medium pocket';
  if (bpm >= 65) return 'relaxed spacious pocket';
  return 'very spacious slow pulse';
}

function core(minBpm: number, maxBpm: number, idealBpm: number, feel: string): CoreProfile {
  const bpm = clampBpm(idealBpm);
  return {
    minBpm: clampBpm(minBpm),
    maxBpm: clampBpm(maxBpm),
    idealBpm: bpm,
    energy: energyForBpm(bpm),
    feel,
    rhythmicDensity: densityForBpm(bpm)
  };
}

function normalize(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

const FAMILY_DEFAULTS: Record<string, CoreProfile> = {
  'electronic dance': core(100, 180, 128, 'electronic dance pulse'),
  'hip hop rap': core(70, 150, 94, 'hip-hop pocket'),
  'pop': core(85, 135, 116, 'modern pop pulse'),
  'rock': core(85, 175, 120, 'live rock drive'),
  'metal': core(70, 210, 145, 'heavy high-energy drive'),
  'r and b soul funk': core(65, 125, 92, 'soulful pocket'),
  'jazz': core(60, 210, 120, 'swinging or straight jazz pulse'),
  'blues': core(55, 145, 92, 'blues shuffle/straight pocket'),
  'reggae jamaican': core(65, 125, 82, 'laid-back Jamaican pulse'),
  'latin america': core(75, 190, 112, 'Latin dance pulse'),
  'africa': core(85, 190, 118, 'polyrhythmic African groove'),
  'caribbean': core(85, 180, 122, 'Caribbean dance groove'),
  'middle east north africa': core(70, 165, 110, 'MENA rhythmic pulse'),
  'south asia': core(55, 190, 112, 'South Asian rhythmic cycle'),
  'east asia': core(65, 165, 112, 'East Asian popular/traditional pulse'),
  'southeast asia': core(65, 185, 118, 'Southeast Asian pulse'),
  'country americana': core(70, 180, 112, 'country/Americana groove'),
  'folk traditional europe': core(60, 190, 112, 'European folk pulse'),
  'neomelodica napoletana': core(65, 135, 92, 'Neapolitan melodic song pulse'),
  'classical art music': core(40, 200, 100, 'art-music tempo'),
  'gospel spiritual': core(65, 160, 105, 'gospel/spiritual pulse'),
  'cinematic media': core(45, 160, 90, 'cinematic pacing'),
  'experimental avant garde': core(40, 220, 110, 'experimental pulse'),
  'easy listening lounge': core(60, 125, 92, 'relaxed lounge pulse'),
  'children novelty spoken': core(65, 150, 105, 'accessible song pulse')
};

const GENRE_DEFAULTS: Record<string, CoreProfile> = {
  house: core(116, 132, 124, 'four-on-the-floor house groove'),
  techno: core(122, 155, 135, 'driving techno grid'),
  trance: core(128, 150, 138, 'uplifting/trance drive'),
  'drum and bass': core(160, 180, 174, 'full-time breakbeat and bass motion'),
  dubstep: core(135, 150, 140, '140-grid bass music with optional half-time snare placement'),
  'uk garage': core(128, 138, 134, 'shuffled UK garage drive'),
  breakbeat: core(120, 145, 132, 'broken-beat dance groove'),
  'hard dance': core(145, 220, 155, 'hard dance full-time drive'),
  electro: core(115, 140, 128, 'electro syncopated machine funk'),
  'ambient electronic': core(55, 105, 78, 'spacious electronic pulse'),
  'idm experimental electronic': core(70, 170, 115, 'experimental electronic pulse'),
  synthwave: core(90, 135, 110, 'retro electronic drive'),
  'hip hop': core(75, 110, 94, 'classic hip-hop pocket'),
  trap: core(130, 155, 140, 'trap double-time grid'),
  drill: core(135, 150, 142, 'drill double-time grid'),
  'west coast rap': core(88, 105, 96, 'West Coast cruising pocket'),
  'east coast rap': core(84, 104, 94, 'East Coast boom-bap pocket'),
  'southern rap': core(120, 155, 140, 'Southern double-time rap grid'),
  'midwest rap': core(85, 150, 100, 'Midwest rap pocket'),
  'uk rap': core(120, 145, 138, 'UK rap/grime drive'),
  'afro rap': core(95, 120, 108, 'Afro-rap groove'),
  'european rap': core(85, 150, 98, 'European rap pocket'),
  'asian hip hop': core(85, 150, 100, 'Asian hip-hop pocket'),
  'arabic hip hop': core(85, 150, 100, 'Arabic hip-hop pocket'),
  'brazilian rap': core(88, 150, 100, 'Brazilian rap pocket'),
  pop: core(95, 130, 116, 'radio pop pulse'),
  'modern pop': core(90, 155, 120, 'modern alternative pop pulse'),
  'k pop': core(100, 140, 122, 'high-energy K-pop pulse'),
  'j pop': core(100, 170, 128, 'energetic J-pop pulse'),
  europop: core(110, 135, 124, 'European dance-pop pulse'),
  schlager: core(105, 135, 120, 'Schlager dance pulse'),
  'latin pop': core(90, 130, 108, 'Latin pop pulse'),
  rock: core(95, 160, 120, 'straight live rock drive'),
  'alternative rock': core(85, 155, 115, 'alternative rock drive'),
  punk: core(140, 210, 180, 'fast punk full-time drive'),
  'rock and roll': core(120, 190, 160, 'rock-and-roll dance drive'),
  'heavy metal': core(100, 190, 145, 'heavy metal drive'),
  'extreme metal': core(70, 220, 170, 'extreme-metal full-time aggression'),
  'modern metal': core(90, 190, 140, 'modern metal syncopated drive'),
  'r and b': core(65, 115, 86, 'R&B pocket'),
  soul: core(70, 125, 92, 'soul pocket'),
  funk: core(90, 130, 110, 'tight sixteenth-note funk pocket'),
  jazz: core(70, 200, 120, 'jazz pulse'),
  'jazz fusion': core(90, 170, 126, 'fusion groove'),
  'vocal jazz': core(60, 150, 100, 'vocal jazz pulse'),
  blues: core(60, 135, 92, 'blues pocket'),
  reggae: core(68, 96, 78, 'one-drop/rockers reggae pulse'),
  dancehall: core(85, 115, 100, 'dancehall groove'),
  ska: core(120, 190, 150, 'upstroke ska drive'),
  reggaeton: core(85, 105, 94, 'dembow reggaeton groove'),
  salsa: core(150, 210, 180, 'fast salsa dance pulse'),
  cumbia: core(80, 115, 96, 'cumbia dance groove'),
  samba: core(95, 130, 108, 'samba groove'),
  'bossa nova': core(110, 145, 126, 'bossa nova pulse'),
  'mpb tropicalia': core(80, 125, 100, 'Brazilian song groove'),
  'forro baiao': core(105, 150, 128, 'forro/baiao dance groove'),
  sertanejo: core(85, 130, 105, 'sertanejo pulse'),
  choro: core(110, 160, 135, 'choro instrumental pulse'),
  axe: core(120, 150, 135, 'Axé carnival drive'),
  'brazilian funk bass': core(125, 155, 140, 'Brazilian club/funk drive'),
  bachata: core(115, 135, 128, 'bachata dance pulse'),
  merengue: core(120, 160, 140, 'merengue dance drive'),
  'cuban dance': core(105, 190, 135, 'Cuban dance pulse'),
  bolero: core(60, 95, 76, 'slow romantic bolero'),
  tango: core(110, 135, 124, 'tango pulse'),
  'andean folk': core(90, 145, 118, 'Andean folk pulse'),
  vallenato: core(90, 130, 110, 'vallenato groove'),
  joropo: core(150, 210, 180, 'rapid joropo pulse'),
  'afrobeat afrobeats': core(95, 125, 108, 'West African groove'),
  highlife: core(100, 135, 116, 'highlife guitar groove'),
  'yoruba popular': core(95, 140, 118, 'Yoruba popular groove'),
  'mande traditions': core(80, 140, 105, 'Mande cyclic groove'),
  amapiano: core(108, 115, 112, 'deep log-drum amapiano groove'),
  gqom: core(118, 130, 124, 'sparse hard gqom drive'),
  kwaito: core(90, 115, 105, 'kwaito groove'),
  'afro house': core(118, 126, 123, 'Afro House four-on-floor groove'),
  'south african roots': core(90, 140, 112, 'South African roots groove'),
  'congolese rumba': core(95, 150, 125, 'Congolese guitar dance groove'),
  'east african popular': core(95, 170, 120, 'East African popular groove'),
  taarab: core(70, 125, 100, 'Taarab song pulse'),
  singeli: core(180, 220, 200, 'extreme full-time Tanzanian singeli drive'),
  rai: core(90, 135, 112, 'Raï groove'),
  chaabi: core(90, 140, 115, 'Chaabi dance pulse'),
  gnawa: core(90, 130, 110, 'Gnawa trance groove'),
  mahraganat: core(110, 150, 130, 'Egyptian electronic street drive'),
  'calypso soca': core(105, 165, 135, 'Caribbean carnival pulse'),
  chutney: core(105, 150, 128, 'Indo-Caribbean dance groove'),
  'kompa zouk': core(85, 125, 105, 'Kompa/Zouk groove'),
  'eastern caribbean': core(120, 170, 145, 'Eastern Caribbean carnival drive'),
  'arabic pop': core(90, 130, 110, 'Arabic pop pulse'),
  'tarab maqam': core(60, 120, 90, 'Tarab/Maqam expressive pulse'),
  dabke: core(100, 140, 120, 'Dabke dance drive'),
  khaliji: core(85, 125, 105, 'Khaliji groove'),
  'bollywood indian pop': core(90, 140, 118, 'Bollywood/Indian pop pulse'),
  bhangra: core(125, 150, 140, 'Bhangra dance drive'),
  'desi hip hop': core(85, 150, 100, 'Desi hip-hop pocket'),
  'indian electronic': core(105, 145, 126, 'Indian electronic dance pulse'),
  'sufi ghazal': core(55, 120, 85, 'Sufi/Ghazal expressive pulse'),
  'bengali folk': core(75, 135, 105, 'Bengali folk pulse'),
  'north indian folk': core(90, 150, 120, 'North Indian folk pulse'),
  'western indian folk and dance': core(110, 170, 135, 'Western Indian dance pulse'),
  'j rock': core(100, 180, 140, 'J-Rock drive'),
  enka: core(60, 100, 78, 'Enka ballad pulse'),
  'anime vocaloid': core(110, 190, 145, 'anime/Vocaloid energetic pulse'),
  'k r and b hip hop': core(75, 145, 98, 'Korean R&B/hip-hop pocket'),
  'k rock indie': core(90, 160, 120, 'Korean rock/indie drive'),
  trot: core(100, 145, 125, 'Korean trot pulse'),
  'chinese pop': core(85, 135, 110, 'Chinese pop pulse'),
  'chinese rock hip hop': core(85, 160, 115, 'Chinese rock/hip-hop pulse'),
  'mongolian rock': core(95, 165, 125, 'Mongolian rock drive'),
  'thai popular': core(90, 150, 118, 'Thai popular pulse'),
  'vietnamese popular': core(65, 135, 100, 'Vietnamese popular pulse'),
  'indonesian popular': core(75, 170, 118, 'Indonesian popular pulse'),
  'philippine pop opm': core(80, 145, 110, 'OPM/P-pop pulse'),
  'european folk': core(70, 180, 115, 'European folk dance/song pulse'),
  'celtic folk': core(80, 180, 120, 'Celtic folk pulse'),
  flamenco: core(80, 180, 120, 'flamenco compás'),
  fado: core(55, 105, 78, 'Fado song pulse'),
  'neapolitan song': core(60, 115, 82, 'Neapolitan song pulse')
};

const SUBGENRE_PROFILES: Record<string, CoreProfile> = {
  'deep house': core(118, 124, 122, 'deep four-on-floor pocket'),
  'tech house': core(124, 130, 126, 'tight tech-house groove'),
  'progressive house': core(122, 130, 126, 'progressive dance drive'),
  'melodic house': core(120, 126, 123, 'melodic house pulse'),
  'afro house': core(118, 126, 123, 'Afro House percussion-led four-on-floor'),
  'tribal house': core(124, 132, 128, 'tribal percussion drive'),
  'soulful house': core(118, 124, 122, 'soulful house pocket'),
  'funky house': core(122, 128, 125, 'funky house drive'),
  'french house': core(120, 130, 126, 'French filter-house drive'),
  'disco house': core(120, 128, 124, 'disco-house pulse'),
  'acid house': core(120, 132, 128, 'acid-house machine groove'),
  'electro house': core(126, 132, 128, 'electro-house festival drive'),
  'future house': core(124, 130, 126, 'future-house bounce'),
  'bass house': core(124, 132, 128, 'bass-house drive'),
  'big room house': core(126, 132, 128, 'big-room festival drive'),
  'organic house': core(110, 124, 120, 'organic-house flowing pulse'),
  'minimal house': core(118, 126, 123, 'minimal-house micro-groove'),
  microhouse: core(115, 125, 120, 'microhouse minimal pulse'),
  'lo fi house': core(112, 124, 118, 'lo-fi house pocket'),
  'hard house': core(135, 155, 145, 'hard-house full-time drive'),
  'piano house': core(120, 128, 124, 'piano-house uplifting pulse'),
  'detroit techno': core(125, 140, 132, 'Detroit machine-funk drive'),
  'minimal techno': core(124, 132, 128, 'minimal techno grid'),
  'dub techno': core(118, 126, 124, 'dub-techno hypnotic pulse'),
  'acid techno': core(130, 150, 140, 'acid-techno drive'),
  'industrial techno': core(135, 155, 145, 'industrial techno aggression'),
  'hard techno': core(145, 165, 155, 'hard-techno full-time drive'),
  'peak time techno': core(132, 142, 138, 'peak-time techno drive'),
  'hypnotic techno': core(125, 136, 130, 'hypnotic techno pulse'),
  'melodic techno': core(120, 130, 126, 'melodic techno pulse'),
  schranz: core(145, 165, 155, 'Schranz relentless full-time drive'),
  'raw techno': core(132, 148, 140, 'raw techno drive'),
  'classic trance': core(132, 142, 138, 'classic trance drive'),
  'progressive trance': core(128, 136, 132, 'progressive trance drive'),
  'uplifting trance': core(136, 142, 138, 'uplifting trance drive'),
  'vocal trance': core(132, 140, 136, 'vocal trance drive'),
  psytrance: core(138, 148, 144, 'psytrance full-time pulse'),
  'goa trance': core(138, 148, 144, 'Goa trance full-time pulse'),
  'full on psytrance': core(142, 148, 145, 'full-on psytrance drive'),
  'dark psytrance': core(145, 160, 150, 'dark psytrance fast drive'),
  'forest psytrance': core(145, 158, 150, 'forest psytrance fast drive'),
  'tech trance': core(136, 145, 140, 'tech-trance drive'),
  'hard trance': core(140, 155, 148, 'hard-trance full-time drive'),
  'liquid drum and bass': core(168, 176, 174, 'liquid DnB full-time breakbeat'),
  jungle: core(160, 180, 170, 'jungle full-time chopped breakbeat'),
  neurofunk: core(170, 180, 174, 'neurofunk full-time breakbeat'),
  'jump up': core(172, 178, 175, 'jump-up DnB full-time drive'),
  techstep: core(168, 178, 174, 'techstep full-time breakbeat'),
  darkstep: core(170, 180, 175, 'darkstep full-time breakbeat'),
  drumfunk: core(165, 180, 172, 'high-detail full-time drumfunk'),
  'atmospheric dnb': core(165, 176, 172, 'atmospheric DnB full-time pulse'),
  'dancefloor dnb': core(172, 178, 174, 'dancefloor DnB full-time drive'),
  'minimal dnb': core(168, 176, 172, 'minimal DnB full-time pulse'),
  'ragga jungle': core(165, 180, 172, 'ragga-jungle full-time breakbeat'),
  'uk dubstep': core(138, 142, 140, 'UK dubstep 140 grid'),
  'deep dubstep': core(138, 142, 140, 'deep dubstep 140 grid'),
  brostep: core(138, 150, 140, 'brostep 140 grid'),
  riddim: core(138, 150, 140, 'riddim 140 grid'),
  'melodic dubstep': core(138, 150, 140, 'melodic dubstep 140 grid'),
  '2 step garage': core(130, 138, 134, '2-step shuffled garage'),
  'speed garage': core(132, 138, 135, 'speed garage drive'),
  bassline: core(135, 142, 138, 'UK bassline drive'),
  hardstyle: core(148, 155, 150, 'hardstyle full-time kick drive'),
  rawstyle: core(150, 160, 155, 'rawstyle full-time drive'),
  'euphoric hardstyle': core(148, 155, 150, 'euphoric hardstyle drive'),
  hardcore: core(165, 200, 180, 'hardcore full-time drive'),
  gabber: core(165, 200, 180, 'gabber full-time drive'),
  frenchcore: core(180, 220, 200, 'Frenchcore extreme full-time drive'),
  'uptempo hardcore': core(190, 220, 200, 'uptempo hardcore extreme drive'),
  'happy hardcore': core(160, 190, 175, 'happy-hardcore full-time drive'),
  makina: core(160, 190, 175, 'Makina full-time drive'),
  'boom bap': core(82, 98, 92, 'boom-bap pocket'),
  'lo fi hip hop': core(65, 90, 80, 'lo-fi hip-hop laid-back pocket'),
  'jazz rap': core(82, 105, 92, 'jazz-rap pocket'),
  'old school hip hop': core(80, 110, 96, 'old-school hip-hop pocket'),
  'golden age hip hop': core(85, 110, 96, 'golden-age hip-hop pocket'),
  'atlanta trap': core(130, 150, 140, 'Atlanta trap double-time grid'),
  'southern trap': core(130, 150, 140, 'Southern trap double-time grid'),
  'melodic trap': core(125, 150, 140, 'melodic trap double-time grid'),
  'dark trap': core(130, 155, 145, 'dark trap double-time grid'),
  rage: core(140, 160, 150, 'rage rap fast double-time grid'),
  plugg: core(125, 150, 140, 'plugg double-time grid'),
  pluggnb: core(125, 150, 140, 'PluggnB double-time grid'),
  'uk drill': core(138, 146, 142, 'UK drill double-time grid'),
  'chicago drill': core(135, 145, 140, 'Chicago drill double-time grid'),
  'brooklyn drill': core(138, 150, 144, 'Brooklyn drill double-time grid'),
  grime: core(136, 142, 140, 'grime 140-grid drive'),
  'g funk': core(88, 102, 96, 'G-Funk cruising pocket'),
  'houston chopped and screwed': core(55, 80, 68, 'chopped-and-screwed slow pocket'),
  hyphy: core(95, 115, 105, 'hyphy energetic pocket'),
  'dance pop': core(112, 130, 122, 'dance-pop drive'),
  electropop: core(105, 130, 120, 'electropop pulse'),
  synthpop: core(100, 128, 116, 'synthpop pulse'),
  'dream pop': core(80, 120, 105, 'dream-pop floating pulse'),
  hyperpop: core(120, 180, 150, 'hyperpop high-energy drive'),
  'bedroom pop': core(75, 115, 95, 'bedroom-pop laid-back pulse'),
  'dark pop': core(85, 125, 105, 'dark-pop pulse'),
  'hard rock': core(105, 150, 125, 'hard-rock drive'),
  'soft rock': core(70, 120, 95, 'soft-rock pulse'),
  'progressive rock': core(80, 160, 120, 'progressive-rock variable pulse'),
  grunge: core(90, 145, 115, 'grunge drive'),
  shoegaze: core(75, 135, 105, 'shoegaze pulse'),
  'math rock': core(90, 170, 130, 'math-rock articulated pulse'),
  'post rock': core(60, 135, 90, 'post-rock evolving pulse'),
  'punk rock': core(150, 200, 180, 'punk full-time drive'),
  'hardcore punk': core(170, 220, 195, 'hardcore-punk extreme full-time drive'),
  'pop punk': core(145, 190, 170, 'pop-punk fast drive'),
  'skate punk': core(170, 220, 190, 'skate-punk full-time drive'),
  'traditional heavy metal': core(110, 170, 140, 'traditional metal drive'),
  'speed metal': core(150, 210, 180, 'speed-metal full-time drive'),
  'power metal': core(140, 190, 165, 'power-metal fast drive'),
  'thrash metal': core(150, 220, 190, 'thrash-metal extreme full-time drive'),
  'death metal': core(140, 220, 180, 'death-metal high-speed drive'),
  'black metal': core(150, 220, 180, 'black-metal blast-beat drive'),
  'doom metal': core(45, 85, 65, 'doom-metal very slow weight'),
  'funeral doom': core(40, 70, 55, 'funeral-doom glacial pulse'),
  'sludge metal': core(60, 110, 80, 'sludge-metal heavy slow pulse'),
  metalcore: core(120, 190, 150, 'metalcore full-time drive'),
  deathcore: core(110, 190, 150, 'deathcore heavy full-time grid'),
  djent: core(90, 160, 130, 'djent syncopated pulse'),
  'quiet storm': core(65, 90, 76, 'quiet-storm slow pocket'),
  'new jack swing': core(95, 115, 105, 'new-jack-swing pocket'),
  'neo soul': core(70, 105, 86, 'neo-soul pocket'),
  'p funk': core(95, 120, 108, 'P-Funk pocket'),
  boogie: core(105, 122, 114, 'boogie dance groove'),
  'jazz funk': core(100, 135, 118, 'jazz-funk groove'),
  swing: core(110, 200, 150, 'swing pulse'),
  bebop: core(160, 220, 190, 'bebop fast swing'),
  'hard bop': core(120, 200, 160, 'hard-bop swing'),
  'cool jazz': core(70, 130, 100, 'cool-jazz relaxed pulse'),
  'free jazz': core(60, 220, 130, 'free-jazz flexible pulse'),
  'smooth jazz': core(75, 115, 95, 'smooth-jazz pocket'),
  'delta blues': core(65, 110, 85, 'Delta blues pulse'),
  'chicago blues': core(80, 130, 105, 'Chicago blues shuffle'),
  'jump blues': core(130, 190, 160, 'jump-blues fast swing'),
  'roots reggae': core(68, 84, 76, 'roots-reggae one-drop'),
  dub: core(65, 90, 74, 'dub spacious pulse'),
  rocksteady: core(70, 95, 82, 'rocksteady groove'),
  'ska punk': core(150, 210, 180, 'ska-punk full-time drive'),
  perreo: core(90, 105, 96, 'perreo dembow groove'),
  neoperreo: core(90, 115, 100, 'neoperreo club groove'),
  timba: core(160, 210, 185, 'timba high-energy dance pulse'),
  'cumbia rebajada': core(55, 80, 68, 'cumbia rebajada slowed groove'),
  'funk carioca': core(125, 155, 140, 'funk-carioca club drive'),
  'brazilian bass': core(120, 128, 124, 'Brazilian bass club pulse'),
  ndombolo: core(120, 155, 138, 'Ndombolo fast guitar dance groove'),
  soukous: core(110, 150, 130, 'Soukous guitar dance groove'),
  gengetone: core(95, 120, 108, 'Gengetone groove'),
  soca: core(125, 165, 145, 'Soca carnival drive'),
  bouyon: core(135, 180, 155, 'Bouyon fast carnival drive'),
  qawwali: core(80, 160, 120, 'Qawwali accelerating devotional pulse'),
  ghazal: core(55, 95, 72, 'Ghazal slow expressive pulse'),
  dandiya: core(125, 170, 145, 'Dandiya dance drive'),
  garba: core(110, 150, 130, 'Garba dance drive'),
  gamelan: core(70, 150, 110, 'Gamelan cyclic pulse'),
  kecak: core(100, 180, 140, 'Kecak interlocking vocal pulse'),
  dangdut: core(100, 150, 125, 'Dangdut dance groove'),
  'luk thung': core(85, 130, 108, 'Luk Thung pulse'),
  'mor lam': core(100, 160, 130, 'Mor Lam dance pulse'),
  klezmer: core(100, 190, 145, 'Klezmer dance pulse'),
  'irish traditional': core(90, 180, 125, 'Irish traditional dance pulse'),
  'balkan folk': core(90, 190, 130, 'Balkan asymmetric dance pulse')
};

const ALIASES: Record<string, string> = {
  dnb: 'drum and bass',
  'drum n bass': 'drum and bass',
  'drum bass': 'drum and bass',
  psy: 'psytrance',
  'psy trance': 'psytrance',
  'd and b': 'drum and bass',
  'hiphop': 'hip hop',
  'rnb': 'r and b',
  'r b': 'r and b',
  'lofi house': 'lo fi house',
  'lofi hip hop': 'lo fi hip hop'
};

function explicitPromptBpm(prompt: string): number | null {
  const text = String(prompt || '');
  const match = text.match(/\b(?:at|a|@|tempo\s*[:=]?\s*)?(\d{2,3})\s*bpm\b/i)
    || text.match(/\bbpm\s*[:=]?\s*(\d{2,3})\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= MIN_BPM && value <= MAX_BPM ? clampBpm(value) : null;
}

const TAXONOMY_ENTRIES = WORLD_MUSIC_GENRES.flatMap(family =>
  family.genres.flatMap(genre =>
    genre.subgenres.map(subgenre => ({ family: family.family, genre: genre.name, subgenre }))
  )
).sort((a, b) => normalize(b.subgenre).length - normalize(a.subgenre).length);

function promptTaxonomyMatch(prompt: string) {
  const text = ` ${normalize(prompt)} `;
  if (!text.trim()) return null;

  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (text.includes(` ${normalize(alias)} `)) {
      const canonicalKey = normalize(canonical);
      const exact = TAXONOMY_ENTRIES.find(item => normalize(item.subgenre) === canonicalKey || normalize(item.genre) === canonicalKey);
      if (exact) return exact;
    }
  }

  return TAXONOMY_ENTRIES.find(item => {
    const key = normalize(item.subgenre);
    return key.length >= 4 && text.includes(` ${key} `);
  }) || TAXONOMY_ENTRIES.find(item => {
    const key = normalize(item.genre);
    return key.length >= 4 && text.includes(` ${key} `);
  }) || null;
}

function resolveCore(family: string, genre: string, subgenre: string): { profile: CoreProfile; source: 'subgenre' | 'genre' | 'family' } {
  const sub = SUBGENRE_PROFILES[normalize(subgenre)];
  if (sub) return { profile: sub, source: 'subgenre' };
  const gen = GENRE_DEFAULTS[normalize(genre)];
  if (gen) return { profile: gen, source: 'genre' };
  const fam = FAMILY_DEFAULTS[normalize(family)] || core(70, 150, 110, 'general musical pulse');
  return { profile: fam, source: 'family' };
}

function withMoodModifier(profile: CoreProfile, text: string): CoreProfile {
  const normalizedText = normalize(text);
  let delta = 0;
  if (/\b(very slow|molto lento|lentissimo|largo|adagio|glacial)\b/.test(normalizedText)) delta -= 12;
  else if (/\b(slow|lento|relaxed|rilassato|laid back|meditative|intimate)\b/.test(normalizedText)) delta -= 6;
  if (/\b(very fast|molto veloce|velocissimo|furious|frenetic|frenetico|relentless|rapidissimo)\b/.test(normalizedText)) delta += 12;
  else if (/\b(fast|veloce|uptempo|up tempo|driving|energetic|energico|aggressive|aggressivo|rapid|rapido)\b/.test(normalizedText)) delta += 6;
  if (!delta) return profile;
  const idealBpm = Math.max(profile.minBpm, Math.min(profile.maxBpm, profile.idealBpm + delta));
  return { ...profile, idealBpm, energy: energyForBpm(idealBpm), rhythmicDensity: densityForBpm(idealBpm) };
}

export function resolveProfessionalTempoProfile(input: {
  family: string;
  genre: string;
  subgenre: string;
  prompt?: string;
  mood?: string;
}): ProfessionalTempoProfile {
  const prompt = String(input.prompt || '');
  const explicit = explicitPromptBpm(prompt);
  const promptMatch = promptTaxonomyMatch(prompt);
  const family = promptMatch?.family || input.family;
  const genre = promptMatch?.genre || input.genre;
  const subgenre = promptMatch?.subgenre || input.subgenre;

  if (explicit !== null) {
    return {
      family,
      genre,
      subgenre,
      minBpm: explicit,
      maxBpm: explicit,
      idealBpm: explicit,
      energy: energyForBpm(explicit),
      feel: `creator-authoritative ${explicit} BPM full-time pulse`,
      rhythmicDensity: densityForBpm(explicit),
      source: 'explicit-prompt'
    };
  }

  const resolved = resolveCore(family, genre, subgenre);
  const adjusted = withMoodModifier(resolved.profile, `${input.mood || ''} ${prompt}`);
  return {
    family,
    genre,
    subgenre,
    ...adjusted,
    source: promptMatch ? 'prompt-subgenre' : resolved.source
  };
}

export function inferProfessionalAutomaticBpm(input: {
  family: string;
  genre: string;
  subgenre: string;
  prompt?: string;
  mood?: string;
}): { bpm: number; reason: string; profile: ProfessionalTempoProfile } {
  const profile = resolveProfessionalTempoProfile(input);
  const sourceLabel = profile.source === 'explicit-prompt'
    ? 'BPM scritto nel prompt'
    : profile.source === 'prompt-subgenre'
      ? 'Genere/sottogenere riconosciuto nel prompt'
      : profile.source === 'subgenre'
        ? 'Sottogenere'
        : profile.source === 'genre'
          ? 'Genere'
          : 'Famiglia musicale';
  return {
    bpm: profile.idealBpm,
    reason: `${sourceLabel}: ${profile.subgenre || profile.genre} · ${profile.minBpm}-${profile.maxBpm} BPM · ${profile.energy}`,
    profile
  };
}

export function describeTempoExecution(profile: ProfessionalTempoProfile, bpm = profile.idealBpm): string {
  const exact = clampBpm(bpm);
  const antiHalfTime = exact >= 145
    ? `The perceived motion must remain full-time at ${exact} BPM; never collapse it to ${Math.round(exact / 2)} BPM half-time unless the creator explicitly requests half-time.`
    : 'Do not reinterpret the requested pulse as half-time or double-time.';
  return `Professional tempo profile: ${profile.family} > ${profile.genre} > ${profile.subgenre}; canonical range ${profile.minBpm}-${profile.maxBpm} BPM; render target exactly ${exact} BPM; energy ${energyForBpm(exact)}; feel ${profile.feel}; rhythmic density ${densityForBpm(exact)}. ${antiHalfTime}`;
}

export const PROFESSIONAL_TEMPO_TAXONOMY = WORLD_MUSIC_GENRES.map(family => ({
  family: family.family,
  genres: family.genres.map(genre => ({
    genre: genre.name,
    subgenres: genre.subgenres.map(subgenre => resolveProfessionalTempoProfile({
      family: family.family,
      genre: genre.name,
      subgenre
    }))
  }))
}));
