import { getMusicStyleProfile } from './musicStyleIntelligence';
import { hierarchyAuthorityText, resolveMusicTaxonomyHierarchy } from './musicTaxonomyHierarchy';

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
  const resolved = resolveMusicTaxonomyHierarchy({
    family: clean(genreFamily, 72),
    genre: clean(genre, 72),
    subgenre: clean(subgenre, 84),
    atmosphere: clean(mood, 48)
  });
  const family = resolved.family;
  const genreName = resolved.genre;
  const subgenreName = resolved.subgenre;
  const atmosphere = resolved.atmosphere;
  const profile = getMusicStyleProfile(family, genreName, subgenreName);

  const identity = compact(profile.identity, 145);
  const rhythm = compact(profile.rhythm, 105);
  const instrumentation = compact(profile.instrumentation, 105);
  const harmony = compact(profile.harmony, 70);

  return [
    `${resolved.canonicalPath}.`,
    hierarchyAuthorityText(resolved),
    identity,
    `Groove: ${rhythm}.`,
    `Palette: ${instrumentation}.`,
    `Harmony: ${harmony}.`,
    `Atmosphere: ${atmosphere}.`
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 760);
}
