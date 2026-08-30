const { spawnSync } = require('node:child_process');

if (process.env.WORKERS_CI === '1') {
  console.log('[SONARA] Cloudflare Workers build detected (WORKERS_CI=1).');
  console.log('[SONARA] Skipping the Node/Vite application build; Wrangler will deploy the dedicated Modal proxy Worker.');
  process.exit(0);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const node = process.execPath;

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runOptional(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false
  });
  if (result.error || result.status !== 0) {
    console.warn('[SONARA][Firebase] Authorized-domain repair could not complete during build; application build will continue and runtime repair remains available.');
    return false;
  }
  return true;
}

function run(args) {
  runCommand(npx, args);
}

console.log('[SONARA] Checking Firebase authorized domains before build.');
runOptional(node, ['scripts/ensure-firebase-authorized-domains.cjs']);

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

console.log('[SONARA] Validating professional music taxonomy.');
run(['tsx', 'src/musicStyleIntelligence.professional.test.ts']);

console.log('[SONARA] Validating canonical real family > genre > subgenre taxonomy v4.');
run(['tsx', 'src/data/realMusicTaxonomyV4.test.ts']);

console.log('[SONARA] Validating Prompt Director and Suno-style prompt intelligence.');
run(['tsx', 'src/services/promptDirector.test.ts']);

console.log('[SONARA] Validating authoritative backend genre lock.');
run(['tsx', 'backend/test/genre_lock_authoritative_v3.test.ts']);

console.log('[SONARA] Validating Cloudflare v14 professional prompt preservation.');
runCommand(node, ['--test', 'cloudflare/sonara-engine-v14-universal-taxonomy-lock.test.mjs']);

console.log('[SONARA] Validating Professional Lyrics v2 quality and genre synchronization.');
run(['tsx', 'src/professionalLyrics.test.ts']);

run(['vite', 'build']);
run([
  'esbuild',
  'server.ts',
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--packages=external',
  '--sourcemap',
  '--outfile=dist/server.cjs'
]);
