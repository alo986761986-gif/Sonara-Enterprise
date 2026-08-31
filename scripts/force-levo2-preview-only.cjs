const fs = require('node:fs');
const path = require('node:path');

if (String(process.env.VERCEL_ENV || '').toLowerCase() !== 'preview') {
  console.log('[SONARA][LeVo2] Preview-only provider lock skipped outside Vercel preview.');
  process.exit(0);
}

const file = path.join(process.cwd(), 'api/billing/[...path].ts');
let source = fs.readFileSync(file, 'utf8');

const oldBlock = `  const requestedEngineId = String(body.engineId || body.engine || '').trim().toLowerCase();
  const useLeVo2 = requestedEngineId === 'sonara_levo2_research' || requestedEngineId === 'levo2-research' || provider === 'levo2_research' || provider === 'levo2-research' || provider === 'levo2';
  const useEleven = !useLeVo2 && (provider === 'eleven' || provider === 'eleven_music' || provider === 'elevenlabs');`;

const newBlock = `  const requestedEngineId = String(body.engineId || body.engine || '').trim().toLowerCase();
  // R&D preview is intentionally LeVo2-only. Never fall through to Eleven here.
  const useLeVo2 = true;
  const useEleven = false;`;

if (!source.includes(newBlock)) {
  if (!source.includes(oldBlock)) {
    throw new Error('[SONARA][LeVo2] Preview-only provider lock failed: patched provider block not found.');
  }
  source = source.replace(oldBlock, newBlock);
}

fs.writeFileSync(file, source, 'utf8');
console.log('[SONARA][LeVo2] Preview provider locked to LeVo2. Eleven disabled for R&D preview generation.');
