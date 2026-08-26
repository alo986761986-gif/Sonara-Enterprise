const fs = require('node:fs');
const path = require('node:path');

const appPath = path.resolve(process.cwd(), 'src/App.tsx');
let source = fs.readFileSync(appPath, 'utf8');

const electronicImport = `import { buildElectronicLyrics, hasElectronicLyricsProfile } from './electronicLyrics';`;
const universalLyricsImport = `import { buildUniversalLyrics } from './universalLyrics';`;
const universalCaptionImport = `import { buildUniversalStyleCaption } from './universalStyleCaption';`;

if (!source.includes(universalLyricsImport)) {
  if (!source.includes(electronicImport)) {
    throw new Error('SONARA universal lyrics activation failed: electronic lyrics import marker not found.');
  }
  source = source.replace(electronicImport, `${electronicImport}\n${universalLyricsImport}\n${universalCaptionImport}`);
}

const electronicFallback = `          : buildRandomLyrics({\n              language: vocalLanguage,\n              genre,\n              subgenre,\n              mood,\n              vocalMode,\n              variant: lyricsVariantRef.current\n            }));`;

const universalFallback = `          : buildUniversalLyrics({\n              language: vocalLanguage,\n              genreFamily,\n              genre,\n              subgenre,\n              mood,\n              vocalMode,\n              variant: lyricsVariantRef.current,\n              durationSec\n            }));`;

if (!source.includes(': buildUniversalLyrics({')) {
  if (!source.includes(electronicFallback)) {
    throw new Error('SONARA universal lyrics activation failed: generic fallback marker not found.');
  }
  source = source.replace(electronicFallback, universalFallback);
}

const payloadMarker = `        body: JSON.stringify({\n          prompt: finalPrompt,\n          rawPrompt,\n          genre,\n          genreFamily,\n          subgenre,\n          mood,`;
const payloadReplacement = `        body: JSON.stringify({\n          prompt: finalPrompt,\n          rawPrompt,\n          genre,\n          genreFamily,\n          subgenre,\n          mood,\n          styleCaption: buildUniversalStyleCaption({ genreFamily, genre, subgenre, mood }),`;

if (!source.includes('styleCaption: buildUniversalStyleCaption')) {
  if (!source.includes(payloadMarker)) {
    throw new Error('SONARA universal style caption activation failed: generation payload marker not found.');
  }
  source = source.replace(payloadMarker, payloadReplacement);
}

fs.writeFileSync(appPath, source, 'utf8');
console.log('[SONARA] Universal Lyrics activated: full non-electronic taxonomy with atmosphere-aware long-form structures.');
console.log('[SONARA] Universal Style Caption activated: family + genre + subgenre + atmosphere fingerprint sent to engine.');
