const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (process.env.WORKERS_CI === '1') {
  console.log('[SONARA] Cloudflare Workers build detected (WORKERS_CI=1).');
  console.log('[SONARA] Skipping the Node/Vite application build; Wrangler will deploy the dedicated Modal proxy Worker.');
  process.exit(0);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function runCommand(command, args, { fatal = true } = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false
  });

  if (result.error) {
    console.error(result.error);
    if (fatal) process.exit(1);
    return false;
  }

  if (result.status !== 0) {
    if (fatal) process.exit(result.status ?? 1);
    return false;
  }

  return true;
}

const oneTimeDiagnostic = path.join(process.cwd(), 'scripts', 'one-time-billing-diagnostic.mjs');
if (
  process.env.VERCEL === '1' &&
  process.env.VERCEL_ENV === 'production' &&
  fs.existsSync(oneTimeDiagnostic)
) {
  console.log('[SONARA] Running one-time private billing diagnostic.');
  runCommand(process.execPath, [oneTimeDiagnostic], { fatal: false });
}

runCommand(npx, ['vite', 'build']);
runCommand(npx, [
  'esbuild',
  'server.ts',
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--packages=external',
  '--sourcemap',
  '--outfile=dist/server.cjs'
]);
