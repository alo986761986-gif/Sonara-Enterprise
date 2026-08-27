const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(process.cwd(), 'backend/src/services/AceStepPromptEngine.ts');
let source = fs.readFileSync(file, 'utf8');

if (!source.includes('SONARA_AUTHORITATIVE_STYLE_PRECEDENCE_V3')) {
  const from = `  public static detectGenreProfile(query: string, explicitGenre?: string): GenreLockProfile {\n    const text = \`${'${query || \'\'} ${explicitGenre || \'\'}'}\`.toLowerCase();`;
  const to = `  public static detectGenreProfile(query: string, explicitGenre?: string): GenreLockProfile {\n    // SONARA_AUTHORITATIVE_STYLE_PRECEDENCE_V3\n    // The UI-selected subgenre is authoritative. Parent-genre words inside the descriptive prompt\n    // must never collapse a specific style into House, Techno, Hip Hop, etc.\n    const explicitStyle = String(explicitGenre || '').trim();\n    const explicitKey = explicitStyle.toLowerCase();\n    if (explicitStyle) {\n      const exactProfile = this.GENRE_PROFILES[explicitKey];\n      if (exactProfile) return exactProfile;\n\n      const bpmMatch = String(query || '').match(/exactly\\s+(\\d{2,3})\\s+BPM/i);\n      const keyMatch = String(query || '').match(/exactly\\s+\\d{2,3}\\s+BPM,\\s*([^.,|\\n]+)/i);\n      const requestedBpm = bpmMatch ? Math.max(40, Math.min(220, Number(bpmMatch[1]))) : 120;\n      return {\n        primaryGenre: explicitStyle,\n        subgenre: explicitStyle,\n        recommendedBpm: requestedBpm,\n        bpmRange: [Math.max(40, requestedBpm - 8), Math.min(220, requestedBpm + 8)],\n        keySignature: keyMatch ? keyMatch[1].trim() : 'A Minor',\n        acousticKeywords: [],\n        bannedKeywords: [],\n        modelTier: 'GOLD'\n      };\n    }\n\n    const text = \`${'${query || \'\'} ${explicitGenre || \'\'}'}\`.toLowerCase();`;

  if (!source.includes(from)) {
    throw new Error('[SONARA] authoritative style precedence v3 failed: detectGenreProfile marker not found.');
  }
  source = source.replace(from, to);
  fs.writeFileSync(file, source, 'utf8');
}

console.log('[SONARA] Authoritative style precedence v3 activated: selected subgenre overrides generic parent keywords.');
