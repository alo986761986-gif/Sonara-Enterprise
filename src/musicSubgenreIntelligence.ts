import { WORLD_MUSIC_GENRES } from './data/worldMusicGenres';
import { getMusicStyleProfile as getLegacyStyleProfile } from './musicStyleIntelligenceLegacy';
import { getMusicGenreProfile } from './musicGenreIntelligence';
import { getMusicFamilyProfile } from './musicFamilyIntelligence';

export interface MusicSubgenreProfile {
  family: string;
  genre: string;
  subgenre: string;
  identity: string;
  instrumentation: string;
  rhythm: string;
  harmony: string;
  arrangement: string;
  production: string;
  avoid: string;
  siblingSubgenres: string[];
}

export const MUSIC_SUBGENRE_DNA_VERSION = 'sonara-subgenre-dna-v1';

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

function findPath(family: unknown, genre: unknown, subgenre: unknown) {
  const familyKey = normalize(family);
  const genreKey = normalize(genre);
  const subgenreKey = normalize(subgenre);
  const group = WORLD_MUSIC_GENRES.find(item => normalize(item.family) === familyKey);
  if (!group) return undefined;
  const parent = group.genres.find(item => normalize(item.name) === genreKey);
  if (!parent) return undefined;
  const leaf = parent.subgenres.find(item => normalize(item) === subgenreKey);
  if (!leaf) return undefined;
  return { family: group.family, genre: parent.name, subgenre: leaf, siblings: parent.subgenres };
}

const QUALIFIER_RULES: Array<{ pattern: RegExp; instruction: string }> = [
  { pattern: /\bdeep\b/i, instruction: 'prioritize depth, restraint, low-frequency continuity, spaciousness and gradual development rather than peak-time aggression' },
  { pattern: /\btech\b/i, instruction: 'prioritize functional groove, precise percussion, economical motifs and disciplined machine-like control rather than lush song-led excess' },
  { pattern: /\bprogressive\b/i, instruction: 'prioritize long-form development, evolving layers, delayed payoff and controlled thematic progression rather than immediate repetitive payoff' },
  { pattern: /\bmelodic\b/i, instruction: 'make melody and harmonic contour structurally important while preserving the parent groove and avoiding generic pop songwriting' },
  { pattern: /\bminimal\b/i, instruction: 'use sparse material, micro-variation, negative space and small timbral changes; simplicity must remain intentional and style-specific' },
  { pattern: /\bacid\b/i, instruction: 'give acid timbre or resonant sequenced movement a defining compositional role without turning the piece into an unrelated neighboring style' },
  { pattern: /\bdub\b/i, instruction: 'use space, delay, echo, filtering, decay and bass-weight as structural elements while preserving the exact parent style' },
  { pattern: /\bambient\b|\batmospheric\b/i, instruction: 'prioritize texture, space, sustained development and environmental depth while retaining the rhythmic or formal identity required by the parent genre' },
  { pattern: /\bhard\b|\bhardcore\b|\bbrutal\b/i, instruction: 'increase physical intensity, transient force and density only through the authentic vocabulary of this subgenre, not by borrowing unrelated extreme-style cliches' },
  { pattern: /\bsoft\b|\bmellow\b|\bchill\b|\bliquid\b/i, instruction: 'favor smoothness, warmth, fluid phrasing and controlled dynamics without erasing the parent rhythmic and production identity' },
  { pattern: /\bafro\b/i, instruction: 'use African-rooted rhythmic, percussive or melodic language only in the culturally and genre-appropriate way defined by this exact taxonomy path' },
  { pattern: /\blatin\b|\btropical\b/i, instruction: 'use the exact regional rhythmic and instrumental lineage implied by this subgenre and do not collapse it into generic Latin or tropical presets' },
  { pattern: /\bfusion\b/i, instruction: 'make the fusion relationship explicit and balanced: preserve the parent genre core while integrating the secondary language as a deliberate structural element' },
  { pattern: /\btraditional\b|\bclassic\b|\bclassical\b|\broots\b/i, instruction: 'preserve historically grounded instrumentation, phrasing, form and production perspective before introducing modern polish' },
  { pattern: /\bmodern\b|\bcontemporary\b/i, instruction: 'use current production and arrangement language while keeping the inherited family and genre identity unmistakable' },
  { pattern: /\bneo\b|\bnew\b/i, instruction: 'treat the neo/new identity as a conscious reinterpretation of the parent tradition rather than a license to replace it with generic contemporary production' },
  { pattern: /\bpost\b/i, instruction: 'treat post-genre development as an expansion of the parent vocabulary through form, texture or dynamics, not as abandonment of the parent lineage' },
  { pattern: /\bexperimental\b|\bavant\b/i, instruction: 'permit unconventional process and timbre only when the selected subgenre remains identifiable through a coherent compositional system' },
  { pattern: /\bacoustic\b|\bunplugged\b/i, instruction: 'prioritize real acoustic articulation, room interaction, natural dynamics and performer phrasing rather than synthetic substitution' },
  { pattern: /\belectro\b|\belectronic\b|\bsynth\b/i, instruction: 'make electronic timbre, sequencing or synthesis a defining layer while preserving the parent genre and exact subgenre grammar' },
  { pattern: /\bfolk\b|\bregional\b/i, instruction: 'preserve locality, regional instrument roles, melodic contour, meter and performance practice instead of using a generic folk surface' },
  { pattern: /\bpop\b/i, instruction: 'retain hook clarity and accessible section design only insofar as they remain subordinate to the exact parent genre and subgenre identity' },
  { pattern: /\bmetal\b/i, instruction: 'keep riff, drum, timbral weight and performance articulation specific to this exact metal branch rather than applying a generic heavy preset' },
  { pattern: /\bjazz\b/i, instruction: 'preserve jazz-informed interaction, harmony, phrasing or improvisational logic in the exact degree required by this subgenre' },
  { pattern: /\btrap\b/i, instruction: 'use subgenre-correct 808, programmed drum subdivision, space and melodic language without allowing generic trap vocabulary to erase the parent context' },
  { pattern: /\bdrill\b/i, instruction: 'use the exact drill bass movement, percussion placement, tension and regional pocket required by this path rather than generic trap programming' }
];

function specializationText(subgenre: string): string {
  const matched = QUALIFIER_RULES
    .filter(rule => rule.pattern.test(subgenre))
    .map(rule => rule.instruction);
  return matched.length
    ? matched.join('; ')
    : `treat ${subgenre} as its own documented style: preserve its characteristic groove, instrumentation, harmony, phrasing, form, era and production conventions rather than relying on the parent genre alone`;
}

function shortList(values: string[], max = 12): string {
  return values.slice(0, max).join(', ');
}

export function getMusicSubgenreProfile(family: unknown, genre: unknown, subgenre: unknown): MusicSubgenreProfile {
  const path = findPath(family, genre, subgenre);
  const familyName = path?.family || String(family || 'Music').trim() || 'Music';
  const genreName = path?.genre || String(genre || 'Music').trim() || 'Music';
  const subgenreName = path?.subgenre || String(subgenre || genreName).trim() || genreName;
  const siblings = (path?.siblings || [subgenreName]).filter(item => normalize(item) !== normalize(subgenreName));
  const legacy = getLegacyStyleProfile(familyName, genreName, subgenreName);
  const genreProfile = getMusicGenreProfile(familyName, genreName);
  const familyProfile = getMusicFamilyProfile(familyName);
  const specialization = specializationText(subgenreName);
  const siblingText = shortList(siblings);

  return {
    family: familyName,
    genre: genreName,
    subgenre: subgenreName,
    siblingSubgenres: siblings,
    identity:
      `SUBGENRE AUTHORITY — ${subgenreName} is the most specific mandatory musical identity in ${familyName} > ${genreName}. ${legacy.identity} Specifically, ${specialization}. The parent genre remains audible, but ${subgenreName} must be distinguishable from every sibling by listening alone.`,
    instrumentation:
      `SUBGENRE PALETTE — ${subgenreName}: choose the exact instruments, sound sources, timbres, registers and performance techniques documented for ${subgenreName}. ${legacy.instrumentation} Parent-genre instrumentation is allowed only when voiced and performed in a way that reinforces ${subgenreName}.`,
    rhythm:
      `SUBGENRE RHYTHM — ${subgenreName}: groove, pulse, swing, subdivision, accent placement, drum language and bass interaction must identify ${subgenreName} before melody or effects are considered. ${legacy.rhythm} ${specialization}.`,
    harmony:
      `SUBGENRE HARMONY — ${subgenreName}: chord vocabulary, harmonic rhythm, tonal or modal system, melodic contour, cadence, ornament and voice leading must follow the documented ${subgenreName} practice. ${legacy.harmony}`,
    arrangement:
      `SUBGENRE FORM — ${subgenreName}: phrase length, repetition, development, breaks, transitions, improvisation, section order and climax behavior must follow ${subgenreName} rather than a generic ${genreName} template. ${legacy.arrangement}`,
    production:
      `SUBGENRE PRODUCTION — ${subgenreName}: sound design, recording perspective, transient shape, low end, spatial treatment, vocal treatment, dynamics and era-specific finish must make ${subgenreName} credible. ${legacy.production}`,
    avoid:
      `SUBGENRE ANTI-DRIFT — render exactly ${familyName} > ${genreName} > ${subgenreName}. Do not substitute generic ${genreName}, a neighboring subgenre${siblingText ? ` such as ${siblingText}` : ''}, another family, generic pop, generic EDM or generic cinematic music. ${genreProfile.avoid} ${familyProfile.avoid} Atmosphere may modify emotion only; it cannot change this subgenre.`
  };
}

export function hasMusicSubgenreProfile(family: unknown, genre: unknown, subgenre: unknown): boolean {
  return Boolean(findPath(family, genre, subgenre));
}

export function listMusicSubgenreProfiles(): MusicSubgenreProfile[] {
  return WORLD_MUSIC_GENRES.flatMap(family =>
    family.genres.flatMap(genre =>
      genre.subgenres.map(subgenre => getMusicSubgenreProfile(family.family, genre.name, subgenre))
    )
  );
}

export default {
  MUSIC_SUBGENRE_DNA_VERSION,
  getMusicSubgenreProfile,
  hasMusicSubgenreProfile,
  listMusicSubgenreProfiles
};
