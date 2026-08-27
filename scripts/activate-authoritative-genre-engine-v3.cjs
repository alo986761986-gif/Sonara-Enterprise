const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const promptEnginePath = path.join(root, 'backend/src/services/AceStepPromptEngine.ts');
const routePath = path.join(root, 'backend/src/routes/engine.ts');
const workerPath = path.join(root, 'backend/src/workers/JobQueueWorker.ts');
const generationPath = path.join(root, 'backend/src/services/MusicGenerationService.ts');
const acePath = path.join(root, 'backend/src/engine/AceStepEngine.ts');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, source) { fs.writeFileSync(file, source, 'utf8'); }
function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`[SONARA] authoritative genre v3 patch failed: ${label}`);
  return source.replace(from, to);
}

function patchPromptEngine() {
  let source = read(promptEnginePath);
  source = replaceRequired(
    source,
    "    // Default fallback to Melodic House if electronic dance vibe is present\n    return this.GENRE_PROFILES['melodic house'];",
    `    // SONARA_AUTHORITATIVE_GENRE_V3\n    // Unknown styles must preserve the user's selected style instead of silently becoming Melodic House.\n    const selectedStyle = String(explicitGenre || '').trim() || 'Music';\n    const bpmMatch = String(query || '').match(/exactly\\s+(\\d{2,3})\\s+BPM/i);\n    const keyMatch = String(query || '').match(/exactly\\s+\\d{2,3}\\s+BPM,\\s*([^.,|\\n]+)/i);\n    const requestedBpm = bpmMatch ? Math.max(40, Math.min(220, Number(bpmMatch[1]))) : 120;\n    return {\n      primaryGenre: selectedStyle,\n      subgenre: selectedStyle,\n      recommendedBpm: requestedBpm,\n      bpmRange: [Math.max(40, requestedBpm - 8), Math.min(220, requestedBpm + 8)],\n      keySignature: keyMatch ? keyMatch[1].trim() : 'A Minor',\n      acousticKeywords: [],\n      bannedKeywords: [],\n      modelTier: 'GOLD'\n    };`,
    'remove Melodic House fallback'
  );
  write(promptEnginePath, source);
}

function patchRoute() {
  let source = read(routePath);
  source = replaceRequired(
    source,
    "    const { prompt, durationSec, genre, bpm, key, engineId, title, mood, lyrics } = req.body;",
    "    const { prompt, durationSec, genre, genreFamily, subgenre, bpm, key, engineId, title, mood, lyrics, weirdness, styleInfluence } = req.body;\n    const selectedStyle = String(subgenre || genre || 'Music').trim();",
    'read selected subgenre'
  );
  source = replaceRequired(
    source,
    '    const optimizationResult = await AceStepPromptEngine.generatePrompt(prompt, genre);',
    '    const optimizationResult = await AceStepPromptEngine.generatePrompt(prompt, selectedStyle);',
    'optimize against selected subgenre'
  );
  source = replaceRequired(
    source,
    "      genre: genre || optimizationResult.genreLock.subgenre || 'Melodic House',\n      mood: mood || 'Energetic',\n      lyrics: lyrics || '',\n      prompt: prompt,\n      bpm: bpm || optimizationResult.genreLock.targetBpm || 124,\n      duration: durationSec || 30",
    "      genre: selectedStyle,\n      genreFamily: genreFamily || '',\n      subgenre: selectedStyle,\n      mood: mood || 'Energetic',\n      lyrics: lyrics || '',\n      prompt: prompt,\n      bpm: bpm || optimizationResult.genreLock.targetBpm || 124,\n      duration: durationSec || 30,\n      weirdness,\n      styleInfluence",
    'enqueue authoritative style payload'
  );
  write(routePath, source);
}

function patchWorker() {
  let source = read(workerPath);
  source = replaceRequired(
    source,
    "  bpm?: number;\n  duration?: number;",
    "  bpm?: number;\n  duration?: number;\n  genreFamily?: string;\n  subgenre?: string;\n  weirdness?: number;\n  styleInfluence?: number;",
    'extend generation payload'
  );
  source = replaceRequired(
    source,
    "      const userGenre = payload.genre || 'House';",
    "      const userGenre = payload.subgenre || payload.genre || 'Music';",
    'worker selected style'
  );
  source = replaceRequired(
    source,
    "      const targetGenre = genreLock.subgenre || genreLock.primaryGenre || 'Melodic House';",
    "      const targetGenre = payload.subgenre || genreLock.subgenre || userGenre;",
    'worker target style lock'
  );
  source = replaceRequired(
    source,
    "        durationSec,\n        targetBpm\n      );",
    "        durationSec,\n        targetBpm,\n        payload.weirdness,\n        payload.styleInfluence\n      );",
    'forward creative controls'
  );
  write(workerPath, source);
}

function patchGenerationService() {
  let source = read(generationPath);
  source = replaceRequired(
    source,
    "    durationSec: number = 15,\n    bpm: number = 128\n  ):",
    "    durationSec: number = 15,\n    bpm: number = 128,\n    weirdness: number = 50,\n    styleInfluence: number = 50\n  ):",
    'accept creative controls'
  );
  source = replaceRequired(
    source,
    "      durationSec,\n      bpm\n    });",
    "      durationSec,\n      bpm,\n      weirdness,\n      styleInfluence\n    });",
    'send creative controls to ACE-Step engine'
  );
  write(generationPath, source);
}

function patchAceStep() {
  let source = read(acePath);
  source = replaceRequired(
    source,
    "      'clear musical structure, defined kick, bassline, percussion and harmonic progression'",
    "      'preserve the exact selected genre identity with genre-authentic instrumentation, rhythm, harmony, phrasing, arrangement and production; do not substitute another genre'",
    'remove universal electronic bias'
  );
  write(acePath, source);
}

patchPromptEngine();
patchRoute();
patchWorker();
patchGenerationService();
patchAceStep();
console.log('[SONARA] Authoritative genre engine v3 activated: selected subgenre preserved through backend and ACE-Step.');
