import fs from 'node:fs';

const changed = new Set();

function replaceOne(path, oldText, newText, required = true) {
  const src = fs.readFileSync(path, 'utf8');
  if (!src.includes(oldText)) {
    if (required) throw new Error(`Pattern not found in ${path}: ${oldText.slice(0, 160)}`);
    return false;
  }
  const out = src.replace(oldText, newText);
  fs.writeFileSync(path, out);
  changed.add(path);
  return true;
}

function replaceAll(path, oldText, newText, required = false) {
  const src = fs.readFileSync(path, 'utf8');
  if (!src.includes(oldText)) {
    if (required) throw new Error(`Pattern not found in ${path}: ${oldText.slice(0, 160)}`);
    return 0;
  }
  const count = src.split(oldText).length - 1;
  fs.writeFileSync(path, src.split(oldText).join(newText));
  changed.add(path);
  return count;
}

const router = 'cloudflare/sonara-molab-xl-router.mjs';
replaceOne(router,
  "const FIDELITY_PROFILE = 'sonara-fidelity-v14-single-batch-fast1-quality2';",
  "const FIDELITY_PROFILE = 'sonara-fidelity-v15-ultra-speed-max-fast1-quality2-ultra2';"
);
replaceOne(router,
  "if (profile === 'ultra') return 8;\n  if (profile === 'quality') return 2;",
  "if (profile === 'ultra') return 2;\n  if (profile === 'quality') return 2;"
);
replaceOne(router,
  "if (profileOf(body) === 'ultra' && realMusic) return 'heun';",
  "if (profileOf(body) === 'ultra' && realMusic) return 'euler';"
);
replaceOne(router,
  "use_constrained_decoding: profile === 'ultra' && realMusic && hasVocals,",
  "use_constrained_decoding: false,"
);
replaceOne(router,
  "constrained_decoding: profile === 'ultra' && realMusic && hasVocals,",
  "constrained_decoding: false,"
);
replaceOne(router,
  "sonara_generation_profile: profile === 'ultra' ? 'ultra' : 'auto',",
  "sonara_generation_profile: 'auto',"
);
replaceAll(router, 'ultraInferenceSteps: 8,', 'ultraInferenceSteps: 2,', true);

const speed = 'cloudflare/sonara-speed-v4-edge.mjs';
replaceOne(speed, 'const ULTRA_STEPS = 8;', 'const ULTRA_STEPS = 2;');
replaceOne(speed,
  "      sonaraDirectorBypass: false,\n      sonaraRealMusic: true,\n      sonara_real_music: true,\n      sonaraAutoRepair: true,\n      sonaraSpeedV4: VERSION,\n      sonaraFastUltra: false,\n      sonaraSpeedInferenceSteps: ULTRA_STEPS,\n      sonaraSpeedSampler: 'heun',",
  "      sonaraDirectorBypass: true,\n      sonaraRealMusic: true,\n      sonara_real_music: true,\n      sonaraAutoRepair: false,\n      sonaraSpeedV4: VERSION,\n      sonaraFastUltra: true,\n      sonaraSpeedInferenceSteps: ULTRA_STEPS,\n      sonaraSpeedSampler: 'euler',"
);
replaceOne(speed, "      lmThinking: profile === 'ultra',", '      lmThinking: false,');

const real = 'cloudflare/sonara-real-music-v3-edge.mjs';
replaceOne(real,
  "  const qualityFastBatch = profile === 'quality';",
  "  const qualityFastBatch = profile === 'quality' || profile === 'ultra';"
);
replaceOne(real,
  "    sonaraAutoRepair: profile === 'ultra',",
  '    sonaraAutoRepair: false,'
);
replaceOne(real,
  "    sonaraAutomaticCandidateRanking: profile === 'ultra',",
  '    sonaraAutomaticCandidateRanking: false,'
);

const verify = 'scripts/verify-quality-latency-v14.mjs';
replaceAll(verify, 'ultraInferenceSteps: 8', 'ultraInferenceSteps: 2');
replaceAll(verify, 'const ULTRA_STEPS = 8;', 'const ULTRA_STEPS = 2;');
replaceAll(verify, 'ULTRA_STEPS=8', 'ULTRA_STEPS=2');

const workflow = '.github/workflows/configure-molab-xl.yml';
replaceAll(workflow,
  'sonara-fidelity-v14-single-batch-fast1-quality2',
  'sonara-fidelity-v15-ultra-speed-max-fast1-quality2-ultra2'
);
replaceAll(workflow, '.ultraInferenceSteps == 8', '.ultraInferenceSteps == 2');
replaceAll(workflow, 'FAST=1, QUALITY=2, one batch with 2 tracks; ULTRA=8.', 'FAST=1, QUALITY=2, ULTRA=2 low-latency Euler.');

for (const path of [
  'cloudflare/sonara-fast-80-rescue-v1.test.mjs',
  'cloudflare/sonara-natural-tone-v14.test.mjs',
  '.github/workflows/deploy-fast-80-rescue-v1.yml',
  '.github/workflows/deploy-quality-ab-diversity-v8.yml',
  '.github/workflows/deploy-natural-tone-v14.yml',
  '.github/workflows/deploy-rich-arrangement-v13.yml',
  '.github/workflows/deploy-quality-47-rescue-v1.yml'
]) {
  if (!fs.existsSync(path)) continue;
  replaceAll(path, 'ultraInferenceSteps: 8', 'ultraInferenceSteps: 2');
  replaceAll(path, '.ultraInferenceSteps == 8', '.ultraInferenceSteps == 2');
}

const ui = 'src/components/generator/GenerationProfileControl.tsx';
if (fs.existsSync(ui)) {
  replaceOne(ui,
    'FAST e QUALITY usano un solo batch RTX; ULTRA mantiene ranking e rifinitura avanzata.',
    'FAST, QUALITY e ULTRA usano il percorso RTX a bassa latenza; ULTRA mantiene il profilo Real Music avanzato senza ranking o riparazioni extra.',
    false
  );
}

const bootstrap = 'scripts/ace-step-rtx6000pro-full-fresh-bootstrap-0905.py';
if (fs.existsSync(bootstrap)) {
  replaceAll(bootstrap, 'ULTRA_INFERENCE_STEPS=8_ROUTER_CONTROLLED', 'ULTRA_INFERENCE_STEPS=2_ROUTER_CONTROLLED');
  replaceAll(bootstrap, "'ultra': 8", "'ultra': 2");
  replaceAll(bootstrap, 'ULTRA=8', 'ULTRA=2');
}

console.log('SONARA_ULTRA_SPEED_MAX_V15=PATCHED');
console.log([...changed].sort().join('\n'));
