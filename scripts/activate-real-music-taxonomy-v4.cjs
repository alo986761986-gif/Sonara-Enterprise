const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const taxonomyPath = path.resolve(root, 'src/data/worldMusicGenres.ts');
const overridesPath = path.resolve(root, 'src/data/professionalMusicTaxonomyV4.overrides.json');
const marker = 'SONARA_REAL_TAXONOMY_V4';

function taxonomyKey(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('en-US');
}

let source = fs.readFileSync(taxonomyPath, 'utf8');
if (source.includes(marker)) {
  console.log('[SONARA] Real music taxonomy v4 already active.');
  process.exit(0);
}

const declaration = 'export const WORLD_MUSIC_GENRES: MusicGenreFamily[] = BASE_WORLD_MUSIC_GENRES.map(normalizeProfessionalFamily);';
if (!source.includes(declaration)) {
  throw new Error('SONARA real taxonomy v4 activation failed: professional v3 declaration not found.');
}

const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
const serialized = JSON.stringify(overrides);

const layer = `// ${marker}\n// Canonical hierarchy: musical family > real genre > authentic subgenre/style.\n// Geographic and umbrella containers stay at family/category level, never masquerading as genres.\nconst PROFESSIONAL_V3_WORLD_MUSIC_GENRES: MusicGenreFamily[] = BASE_WORLD_MUSIC_GENRES.map(normalizeProfessionalFamily);\nconst REAL_GENRE_OVERRIDES_V4: Record<string, MusicGenre[]> = ${serialized};\n\nfunction validateRealGenreOverrideV4(family: string, sourceGenre: MusicGenre, mapped: MusicGenre[]) {\n  const original = sourceGenre.subgenres.map(taxonomyKey);\n  const replacement = mapped.flatMap(item => item.subgenres).map(taxonomyKey);\n  const originalSet = new Set(original);\n  const replacementSet = new Set(replacement);\n  if (original.length !== replacement.length || originalSet.size !== replacementSet.size || original.some(item => !replacementSet.has(item))) {\n    throw new Error('SONARA real taxonomy v4 lost or duplicated styles in ' + family + ' / ' + sourceGenre.name);\n  }\n}\n\nfunction normalizeRealFamilyV4(group: MusicGenreFamily): MusicGenreFamily {\n  const genres: MusicGenre[] = [];\n  const byName = new Map<string, MusicGenre>();\n  for (const genre of group.genres) {\n    const mapped = REAL_GENRE_OVERRIDES_V4[genre.name];\n    const expanded = mapped || [genre];\n    if (mapped) validateRealGenreOverrideV4(group.family, genre, mapped);\n    for (const item of expanded) {\n      const name = item.name.trim();\n      const key = taxonomyKey(name);\n      if (!key) continue;\n      const subgenres = Array.from(new Set((item.subgenres.length ? item.subgenres : [name]).filter(Boolean)));\n      const existing = byName.get(key);\n      if (existing) existing.subgenres = Array.from(new Set([...existing.subgenres, ...subgenres]));\n      else {\n        const normalized = { name, subgenres };\n        byName.set(key, normalized);\n        genres.push(normalized);\n      }\n      if (mapped) PROFESSIONAL_DERIVED_GENRES.add(name);\n    }\n  }\n  return { family: group.family, genres };\n}\n\nexport const WORLD_MUSIC_GENRES: MusicGenreFamily[] = PROFESSIONAL_V3_WORLD_MUSIC_GENRES.map(normalizeRealFamilyV4);`;

source = source.replace(declaration, layer);
fs.writeFileSync(taxonomyPath, source, 'utf8');
console.log('[SONARA] Real music taxonomy v4 activated: family > real genre > authentic subgenre.');
