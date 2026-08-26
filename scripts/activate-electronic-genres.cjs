const fs = require('node:fs');
const path = require('node:path');

const appPath = path.resolve(process.cwd(), 'src/App.tsx');
let source = fs.readFileSync(appPath, 'utf8');

const technoImport = `import { buildTechnoLyrics, hasTechnoLyricsProfile } from './technoLyrics';`;
const electronicImport = `import { buildElectronicLyrics, hasElectronicLyricsProfile } from './electronicLyrics';`;
if (!source.includes(electronicImport)) {
  if (!source.includes(technoImport)) {
    throw new Error('SONARA electronic lyrics activation failed: Techno lyrics import marker not found.');
  }
  source = source.replace(technoImport, `${technoImport}\n${electronicImport}`);
}

const technoMarker = `    const useTechnoLyrics = genreFamily === 'Electronic / Dance' && genre === 'Techno' && hasTechnoLyricsProfile(subgenre);`;
const electronicMarker = `    const useElectronicLyrics = genreFamily === 'Electronic / Dance' && hasElectronicLyricsProfile(genre, subgenre);`;
if (!source.includes(electronicMarker)) {
  if (!source.includes(technoMarker)) {
    throw new Error('SONARA electronic lyrics activation failed: Techno routing marker not found.');
  }
  source = source.replace(technoMarker, `${technoMarker}\n${electronicMarker}`);
}

const genericFallback = `        : buildRandomLyrics({\n            language: vocalLanguage,\n            genre,\n            subgenre,\n            mood,\n            vocalMode,\n            variant: lyricsVariantRef.current\n          }));`;

const electronicFallback = `        : useElectronicLyrics\n          ? buildElectronicLyrics({\n              language: vocalLanguage,\n              genre,\n              subgenre,\n              mood,\n              vocalMode,\n              variant: lyricsVariantRef.current,\n              durationSec\n            })\n          : buildRandomLyrics({\n              language: vocalLanguage,\n              genre,\n              subgenre,\n              mood,\n              vocalMode,\n              variant: lyricsVariantRef.current\n            }));`;

if (!source.includes('? buildElectronicLyrics({')) {
  if (!source.includes(genericFallback)) {
    throw new Error('SONARA electronic lyrics activation failed: generic fallback marker not found.');
  }
  source = source.replace(genericFallback, electronicFallback);
}

fs.writeFileSync(appPath, source, 'utf8');
console.log('[SONARA] Electronic Lyrics activated: 10 genres / 89 subgenres with duration-aware structures.');
