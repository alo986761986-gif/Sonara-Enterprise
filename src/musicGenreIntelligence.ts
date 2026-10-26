import { WORLD_MUSIC_GENRES, type MusicGenre } from './data/worldMusicGenres';
import { getMusicStyleProfile as getLegacyStyleProfile } from './musicStyleIntelligenceLegacy';
import { getMusicFamilyProfile } from './musicFamilyIntelligence';

export interface MusicGenreProfile {
  family: string;
  genre: string;
  identity: string;
  instrumentation: string;
  rhythm: string;
  harmony: string;
  arrangement: string;
  production: string;
  avoid: string;
  subgenres: string[];
}

export const MUSIC_GENRE_DNA_VERSION = 'sonara-genre-dna-v1';

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

function findGenre(family: unknown, genre: unknown): { familyName: string; entry: MusicGenre; siblings: MusicGenre[] } | undefined {
  const familyKey = normalize(family);
  const genreKey = normalize(genre);
  const group = WORLD_MUSIC_GENRES.find(item => normalize(item.family) === familyKey);
  if (!group) return undefined;
  const entry = group.genres.find(item => normalize(item.name) === genreKey);
  return entry ? { familyName: group.family, entry, siblings: group.genres } : undefined;
}

function limited(values: string[], max = 14): string {
  return values.slice(0, max).join(', ');
}

export function getMusicGenreProfile(family: unknown, genre: unknown): MusicGenreProfile {
  const found = findGenre(family, genre);
  const familyName = found?.familyName || String(family || 'Music').trim() || 'Music';
  const genreName = found?.entry.name || String(genre || 'Music').trim() || 'Music';
  const children = found?.entry.subgenres?.length ? found.entry.subgenres : [genreName];
  const representative = children[0] || genreName;
  const legacy = getLegacyStyleProfile(familyName, genreName, representative);
  const familyProfile = getMusicFamilyProfile(familyName);
  const siblingNames = (found?.siblings || [])
    .map(item => item.name)
    .filter(name => normalize(name) !== normalize(genreName));

  const childText = limited(children);
  const siblingText = limited(siblingNames, 10);

  return {
    family: familyName,
    genre: genreName,
    subgenres: [...children],
    identity:
      `${genreName} is the authoritative genre inside the ${familyName} family. Its defining musical grammar must remain audible before any subgenre detail is added. ${legacy.identity} The valid internal style space for this genre is limited to its own subgenres: ${childText}.`,
    instrumentation:
      `GENRE PALETTE — ${genreName}: use instruments, sound sources, performer roles, articulations and registers that belong to ${genreName} and its own subgenres (${childText}). ${legacy.instrumentation} The family palette remains a boundary, but sibling genres must not donate their defining instrumentation.`,
    rhythm:
      `GENRE RHYTHM — ${genreName}: groove, meter, swing, subdivision, pulse, accent hierarchy and bass-drum relationship must make ${genreName} identifiable even before melody or effects. ${legacy.rhythm} Rhythmic variants may come only from ${genreName} or its listed subgenres.`,
    harmony:
      `GENRE HARMONY — ${genreName}: harmonic rhythm, chord vocabulary, modal or tonal language, melodic contour, cadences and voice leading must belong to ${genreName}. ${legacy.harmony} Do not import the defining harmonic language of a sibling genre merely because it belongs to ${familyName}.`,
    arrangement:
      `GENRE FORM — ${genreName}: section architecture, phrase lengths, transitions, repetition, development, improvisation and energy behavior must follow documented ${genreName} practice. ${legacy.arrangement} A subgenre may specialize this form but may not replace the parent genre with another genre.`,
    production:
      `GENRE PRODUCTION — ${genreName}: timbre, dynamics, transient behavior, spatial design, low-end balance, vocal treatment and era-specific finish must make ${genreName} credible. ${legacy.production} Production polish must reinforce the genre instead of making it sound like a generic neighboring style.`,
    avoid:
      `GENRE ANTI-DRIFT — remain inside ${familyName} > ${genreName}. Do not substitute a sibling genre${siblingText ? ` such as ${siblingText}` : ''}, generic pop, generic EDM, generic cinematic music or a cross-family default. ${familyProfile.avoid} The selected subgenre may narrow ${genreName}, never escape it.`
  };
}

export function hasMusicGenreProfile(family: unknown, genre: unknown): boolean {
  return Boolean(findGenre(family, genre));
}

export function listMusicGenreProfiles(): MusicGenreProfile[] {
  return WORLD_MUSIC_GENRES.flatMap(group =>
    group.genres.map(genre => getMusicGenreProfile(group.family, genre.name))
  );
}

export default {
  MUSIC_GENRE_DNA_VERSION,
  getMusicGenreProfile,
  hasMusicGenreProfile,
  listMusicGenreProfiles
};
