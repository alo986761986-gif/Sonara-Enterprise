import { getMusicStyleProfile } from './musicStyleIntelligence';

export interface UniversalStyleCaptionInput {
  genreFamily: string;
  genre: string;
  subgenre: string;
  mood: string;
}

function clean(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function compact(value: string, maxLength: number): string {
  const text = clean(value, maxLength + 80);
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength);
  const boundary = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf(', '), sliced.lastIndexOf(' '));
  return sliced.slice(0, boundary > maxLength * 0.72 ? boundary : maxLength).trim();
}

export function buildUniversalStyleCaption({ genreFamily, genre, subgenre, mood }: UniversalStyleCaptionInput): string {
  const family = clean(genreFamily, 72) || 'Music';
  const genreName = clean(genre, 72) || 'Music';
  const subgenreName = clean(subgenre, 84) || genreName;
  const atmosphere = clean(mood, 48) || 'Authentic';
  const profile = getMusicStyleProfile(family, genreName, subgenreName);

  const identity = compact(profile.identity, 145);
  const rhythm = compact(profile.rhythm, 105);
  const instrumentation = compact(profile.instrumentation, 105);
  const harmony = compact(profile.harmony, 70);

  return [
    `${family} > ${genreName} > ${subgenreName}.`,
    identity,
    `Groove: ${rhythm}.`,
    `Palette: ${instrumentation}.`,
    `Harmony: ${harmony}.`,
    `Atmosphere: ${atmosphere}.`
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 470);
}
