const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'cloudflare/sonara-engine-v9-dual-fast.mjs');
let source = fs.readFileSync(file, 'utf8');

function replaceRequired(from, to, label) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`[SONARA v16] patch failed: ${label}`);
  source = source.replace(from, to);
}

replaceRequired(
  "const KAGGLE_PROFILE = 'kaggle-t4x2-ultra-fast-v2';",
  "const KAGGLE_PROFILE = 'kaggle-t4x2-extreme-fidelity-v16';",
  'quality profile'
);
replaceRequired(
  'const KAGGLE_STEPS = 4;',
  'const KAGGLE_STEPS = 12;',
  'increase inference steps'
);
replaceRequired(
  'const KAGGLE_GUIDANCE_SCALE = 1.0;',
  'const KAGGLE_GUIDANCE_SCALE = 1.15;',
  'increase controlled guidance'
);
replaceRequired(
  "    thinking: isKaggle ? false : payload.thinking,\n    use_format: false,\n    use_cot_caption: false,\n    use_cot_language: false,\n    constrained_decoding: false,",
  "    thinking: isKaggle ? true : payload.thinking,\n    use_format: false,\n    use_cot_caption: isKaggle ? true : payload.use_cot_caption,\n    use_cot_language: isKaggle ? true : payload.use_cot_language,\n    constrained_decoding: isKaggle ? true : payload.constrained_decoding,",
  'enable reasoning and constrained decoding'
);
replaceRequired(
  "    infer_method: isKaggle ? 'ode' : payload.infer_method,",
  "    infer_method: isKaggle ? (payload.infer_method === 'sde' ? 'sde' : 'ode') : payload.infer_method,",
  'preserve weirdness inference method'
);
replaceRequired(
  "          kaggleThinking: false,",
  "          kaggleThinking: true,",
  'health thinking flag'
);
replaceRequired(
  "          kaggleInferMethod: 'ode',",
  "          kaggleInferMethod: 'adaptive-ode-sde',",
  'health adaptive method'
);
replaceRequired(
  "        thinking: selected.every(worker => worker.kind === 'kaggle') ? false : null,",
  "        thinking: selected.every(worker => worker.kind === 'kaggle') ? true : null,",
  'generation metadata thinking'
);
replaceRequired(
  "        inferMethod: selected.every(worker => worker.kind === 'kaggle') ? 'ode' : null,",
  "        inferMethod: selected.every(worker => worker.kind === 'kaggle') ? creativeControls.inferMethod : null,",
  'generation metadata infer method'
);
replaceRequired(
  "          ? 'SONARA ULTRA FAST: A su T4 #0 + B su T4 #1'",
  "          ? 'SONARA EXTREME FIDELITY: A su T4 #0 + B su T4 #1'",
  'quality stage label'
);
replaceRequired(
  "          currentStage: 'SONARA ULTRA FAST: T4 #0 + T4 #1 stanno renderizzando'",
  "          currentStage: 'SONARA EXTREME FIDELITY: T4 #0 + T4 #1 stanno renderizzando'",
  'render stage label'
);

fs.writeFileSync(file, source, 'utf8');
console.log('[SONARA] Extreme Fidelity v16 activated: 12-step T4 render, reasoning, constrained decoding, adaptive ODE/SDE.');
