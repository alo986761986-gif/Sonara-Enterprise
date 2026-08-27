const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const taxonomyPath = path.resolve(root, 'src/data/worldMusicGenres.ts');
const appPath = path.resolve(root, 'src/App.tsx');
const intelligencePath = path.resolve(root, 'src/musicStyleIntelligence.ts');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, source) {
  fs.writeFileSync(file, source, 'utf8');
}

function patchTaxonomy() {
  let source = read(taxonomyPath);
  if (source.includes('SONARA_PROFESSIONAL_TAXONOMY_V2')) return;

  const declaration = 'export const WORLD_MUSIC_GENRES: MusicGenreFamily[] = [';
  if (!source.includes(declaration)) {
    throw new Error('SONARA taxonomy activation failed: WORLD_MUSIC_GENRES declaration not found.');
  }
  source = source.replace(declaration, 'const BASE_WORLD_MUSIC_GENRES: MusicGenreFamily[] = [');

  const marker = 'export const ALL_GENRES = WORLD_MUSIC_GENRES.flatMap(group =>';
  if (!source.includes(marker)) {
    throw new Error('SONARA taxonomy activation failed: ALL_GENRES marker not found.');
  }

  const professionalLayer = `// SONARA_PROFESSIONAL_TAXONOMY_V2\n// Geographic/market buckets are presentation containers, not musical genres.\nconst PROFESSIONAL_CONTAINER_GENRES = new Set([\n  'Regional Rap',\n  'Global Rap',\n  'Asian Pop',\n  'European Pop',\n  'Latin Pop',\n  'Brazilian',\n  'Caribbean Latin',\n  'Mexican / Regional',\n  'South American',\n  'West African',\n  'Southern African',\n  'Central / East African',\n  'North African',\n  'Horn of Africa',\n  'Francophone African',\n  'Caribbean',\n  'Arabic Music',\n  'Indian Popular',\n  'South Asian Folk',\n  'Pakistan / Bangladesh / Sri Lanka',\n  'Japanese',\n  'Korean',\n  'Chinese',\n  'Mongolian',\n  'Southeast Asian Popular',\n  'Traditional Southeast Asia'\n]);\n\nexport const PROFESSIONAL_DERIVED_GENRES = new Set<string>();\n\nfunction normalizeProfessionalFamily(group: MusicGenreFamily): MusicGenreFamily {\n  const genres: MusicGenre[] = [];\n  const seen = new Set<string>();\n\n  for (const genre of group.genres) {\n    const isContainer = PROFESSIONAL_CONTAINER_GENRES.has(genre.name);\n    const expanded = isContainer\n      ? genre.subgenres.map(name => ({ name, subgenres: [name] }))\n      : [genre];\n\n    for (const item of expanded) {\n      const key = item.name.trim().toLocaleLowerCase('en-US');\n      if (!key || seen.has(key)) continue;\n      seen.add(key);\n      if (isContainer) PROFESSIONAL_DERIVED_GENRES.add(item.name);\n      genres.push({\n        name: item.name,\n        subgenres: Array.from(new Set((item.subgenres.length ? item.subgenres : [item.name]).filter(Boolean)))\n      });\n    }\n  }\n\n  return { family: group.family, genres };\n}\n\nexport const WORLD_MUSIC_GENRES: MusicGenreFamily[] = BASE_WORLD_MUSIC_GENRES.map(normalizeProfessionalFamily);\n\n`;

  source = source.replace(marker, `${professionalLayer}${marker}`);
  write(taxonomyPath, source);
}

function patchAppSelectionIntegrity() {
  let source = read(appPath);
  const oldLine = '  const genreEntry = useMemo(() => findGenre(genre), [genre]);';
  const newLine = "  const genreEntry = useMemo(() => family.genres.find(item => item.name === genre) || findGenre(genre), [family, genre]);";
  if (source.includes(oldLine)) source = source.replace(oldLine, newLine);
  if (!source.includes(newLine)) {
    throw new Error('SONARA taxonomy activation failed: family-scoped genre selection was not applied.');
  }
  write(appPath, source);
}

function patchAtmospheresAndIdentity() {
  let source = read(intelligencePath);

  const houseImport = "import { getHouseStylePatch } from './houseStyleIntelligence';";
  const taxonomyImport = "import { PROFESSIONAL_DERIVED_GENRES } from './data/worldMusicGenres';";
  if (!source.includes(taxonomyImport)) {
    if (!source.includes(houseImport)) {
      throw new Error('SONARA taxonomy activation failed: music intelligence import marker not found.');
    }
    source = source.replace(houseImport, `${houseImport}\n${taxonomyImport}`);
  }

  // Preserve distinct cultural identity after presentation containers are removed.
  source = source.replace("'africa|southern african|afro house':", "'africa|afro house|afro house':");
  source = source.replace("'africa|horn of africa|ethio jazz':", "'africa|ethio jazz|ethio jazz':");

  const oldCurated = `export function hasCuratedGenreIdentity(genre: string): boolean {\n  return Boolean(getHouseStylePatch('Electronic / Dance', 'House', genre)) || hasBaseGenreIdentity(genre);\n}`;
  const newCurated = `export function hasCuratedGenreIdentity(genre: string): boolean {\n  return PROFESSIONAL_DERIVED_GENRES.has(genre)\n    || Boolean(getHouseStylePatch('Electronic / Dance', 'House', genre))\n    || hasBaseGenreIdentity(genre);\n}`;
  if (source.includes(oldCurated)) source = source.replace(oldCurated, newCurated);
  if (!source.includes(newCurated)) {
    throw new Error('SONARA taxonomy activation failed: derived genre identity validation was not applied.');
  }

  if (!source.includes('SONARA_PROFESSIONAL_ATMOSPHERES_V2')) {
    const start = source.indexOf('function moodList(family: string, genre: string, subgenre: string, exact: Patch | undefined, rules: Rule[]): string[] {');
    const end = source.indexOf('\n}\n\nfunction hash(', start);
    if (start < 0 || end < 0) {
      throw new Error('SONARA atmosphere activation failed: moodList block not found.');
    }

    const replacement = `// SONARA_PROFESSIONAL_ATMOSPHERES_V2\nconst NON_ATMOSPHERE_LABELS = new Set([\n  'authentic', 'professional', 'human', 'focused', 'dynamic', 'cultural', 'historic',\n  'traditional', 'modern', 'acoustic', 'electric', 'digital', 'structured', 'rhythmic',\n  'melodic', 'breakbeat', 'west-coast', 'slow', 'fast'\n]);\n\nconst FAMILY_ATMOSPHERE_FALLBACKS: Record<string, string[]> = {\n  'Electronic / Dance': ['Hypnotic', 'Energetic', 'Nocturnal', 'Atmospheric', 'Groovy', 'Driving'],\n  'Hip-Hop / Rap': ['Confident', 'Gritty', 'Urban', 'Defiant', 'Laid-Back', 'Dark'],\n  Pop: ['Uplifting', 'Emotional', 'Bright', 'Romantic', 'Playful', 'Energetic'],\n  Rock: ['Energetic', 'Raw', 'Rebellious', 'Emotional', 'Anthemic', 'Driving'],\n  Metal: ['Intense', 'Dark', 'Aggressive', 'Ominous', 'Epic', 'Relentless'],\n  'R&B / Soul / Funk': ['Soulful', 'Warm', 'Intimate', 'Groovy', 'Romantic', 'Late-Night'],\n  Jazz: ['Sophisticated', 'Smoky', 'Intimate', 'Playful', 'Reflective', 'Adventurous'],\n  Blues: ['Soulful', 'Raw', 'Melancholic', 'Earthy', 'Intimate', 'Reflective'],\n  'Reggae / Jamaican': ['Laid-Back', 'Deep', 'Uplifting', 'Spiritual', 'Sunny', 'Hypnotic'],\n  'Latin America': ['Passionate', 'Festive', 'Romantic', 'Energetic', 'Warm', 'Celebratory'],\n  Africa: ['Groovy', 'Communal', 'Proud', 'Hypnotic', 'Soulful', 'Energetic'],\n  Caribbean: ['Sunny', 'Festive', 'Joyful', 'Danceable', 'Warm', 'Celebratory'],\n  'Middle East / North Africa': ['Mystical', 'Passionate', 'Spiritual', 'Dramatic', 'Hypnotic', 'Regal'],\n  'South Asia': ['Spiritual', 'Devotional', 'Ecstatic', 'Meditative', 'Majestic', 'Joyful'],\n  'East Asia': ['Elegant', 'Nostalgic', 'Bright', 'Emotional', 'Dreamy', 'Dramatic'],\n  'Southeast Asia': ['Ceremonial', 'Joyful', 'Hypnotic', 'Warm', 'Communal', 'Shimmering'],\n  'Country / Americana': ['Earthy', 'Nostalgic', 'Heartfelt', 'Warm', 'Hopeful', 'Driving'],\n  'Folk / Traditional Europe': ['Earthy', 'Nostalgic', 'Intimate', 'Mystical', 'Festive', 'Melancholic'],\n  'Neomelodica Napoletana': ['Passionate', 'Romantic', 'Heartfelt', 'Dramatic', 'Intimate', 'Melancholic'],\n  'Classical / Art Music': ['Elegant', 'Majestic', 'Contemplative', 'Dramatic', 'Lyrical', 'Serene'],\n  'Gospel / Spiritual': ['Uplifting', 'Spiritual', 'Powerful', 'Joyful', 'Devotional', 'Communal'],\n  'Cinematic / Media': ['Cinematic', 'Dramatic', 'Epic', 'Mysterious', 'Emotional', 'Suspenseful'],\n  'Experimental / Avant-Garde': ['Abstract', 'Unsettling', 'Textural', 'Curious', 'Ethereal', 'Intense'],\n  'Easy Listening / Lounge': ['Relaxed', 'Elegant', 'Warm', 'Mellow', 'Intimate', 'Sunny'],\n  'Children / Novelty / Spoken': ['Playful', 'Joyful', 'Gentle', 'Bright', 'Whimsical', 'Tender']\n};\n\nfunction moodList(family: string, genre: string, subgenre: string, exact: Patch | undefined, rules: Rule[]): string[] {\n  const blocked = new Set(unique([...(exact?.blockedMoods || []), ...rules.flatMap(rule => rule.blockedMoods || [])]).map(value => value.toLocaleLowerCase('en-US')));\n  const curated = unique([\n    ...(exact?.moods || []),\n    ...rules.flatMap(rule => rule.moods || []),\n    ...getBaseAtmospheres(family, genre, subgenre)\n  ]).filter(value => {\n    const id = value.toLocaleLowerCase('en-US');\n    return !blocked.has(id) && !NON_ATMOSPHERE_LABELS.has(id);\n  });\n\n  const fallback = FAMILY_ATMOSPHERE_FALLBACKS[family] || ['Emotional', 'Atmospheric', 'Intense', 'Warm', 'Dark', 'Uplifting'];\n  return unique([...curated, ...fallback]).slice(0, 10);\n}`;

    source = source.slice(0, start) + replacement + source.slice(end + 2);
  }

  write(intelligencePath, source);
}

patchTaxonomy();
patchAppSelectionIntegrity();
patchAtmospheresAndIdentity();
console.log('[SONARA] Professional music taxonomy v2 activated: family > real genre > subgenre > coherent atmosphere.');
