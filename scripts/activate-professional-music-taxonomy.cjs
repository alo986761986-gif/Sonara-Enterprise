const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const taxonomyPath = path.resolve(root, 'src/data/worldMusicGenres.ts');
const groupingPath = path.resolve(root, 'src/data/professionalMusicTaxonomyV3.json');
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
  if (source.includes('SONARA_PROFESSIONAL_TAXONOMY_V3')) return;

  const declaration = 'export const WORLD_MUSIC_GENRES: MusicGenreFamily[] = [';
  const marker = 'export const ALL_GENRES = WORLD_MUSIC_GENRES.flatMap(group =>';
  if (!source.includes(declaration) || !source.includes(marker)) {
    throw new Error('SONARA taxonomy v3 activation failed: clean taxonomy markers not found.');
  }

  const groups = JSON.parse(read(groupingPath));
  const serialized = JSON.stringify(groups);
  source = source.replace(declaration, 'const BASE_WORLD_MUSIC_GENRES: MusicGenreFamily[] = [');

  const layer = `// SONARA_PROFESSIONAL_TAXONOMY_V3\n// Semantic hierarchy: family > real musical genre > authentic subgenre/style.\nconst PROFESSIONAL_GENRE_GROUPS: Record<string, MusicGenre[]> = ${serialized};\n\nexport const PROFESSIONAL_DERIVED_GENRES = new Set<string>();\n\nfunction taxonomyKey(value: string): string {\n  return String(value || '').normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').trim().toLocaleLowerCase('en-US');\n}\n\nfunction validateProfessionalGrouping(family: string, sourceGenre: MusicGenre, mapped: MusicGenre[]) {\n  const original = sourceGenre.subgenres.map(taxonomyKey);\n  const replacement = mapped.flatMap(item => item.subgenres).map(taxonomyKey);\n  const originalSet = new Set(original);\n  const replacementSet = new Set(replacement);\n  if (original.length !== replacement.length || originalSet.size !== replacementSet.size || original.some(item => !replacementSet.has(item))) {\n    throw new Error('SONARA taxonomy v3 lost or duplicated styles in ' + family + ' / ' + sourceGenre.name);\n  }\n}\n\nfunction normalizeProfessionalFamily(group: MusicGenreFamily): MusicGenreFamily {\n  const genres: MusicGenre[] = [];\n  const byName = new Map<string, MusicGenre>();\n\n  for (const genre of group.genres) {\n    const mapped = PROFESSIONAL_GENRE_GROUPS[genre.name];\n    const expanded = mapped || [genre];\n    if (mapped) validateProfessionalGrouping(group.family, genre, mapped);\n\n    for (const item of expanded) {\n      const name = item.name.trim();\n      const key = taxonomyKey(name);\n      if (!key) continue;\n      const subgenres = Array.from(new Set((item.subgenres.length ? item.subgenres : [name]).filter(Boolean)));\n      const existing = byName.get(key);\n      if (existing) existing.subgenres = Array.from(new Set([...existing.subgenres, ...subgenres]));\n      else {\n        const normalized = { name, subgenres };\n        byName.set(key, normalized);\n        genres.push(normalized);\n      }\n      if (mapped) PROFESSIONAL_DERIVED_GENRES.add(name);\n    }\n  }\n\n  return { family: group.family, genres };\n}\n\nexport const WORLD_MUSIC_GENRES: MusicGenreFamily[] = BASE_WORLD_MUSIC_GENRES.map(normalizeProfessionalFamily);\n\n`;

  source = source.replace(marker, `${layer}${marker}`);
  write(taxonomyPath, source);
}

function patchAppSelectionIntegrity() {
  let source = read(appPath);
  const oldLine = '  const genreEntry = useMemo(() => findGenre(genre), [genre]);';
  const newLine = "  const genreEntry = useMemo(() => family.genres.find(item => item.name === genre) || findGenre(genre), [family, genre]);";
  if (source.includes(oldLine)) source = source.replace(oldLine, newLine);
  if (!source.includes(newLine)) throw new Error('SONARA taxonomy v3 failed: family-scoped genre lookup missing.');
  write(appPath, source);
}

function patchAtmospheresAndIdentity() {
  let source = read(intelligencePath);
  const houseImport = "import { getHouseStylePatch } from './houseStyleIntelligence';";
  const taxonomyImport = "import { PROFESSIONAL_DERIVED_GENRES } from './data/worldMusicGenres';";
  if (!source.includes(taxonomyImport)) source = source.replace(houseImport, `${houseImport}\n${taxonomyImport}`);

  source = source.replace("'africa|southern african|afro house':", "'africa|afro house|afro house':");
  source = source.replace("'africa|horn of africa|ethio jazz':", "'africa|ethiopian music|ethio jazz':");

  const curatedStart = source.indexOf('export function hasCuratedGenreIdentity(genre: string): boolean {');
  const curatedEnd = source.indexOf('\n}\n', curatedStart);
  if (curatedStart < 0 || curatedEnd < 0) throw new Error('SONARA taxonomy v3 failed: genre identity function missing.');
  const curated = `export function hasCuratedGenreIdentity(genre: string): boolean {\n  return PROFESSIONAL_DERIVED_GENRES.has(genre)\n    || Boolean(getHouseStylePatch('Electronic / Dance', 'House', genre))\n    || hasBaseGenreIdentity(genre);\n}`;
  source = source.slice(0, curatedStart) + curated + source.slice(curatedEnd + 3);

  const moodStart = source.indexOf('function moodList(family: string, genre: string, subgenre: string, exact: Patch | undefined, rules: Rule[]): string[] {');
  const moodEnd = source.indexOf('\n}\n\nfunction hash(', moodStart);
  if (moodStart < 0 || moodEnd < 0) throw new Error('SONARA taxonomy v3 failed: moodList block missing.');

  const moodBlock = `// SONARA_PROFESSIONAL_ATMOSPHERES_V3\nconst NON_ATMOSPHERE_LABELS = new Set([\n  'authentic', 'professional', 'human', 'focused', 'dynamic', 'cultural', 'historic',\n  'traditional', 'modern', 'acoustic', 'electric', 'digital', 'structured', 'rhythmic',\n  'melodic', 'breakbeat', 'west-coast', 'slow', 'fast', 'synthetic'\n]);\n\nconst FAMILY_ATMOSPHERE_FALLBACKS: Record<string, string[]> = {\n  'Electronic / Dance': ['Hypnotic', 'Energetic', 'Nocturnal', 'Atmospheric', 'Groovy', 'Driving'],\n  'Hip-Hop / Rap': ['Confident', 'Gritty', 'Urban', 'Defiant', 'Laid-Back', 'Dark'],\n  Pop: ['Uplifting', 'Emotional', 'Bright', 'Romantic', 'Playful', 'Energetic'],\n  Rock: ['Energetic', 'Raw', 'Rebellious', 'Emotional', 'Anthemic', 'Driving'],\n  Metal: ['Intense', 'Dark', 'Aggressive', 'Ominous', 'Epic', 'Relentless'],\n  'R&B / Soul / Funk': ['Soulful', 'Warm', 'Intimate', 'Groovy', 'Romantic', 'Late-Night'],\n  Jazz: ['Sophisticated', 'Smoky', 'Intimate', 'Playful', 'Reflective', 'Adventurous'],\n  Blues: ['Soulful', 'Raw', 'Melancholic', 'Earthy', 'Intimate', 'Reflective'],\n  'Reggae / Jamaican': ['Laid-Back', 'Deep', 'Uplifting', 'Spiritual', 'Sunny', 'Hypnotic'],\n  'Latin America': ['Passionate', 'Festive', 'Romantic', 'Energetic', 'Warm', 'Celebratory'],\n  Africa: ['Groovy', 'Communal', 'Proud', 'Hypnotic', 'Soulful', 'Energetic'],\n  Caribbean: ['Sunny', 'Festive', 'Joyful', 'Danceable', 'Warm', 'Celebratory'],\n  'Middle East / North Africa': ['Mystical', 'Passionate', 'Spiritual', 'Dramatic', 'Hypnotic', 'Regal'],\n  'South Asia': ['Spiritual', 'Devotional', 'Ecstatic', 'Meditative', 'Majestic', 'Joyful'],\n  'East Asia': ['Elegant', 'Nostalgic', 'Bright', 'Emotional', 'Dreamy', 'Dramatic'],\n  'Southeast Asia': ['Ceremonial', 'Joyful', 'Hypnotic', 'Warm', 'Communal', 'Shimmering'],\n  'Country / Americana': ['Earthy', 'Nostalgic', 'Heartfelt', 'Warm', 'Hopeful', 'Driving'],\n  'Folk / Traditional Europe': ['Earthy', 'Nostalgic', 'Intimate', 'Mystical', 'Festive', 'Melancholic'],\n  'Neomelodica Napoletana': ['Passionate', 'Romantic', 'Heartfelt', 'Dramatic', 'Intimate', 'Melancholic'],\n  'Classical / Art Music': ['Elegant', 'Majestic', 'Contemplative', 'Dramatic', 'Lyrical', 'Serene'],\n  'Gospel / Spiritual': ['Uplifting', 'Spiritual', 'Powerful', 'Joyful', 'Devotional', 'Communal'],\n  'Cinematic / Media': ['Cinematic', 'Dramatic', 'Epic', 'Mysterious', 'Emotional', 'Suspenseful'],\n  'Experimental / Avant-Garde': ['Abstract', 'Unsettling', 'Textural', 'Curious', 'Ethereal', 'Intense'],\n  'Easy Listening / Lounge': ['Relaxed', 'Elegant', 'Warm', 'Mellow', 'Intimate', 'Sunny'],\n  'Children / Novelty / Spoken': ['Playful', 'Joyful', 'Gentle', 'Bright', 'Whimsical', 'Tender']\n};\n\nconst GENRE_ATMOSPHERE_RULES: Array<{ pattern: RegExp; moods: string[] }> = [\n  { pattern: /west coast rap|g-funk|hyphy/i, moods: ['Laid-Back', 'Funky', 'Confident', 'Sunny', 'Cruising', 'Street'] },\n  { pattern: /east coast rap|philly rap|boom bap/i, moods: ['Gritty', 'Urban', 'Defiant', 'Raw', 'Confident', 'Street'] },\n  { pattern: /southern rap|dirty south|memphis rap|houston chopped/i, moods: ['Heavy', 'Dark', 'Swaggering', 'Gritty', 'Hypnotic', 'Street'] },\n  { pattern: /k-pop|j-pop|mandopop|cantopop|c-pop/i, moods: ['Bright', 'Polished', 'Energetic', 'Playful', 'Emotional', 'Uplifting'] },\n  { pattern: /samba|pagode|axé/i, moods: ['Festive', 'Joyful', 'Communal', 'Energetic', 'Sunny', 'Celebratory'] },\n  { pattern: /bossa nova|mpb|tropicália|choro/i, moods: ['Warm', 'Elegant', 'Intimate', 'Sophisticated', 'Sunny', 'Reflective'] },\n  { pattern: /bachata|bolero/i, moods: ['Romantic', 'Intimate', 'Passionate', 'Tender', 'Nostalgic', 'Warm'] },\n  { pattern: /salsa|mambo|cha-cha|son cubano|guaracha|merengue/i, moods: ['Festive', 'Passionate', 'Joyful', 'Danceable', 'Communal', 'Energetic'] },\n  { pattern: /tango|milonga/i, moods: ['Passionate', 'Dramatic', 'Sensual', 'Nostalgic', 'Elegant', 'Tense'] },\n  { pattern: /afrobeat|afrobeats|highlife|hiplife|jùjú|fuji|mande|wassoulou|griot/i, moods: ['Groovy', 'Proud', 'Communal', 'Joyful', 'Hypnotic', 'Warm'] },\n  { pattern: /amapiano|3-step|gqom|kwaito|afro house/i, moods: ['Deep', 'Groovy', 'Hypnotic', 'Soulful', 'Urban', 'Late-Night'] },\n  { pattern: /raï|chaabi|gnawa|amazigh|maghrebi/i, moods: ['Earthy', 'Hypnotic', 'Passionate', 'Proud', 'Mystical', 'Communal'] },\n  { pattern: /ethio-jazz|ethiopian|tizita/i, moods: ['Proud', 'Mystical', 'Soulful', 'Hypnotic', 'Melancholic', 'Sophisticated'] },\n  { pattern: /arabic pop|tarab|maqam|dabke|khaliji|shaabi|mahraganat/i, moods: ['Passionate', 'Dramatic', 'Mystical', 'Proud', 'Hypnotic', 'Celebratory'] },\n  { pattern: /hindustani|carnatic|dhrupad|khayal|thumri/i, moods: ['Meditative', 'Devotional', 'Expansive', 'Spiritual', 'Intense', 'Majestic'] },\n  { pattern: /qawwali|ghazal|sufi/i, moods: ['Devotional', 'Ecstatic', 'Passionate', 'Spiritual', 'Intimate', 'Transcendent'] },\n  { pattern: /bollywood|indi-pop|desi pop|bhangra|punjabi pop/i, moods: ['Joyful', 'Romantic', 'Energetic', 'Colorful', 'Celebratory', 'Uplifting'] },\n  { pattern: /enka/i, moods: ['Nostalgic', 'Melancholic', 'Dramatic', 'Heartfelt', 'Elegant', 'Longing'] },\n  { pattern: /gamelan|kecak|pinpeat|khmer classical|burmese classical/i, moods: ['Ceremonial', 'Hypnotic', 'Mystical', 'Communal', 'Shimmering', 'Meditative'] },\n  { pattern: /flamenco/i, moods: ['Passionate', 'Fiery', 'Raw', 'Dramatic', 'Proud', 'Intimate'] },\n  { pattern: /fado/i, moods: ['Saudade', 'Melancholic', 'Intimate', 'Nostalgic', 'Poetic', 'Tender'] },\n  { pattern: /neapolitan song/i, moods: ['Passionate', 'Romantic', 'Nostalgic', 'Heartfelt', 'Intimate', 'Tender'] }\n];\n\nfunction genreAtmospheres(family: string, genre: string, subgenre: string): string[] {\n  const value = [family, genre, subgenre].join(' ');\n  return unique(GENRE_ATMOSPHERE_RULES.filter(rule => rule.pattern.test(value)).flatMap(rule => rule.moods));\n}\n\nfunction moodList(family: string, genre: string, subgenre: string, exact: Patch | undefined, rules: Rule[]): string[] {\n  const blocked = new Set(unique([...(exact?.blockedMoods || []), ...rules.flatMap(rule => rule.blockedMoods || [])]).map(value => value.toLocaleLowerCase('en-US')));\n  const curated = unique([\n    ...(exact?.moods || []),\n    ...genreAtmospheres(family, genre, subgenre),\n    ...rules.flatMap(rule => rule.moods || []),\n    ...getBaseAtmospheres(family, genre, subgenre)\n  ]).filter(value => {\n    const id = value.toLocaleLowerCase('en-US');\n    return !blocked.has(id) && !NON_ATMOSPHERE_LABELS.has(id);\n  });\n  const fallback = FAMILY_ATMOSPHERE_FALLBACKS[family] || ['Emotional', 'Atmospheric', 'Intense', 'Warm', 'Dark', 'Uplifting'];\n  return unique([...curated, ...fallback]).slice(0, 10);\n}`;

  source = source.slice(0, moodStart) + moodBlock + source.slice(moodEnd + 2);
  write(intelligencePath, source);
}

patchTaxonomy();
patchAppSelectionIntegrity();
patchAtmospheresAndIdentity();
console.log('[SONARA] Professional music taxonomy v3 activated: semantic genres, conserved styles and genre-aware atmospheres.');
