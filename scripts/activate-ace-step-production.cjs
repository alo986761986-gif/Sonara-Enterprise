const fs = require('node:fs');
const path = require('node:path');

const vercelEnv = String(process.env.VERCEL_ENV || '').toLowerCase();
const force = String(process.env.SONARA_FORCE_ACE_STEP_PRODUCTION || '').trim() === '1';

if (vercelEnv === 'preview' && !force) {
  console.log('[SONARA][ACE-Step] Production lock skipped in Vercel Preview.');
  process.exit(0);
}

if (vercelEnv && vercelEnv !== 'production' && !force) {
  console.log(`[SONARA][ACE-Step] Production lock skipped for VERCEL_ENV=${vercelEnv}.`);
  process.exit(0);
}

const file = path.join(process.cwd(), 'api/billing/[...path].ts');
let source = fs.readFileSync(file, 'utf8');

const providerExpr = "String(process.env.SONARA_MUSIC_PROVIDER || 'eleven_music').trim().toLowerCase()";
const lockedProviderExpr = "String('ace_step_xl').trim().toLowerCase()";
if (!source.includes(providerExpr) && !source.includes(lockedProviderExpr)) {
  throw new Error('[SONARA][ACE-Step] Billing provider marker not found.');
}

source = source.replaceAll(providerExpr, lockedProviderExpr);

if (!source.includes(`const provider = ${lockedProviderExpr};`)) {
  throw new Error('[SONARA][ACE-Step] Failed to force ACE-Step provider in billing generation.');
}

fs.writeFileSync(file, source, 'utf8');
console.log('[SONARA][ACE-Step] Production billing locked to ACE-Step 1.5 XL-Turbo through api.sonaraenterprise.com. Eleven disabled for production generation.');
