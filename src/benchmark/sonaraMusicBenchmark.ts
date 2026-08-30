import { WORLD_MUSIC_GENRES } from '../data/worldMusicGenres';
import { ALL_REAL_MUSICAL_INSTRUMENTS } from '../data/realMusicalInstruments';
import { buildPromptDirectorBrief, type PromptDirectorContext } from '../services/promptDirector';
import { buildStudioMaxBlueprint } from '../sonaraStudioMaxIntelligence';
import { buildExactMusicControlContract } from '../quality/sonaraReleaseStandard';

export const SONARA_MUSIC_BENCHMARK_VERSION = 'sonara-music-benchmark-500-v1';
export const SONARA_MUSIC_BENCHMARK_SIZE = 500;

export type SonaraMusicBenchmarkCase = {
  id: string;
  family: string;
  genre: string;
  subgenre: string;
  atmosphere: string;
  bpm: number;
  durationSec: number;
  vocalMode: 'instrumental' | 'male' | 'female' | 'duet';
  instruments: string[];
  idea: string;
  prompt: string;
  exactControl: ReturnType<typeof buildExactMusicControlContract>;
  studioBlueprint: ReturnType<typeof buildStudioMaxBlueprint>;
};

const FAMILY_BPM: Record<string, [number, number]> = {
  'Electronic / Dance': [118, 138],
  'Hip-Hop / Rap': [72, 105],
  Pop: [92, 126],
  Rock: [92, 150],
  Metal: [105, 180],
  'R&B / Soul / Funk': [72, 118],
  Jazz: [72, 155],
  Blues: [68, 128],
  'Reggae / Jamaican': [68, 102],
  'Latin America': [88, 138],
  Africa: [90, 132],
  Caribbean: [82, 132],
  'Middle East / North Africa': [76, 132],
  'South Asia': [72, 138],
  'East Asia': [72, 132],
  'Southeast Asia': [72, 132],
  'Country / Americana': [82, 136],
  'Folk / Traditional Europe': [72, 132],
  'Neomelodica Napoletana': [72, 112],
  'Classical / Art Music': [56, 132],
  'Gospel / Spiritual': [68, 126],
  'Cinematic / Media': [60, 132],
  'Experimental / Avant-Garde': [60, 150],
  'Easy Listening / Lounge': [64, 112],
  'Children / Novelty / Spoken': [72, 124]
};

const ATMOSPHERES = ['Authentic', 'Dark', 'Emotional', 'Uplifting', 'Cinematic', 'Intimate', 'Raw', 'Hypnotic'];
const DURATIONS = [60, 90, 120, 180, 240, 300, 360, 480];
const VOCALS: SonaraMusicBenchmarkCase['vocalMode'][] = ['instrumental', 'female', 'male', 'duet'];

type BenchmarkStyle = { family: string; genre: string; subgenre: string };

function stylesByFamily(): BenchmarkStyle[][] {
  return WORLD_MUSIC_GENRES.map(family => family.genres.flatMap(genre =>
    genre.subgenres.map(subgenre => ({ family: family.family, genre: genre.name, subgenre }))
  )).filter(styles => styles.length > 0);
}

function styleForIndex(families: BenchmarkStyle[][], index: number): BenchmarkStyle {
  const familyIndex = index % families.length;
  const familyStyles = families[familyIndex];
  const round = Math.floor(index / families.length);
  return familyStyles[round % familyStyles.length];
}

function deterministicBpm(family: string, index: number): number {
  const [min, max] = FAMILY_BPM[family] || [72, 132];
  const span = Math.max(1, max - min);
  return Math.round(min + ((index * 17 + family.length * 3) % (span + 1)));
}

function instrumentsFor(index: number): string[] {
  const total = ALL_REAL_MUSICAL_INSTRUMENTS.length;
  if (!total) return [];
  const first = ALL_REAL_MUSICAL_INSTRUMENTS[(index * 7) % total];
  const second = ALL_REAL_MUSICAL_INSTRUMENTS[(index * 29 + 11) % total];
  return first === second ? [first] : [first, second];
}

export function buildSonaraMusicBenchmarkCases(count = SONARA_MUSIC_BENCHMARK_SIZE): SonaraMusicBenchmarkCase[] {
  const families = stylesByFamily();
  if (!families.length) throw new Error('SONARA benchmark cannot run without music taxonomy styles.');
  const cases: SonaraMusicBenchmarkCase[] = [];

  for (let index = 0; index < count; index += 1) {
    const style = styleForIndex(families, index);
    const bpm = deterministicBpm(style.family, index);
    const durationSec = DURATIONS[index % DURATIONS.length];
    const vocalMode = VOCALS[index % VOCALS.length];
    const atmosphere = ATMOSPHERES[(index * 3) % ATMOSPHERES.length];
    const instruments = instrumentsFor(index);
    const idea = `Create an original ${style.subgenre} track using ${instruments.join(' and ')} with a ${atmosphere.toLowerCase()} emotional identity. Preserve the selected instruments and avoid generic genre drift.`;
    const directorContext: PromptDirectorContext = {
      idea,
      family: style.family,
      genre: style.genre,
      subgenre: style.subgenre,
      mood: atmosphere,
      vocalMode,
      bpmMode: 'manual',
      bpm,
      weirdness: 35 + (index % 31),
      styleInfluence: 70 + (index % 26),
      styleTags: instruments
    };
    const prompt = buildPromptDirectorBrief(directorContext, 'professional');
    const exactControl = buildExactMusicControlContract({
      family: style.family,
      genre: style.genre,
      subgenre: style.subgenre,
      atmosphere,
      bpmMode: 'manual',
      bpm,
      key: null,
      durationSec,
      vocalMode,
      instruments
    });
    const studioBlueprint = buildStudioMaxBlueprint({
      durationSec,
      bpm,
      genre: style.genre,
      subgenre: style.subgenre,
      family: style.family,
      mood: atmosphere,
      vocalMode,
      vocalLanguage: vocalMode === 'instrumental' ? '' : 'en',
      instrumentation: instruments.join(', ')
    });

    cases.push({
      id: `SMB-${String(index + 1).padStart(4, '0')}`,
      ...style,
      atmosphere,
      bpm,
      durationSec,
      vocalMode,
      instruments,
      idea,
      prompt,
      exactControl,
      studioBlueprint
    });
  }
  return cases;
}

export function summarizeSonaraBenchmark(cases = buildSonaraMusicBenchmarkCases()) {
  return {
    version: SONARA_MUSIC_BENCHMARK_VERSION,
    cases: cases.length,
    families: new Set(cases.map(item => item.family)).size,
    genres: new Set(cases.map(item => `${item.family}/${item.genre}`)).size,
    subgenres: new Set(cases.map(item => `${item.family}/${item.genre}/${item.subgenre}`)).size,
    instruments: new Set(cases.flatMap(item => item.instruments)).size,
    vocalModes: new Set(cases.map(item => item.vocalMode)).size,
    durations: new Set(cases.map(item => item.durationSec)).size
  };
}
