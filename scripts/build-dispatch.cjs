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

console.log('[SONARA] Validating professional music taxonomy.');
run(['tsx', 'src/musicStyleIntelligence.professional.test.ts']);

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
