const { spawnSync } = require('node:child_process');

if (process.env.WORKERS_CI === '1') {
  console.log('[SONARA] Cloudflare Workers build detected (WORKERS_CI=1).');
  console.log('[SONARA] Skipping the Node/Vite application build; Wrangler will deploy the dedicated Modal proxy Worker.');
  process.exit(0);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const node = process.execPath;

function run(command, args) {
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

console.log('[SONARA] Validating professional music taxonomy.');
run(npx, ['tsx', 'src/musicStyleIntelligence.professional.test.ts']);

console.log('[SONARA] Validating direct ACE-Step XL-SFT professional engine profile.');
run(node, ['--test', 'cloudflare/sonara-engine-v6-final.test.mjs']);

run(npx, ['vite', 'build']);
run(npx, [
  'esbuild',
  'server.ts',
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--packages=external',
  '--sourcemap',
  '--outfile=dist/server.cjs'
]);
