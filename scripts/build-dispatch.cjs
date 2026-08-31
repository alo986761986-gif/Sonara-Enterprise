const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

if (process.env.WORKERS_CI === '1') {
  console.log('[SONARA] Cloudflare Workers build detected (WORKERS_CI=1).');
  console.log('[SONARA] Skipping the Node/Vite application build; Wrangler will deploy the dedicated Modal proxy Worker.');
  process.exit(0);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const node = process.execPath;
const firebaseKeyOutput = '/tmp/sonara-firebase-web-key.txt';

function runCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, env: process.env });
  if (result.error) { console.error(result.error); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runOptional(command, args, warning) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, env: process.env });
  if (result.error || result.status !== 0) {
    console.warn(warning || '[SONARA] Optional build step failed; continuing.');
    return false;
  }
  return true;
}

function run(args) { runCommand(npx, args); }

console.log('[SONARA] Checking Firebase authorized domains before build.');
runOptional(
  node,
  ['scripts/ensure-firebase-authorized-domains.cjs'],
  '[SONARA][Firebase] Authorized-domain repair could not complete during build; application build will continue.'
);

if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production') {
  console.log('[SONARA][Firebase] Attempting optional Firebase web API key rotation.');
  const rotated = runOptional(
    node,
    ['scripts/rotate-firebase-web-key-on-build.cjs'],
    '[SONARA][Firebase] Web-key rotation unavailable; continuing production build with configured runtime key.'
  );

  if (rotated && fs.existsSync(firebaseKeyOutput)) {
    const rotatedKey = fs.readFileSync(firebaseKeyOutput, 'utf8').trim();
    if (rotatedKey) {
      process.env.VITE_FIREBASE_API_KEY = rotatedKey;
      console.log('[SONARA][Firebase] Replacement API key injected into this Vite production build.');
    }
  }
}

console.log('[SONARA] Activating production audio suite.');
runCommand(node, ['scripts/activate-production-suite.cjs']);
console.log('[SONARA] Activating electronic genre-specific lyric engines.');
runCommand(node, ['scripts/activate-electronic-genres.cjs']);
console.log('[SONARA] Activating universal taxonomy generation.');
runCommand(node, ['scripts/activate-universal-genres.cjs']);
console.log('[SONARA] Activating professional family > genre > subgenre > atmosphere hierarchy.');
runCommand(node, ['scripts/activate-professional-music-taxonomy.cjs']);
console.log('[SONARA] Activating canonical real-genre taxonomy v4.');
runCommand(node, ['scripts/activate-real-music-taxonomy-v4.cjs']);
console.log('[SONARA] Activating authoritative selected-style engine v3.');
runCommand(node, ['scripts/activate-authoritative-genre-engine-v3.cjs']);
console.log('[SONARA] Enforcing absolute selected-style precedence.');
runCommand(node, ['scripts/activate-authoritative-style-precedence-v3.cjs']);
console.log('[SONARA] Activating ACE-Step 1.5 XL-Turbo production routing.');
runCommand(node, ['scripts/activate-ace-step-production.cjs']);
console.log('[SONARA] Validating professional music taxonomy.');
run(['tsx', 'src/musicStyleIntelligence.professional.test.ts']);
console.log('[SONARA] Validating canonical real family > genre > subgenre taxonomy v4.');
run(['tsx', 'src/data/realMusicTaxonomyV4.test.ts']);
console.log('[SONARA] Validating authoritative real musical instruments.');
run(['tsx', 'src/data/realMusicalInstruments.test.ts']);
console.log('[SONARA] Validating Prompt Director and Suno-style prompt intelligence.');
run(['tsx', 'src/services/promptDirector.test.ts']);
console.log('[SONARA] Validating authoritative backend genre lock.');
run(['tsx', 'backend/test/genre_lock_authoritative_v3.test.ts']);
console.log('[SONARA] Validating Cloudflare v14 professional prompt preservation.');
runCommand(node, ['--test', 'cloudflare/sonara-engine-v14-universal-taxonomy-lock.test.mjs']);
console.log('[SONARA] Validating Professional Lyrics v2 quality and genre synchronization.');
run(['tsx', 'src/professionalLyrics.test.ts']);
console.log('[SONARA] Running 500-case music benchmark and release standard.');
run(['tsx', 'src/benchmark/sonaraMusicBenchmark.test.ts']);
console.log('[SONARA] Protecting Suno-level product capability contract.');
run(['tsx', 'src/benchmark/sonaraProductCapability.test.ts']);

run(['vite', 'build']);
run(['esbuild', 'server.ts', '--bundle', '--platform=node', '--format=cjs', '--packages=external', '--sourcemap', '--outfile=dist/server.cjs']);

try { fs.rmSync(firebaseKeyOutput, { force: true }); } catch {}
