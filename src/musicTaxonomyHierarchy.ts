import { WORLD_MUSIC_GENRES, type MusicGenre, type MusicGenreFamily } from './data/worldMusicGenres';
import { getAtmospheresForSelection } from './musicStyleIntelligence';

export interface MusicTaxonomyHierarchyInput {
  family?: unknown;
  genre?: unknown;
  subgenre?: unknown;
  atmosphere?: unknown;
}

export interface ResolvedMusicTaxonomyHierarchy {
  family: string;
  genre: string;
  subgenre: string;
  atmosphere: string;
  canonicalPath: string;
  atmosphereOptions: string[];
  corrections: string[];
}

function clean(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalize(value: unknown): string {
  return clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

function same(a: unknown, b: unknown): boolean {
  const left = normalize(a);
  const right = normalize(b);
  return Boolean(left && right && left === right);
}

function findFamily(value: unknown): MusicGenreFamily | undefined {
  return WORLD_MUSIC_GENRES.find(item => same(item.family, value));
}

function findGenreInFamily(family: MusicGenreFamily, value: unknown): MusicGenre | undefined {
  return family.genres.find(item => same(item.name, value));
}

function inferFamilyFromGenre(value: unknown): MusicGenreFamily | undefined {
  const hits = WORLD_MUSIC_GENRES.filter(family => family.genres.some(genre => same(genre.name, value)));
  return hits.length === 1 ? hits[0] : undefined;
}

function inferPathFromSubgenre(value: unknown): { family: MusicGenreFamily; genre: MusicGenre } | undefined {
  const hits: Array<{ family: MusicGenreFamily; genre: MusicGenre }> = [];
  for (const family of WORLD_MUSIC_GENRES) {
    for (const genre of family.genres) {
      if (genre.subgenres.some(subgenre => same(subgenre, value))) hits.push({ family, genre });
    }
  }
  return hits.length === 1 ? hits[0] : undefined;
}

export function resolveMusicTaxonomyHierarchy(input: MusicTaxonomyHierarchyInput): ResolvedMusicTaxonomyHierarchy {
  const requestedFamily = clean(input.family);
  const requestedGenre = clean(input.genre);
  const requestedSubgenre = clean(input.subgenre);
  const requestedAtmosphere = clean(input.atmosphere);
  const corrections: string[] = [];

  let family = findFamily(requestedFamily);
  if (!family) {
    const inferredBySubgenre = requestedSubgenre ? inferPathFromSubgenre(requestedSubgenre) : undefined;
    const inferredByGenre = requestedGenre ? inferFamilyFromGenre(requestedGenre) : undefined;
    family = inferredBySubgenre?.family || inferredByGenre || WORLD_MUSIC_GENRES[0];
    if (requestedFamily) corrections.push(`family:${requestedFamily}->${family.family}`);
    else corrections.push(`family:inferred->${family.family}`);
  }

  let genre = findGenreInFamily(family, requestedGenre);
  if (!genre && requestedSubgenre) {
    genre = family.genres.find(candidate => candidate.subgenres.some(item => same(item, requestedSubgenre)));
  }
  if (!genre) {
    genre = family.genres[0];
    if (requestedGenre) corrections.push(`genre:${requestedGenre}->${genre.name}`);
    else corrections.push(`genre:inferred->${genre.name}`);
  } else if (requestedGenre && !same(requestedGenre, genre.name)) {
    corrections.push(`genre:${requestedGenre}->${genre.name}`);
  }

  let subgenre = genre.subgenres.find(item => same(item, requestedSubgenre));
  if (!subgenre) {
    subgenre = genre.subgenres[0] || genre.name;
    if (requestedSubgenre) corrections.push(`subgenre:${requestedSubgenre}->${subgenre}`);
    else corrections.push(`subgenre:inferred->${subgenre}`);
  }

  const atmosphereOptions = getAtmospheresForSelection(family.family, genre.name, subgenre);
  let atmosphere = atmosphereOptions.find(item => same(item, requestedAtmosphere));
  if (!atmosphere) {
    atmosphere = atmosphereOptions[0] || 'Authentic';
    if (requestedAtmosphere) corrections.push(`atmosphere:${requestedAtmosphere}->${atmosphere}`);
    else corrections.push(`atmosphere:inferred->${atmosphere}`);
  }

  return {
    family: family.family,
    genre: genre.name,
    subgenre,
    atmosphere,
    canonicalPath: `${family.family} > ${genre.name} > ${subgenre} > ${atmosphere}`,
    atmosphereOptions,
    corrections
  };
}

export function hierarchyAuthorityText(selection: ResolvedMusicTaxonomyHierarchy): string {
  return [
    `FAMILY BOUNDARY: ${selection.family} is the outer musical world. Do not borrow defining grammar from another family.`,
    `GENRE BOUNDARY: ${selection.genre} is the required parent grammar inside ${selection.family}; its rhythm, instrumentation, form and production lineage must remain audible.`,
    `SUBGENRE DNA: ${selection.subgenre} is the most specific style identity and must dominate groove, drums, bass behavior, instrumentation, harmony, melody, phrasing, arrangement and production.`,
    `ATMOSPHERE MODIFIER: ${selection.atmosphere} may change emotion, tension, brightness, density, space and performance intensity only inside ${selection.subgenre}; it must never change family, genre or subgenre.`
  ].join(' ');
}


export default {
  resolveMusicTaxonomyHierarchy,
  hierarchyAuthorityText
};
