const fs = require('node:fs');
const path = require('node:path');

const appPath = path.resolve(process.cwd(), 'src/App.tsx');
let source = fs.readFileSync(appPath, 'utf8');

const electronicImport = `import { buildElectronicLyrics, hasElectronicLyricsProfile } from './electronicLyrics';`;
const universalLyricsImport = `import { buildUniversalLyrics } from './universalLyrics';`;
const universalCaptionImport = `import { buildUniversalStyleCaption } from './universalStyleCaption';`;
const professionalLyricsImport = `import { buildProfessionalLyricsFallback } from './professionalLyrics';`;

if (!source.includes(universalLyricsImport)) {
  if (!source.includes(electronicImport)) {
    throw new Error('SONARA universal lyrics activation failed: electronic lyrics import marker not found.');
  }
  source = source.replace(electronicImport, `${electronicImport}\n${universalLyricsImport}\n${universalCaptionImport}\n${professionalLyricsImport}`);
} else if (!source.includes(professionalLyricsImport)) {
  source = source.replace(universalCaptionImport, `${universalCaptionImport}\n${professionalLyricsImport}`);
}

const electronicFallback = `          : buildRandomLyrics({\n              language: vocalLanguage,\n              genre,\n              subgenre,\n              mood,\n              vocalMode,\n              variant: lyricsVariantRef.current\n            }));`;

const universalFallback = `          : buildUniversalLyrics({\n              language: vocalLanguage,\n              genreFamily,\n              genre,\n              subgenre,\n              mood,\n              vocalMode,\n              variant: lyricsVariantRef.current,\n              durationSec\n            }));`;

if (!source.includes(': buildUniversalLyrics({')) {
  if (!source.includes(electronicFallback)) {
    throw new Error('SONARA universal lyrics activation failed: generic fallback marker not found.');
  }
  source = source.replace(electronicFallback, universalFallback);
}

const randomizeStart = `  const randomizeLyrics = `;
const generateMarker = `\n\n  const generate = async () => {`;
const randomizeIndex = source.indexOf(randomizeStart);
const generateIndex = source.indexOf(generateMarker, randomizeIndex);
if (randomizeIndex < 0 || generateIndex < 0) {
  throw new Error('SONARA Professional Lyrics v2 activation failed: randomizeLyrics block not found.');
}

const professionalRandomize = `  const generateProfessionalLyrics = async (smartRandom = false) => {\n    if (vocalMode === 'instrumental') {\n      setLyrics('');\n      return;\n    }\n\n    lyricsVariantRef.current = (lyricsVariantRef.current + 1) % Number.MAX_SAFE_INTEGER;\n    const variant = Date.now() + lyricsVariantRef.current + (smartRandom ? Math.floor(Math.random() * 1_000_000) : 0);\n    const request = {\n      language: vocalLanguage,\n      languageName: LANGUAGE_METADATA[vocalLanguage].name,\n      genreFamily,\n      genre,\n      subgenre,\n      mood,\n      vocalMode,\n      variant,\n      durationSec,\n      bpm,\n      title,\n      smartRandom\n    };\n\n    try {\n      setStage(smartRandom ? 'SONARA is creating an intelligent random lyric concept...' : 'SONARA is writing professional lyrics...');\n      const response = await fetch('/api/lyrics', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify(request)\n      });\n      if (!response.ok) throw new Error(\`Lyrics service HTTP \${response.status}\`);\n      const payload = await response.json();\n      const nextLyrics = String(payload?.lyrics || '').trim();\n      if (!nextLyrics) throw new Error('Lyrics service returned empty content.');\n      setLyrics(nextLyrics);\n      setStage(smartRandom ? 'Intelligent random lyrics ready' : (payload?.source === 'gemini-professional-v2' ? 'Professional AI lyrics ready' : 'Professional lyrics ready'));\n    } catch (lyricsError) {\n      console.warn('[SONARA][Lyrics] Professional API unavailable, using local composer.', lyricsError);\n      setLyrics(buildProfessionalLyricsFallback(request));\n      setStage(smartRandom ? 'Intelligent random lyrics ready' : 'Professional lyrics ready');\n    }\n  };\n\n  const randomizeLyrics = () => void generateProfessionalLyrics(false);\n  const intelligentRandomLyrics = () => void generateProfessionalLyrics(true);`;

source = source.slice(0, randomizeIndex) + professionalRandomize + source.slice(generateIndex);

const clearButtonMarker = `            <button\n              type="button"\n              onClick={() => setLyrics('')}`;

if (!source.includes('onClick={intelligentRandomLyrics}')) {
  if (!source.includes(clearButtonMarker)) {
    throw new Error('SONARA Intelligent Lyrics activation failed: clear button marker not found.');
  }
  const smartButton = `            <button\n              type="button"\n              onClick={intelligentRandomLyrics}\n              disabled={busy || vocalMode === 'instrumental'}\n              title={vocalMode === 'instrumental' ? 'Seleziona prima una voce' : 'Crea un testo intelligente casuale, coerente con genere e atmosfera'}\n              aria-label="Genera un testo intelligente casuale"\n              className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-[10px] font-black tracking-widest text-purple-200 transition hover:border-fuchsia-400 hover:bg-purple-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"\n            >\n              <Sparkles className="h-3 w-3" />\n              INTELLIGENTE\n            </button>\n`;
  source = source.replace(clearButtonMarker, `${smartButton}${clearButtonMarker}`);
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
console.log('[SONARA] Professional Lyrics v2 activated: AI-first generation with local professional fallback, genre-specific structure, BPM/duration synchronization and unlimited variants.');
console.log('[SONARA] Intelligent Lyrics button activated: smart random narrative concept + selected genre/subgenre/atmosphere constraints.');
console.log('[SONARA] Legacy House/Techno/Electronic lyric files preserved; Professional Lyrics v2 is now authoritative at generation time.');
console.log('[SONARA] Universal Style Caption activated: family + genre + subgenre + atmosphere fingerprint sent to engine.');
