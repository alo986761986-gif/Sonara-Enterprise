const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'cloudflare/sonara-engine-v9-dual-fast.mjs');
let source = fs.readFileSync(file, 'utf8');

function replaceAny(fromValues, to, label) {
  if (source.includes(to)) return;
  const candidates = Array.isArray(fromValues) ? fromValues : [fromValues];
  const from = candidates.find(value => source.includes(value));
  if (!from) throw new Error(`[SONARA v16] patch failed: ${label}`);
  source = source.replace(from, to);
}

replaceAny(
  [
    "const KAGGLE_PROFILE = 'kaggle-t4x2-ultra-fast-v2';",
    "const KAGGLE_PROFILE = 'kaggle-t4x2-tempo-lock-v3';"
  ],
  "const KAGGLE_PROFILE = 'kaggle-t4x2-extreme-fidelity-v16';",
  'quality profile'
);
replaceAny(
  ['const KAGGLE_STEPS = 4;', 'const KAGGLE_STEPS = 8;'],
  'const KAGGLE_STEPS = 12;',
  'increase inference steps'
);
replaceAny(
  'const KAGGLE_GUIDANCE_SCALE = 1.0;',
  'const KAGGLE_GUIDANCE_SCALE = 1.15;',
  'increase controlled guidance'
);
replaceAny(
  '    lm_repetition_penalty: 1.03,',
  '    lm_repetition_penalty: 1.05,',
  'reduce repetitive looping'
);
replaceAny(
  "  const shortTrack = Number(payload.audio_duration || 0) <= 90;\n  return {\n    ...payload,",
  "  const shortTrack = Number(payload.audio_duration || 0) <= 90;\n  const candidateDirection = variationIndex === 0\n    ? 'CANDIDATE A — canonical fidelity: prioritize the exact selected subgenre groove, canonical instrumentation, authentic rhythmic grammar, clean structure and unmistakable identity from the opening bars. Preserve the exact requested BPM and its perceived pulse.'\n    : 'CANDIDATE B — refined interpretation: preserve the exact selected subgenre and exact requested BPM while increasing harmonic nuance, timbral detail, performance realism, arrangement development and musical storytelling. Do not hybridize into neighboring genres and do not reinterpret high BPM as half-time.';\n  return {\n    ...payload,\n    prompt: `${payload.prompt}\\n\\n${candidateDirection}`.slice(0, 12000),",
  'differentiate A/B candidates musically'
);
replaceAny(
  "    thinking: isKaggle ? false : payload.thinking,\n    use_format: false,\n    use_cot_caption: false,\n    use_cot_language: false,\n    constrained_decoding: false,",
  "    thinking: isKaggle ? true : payload.thinking,\n    use_format: false,\n    use_cot_caption: isKaggle ? true : payload.use_cot_caption,\n    use_cot_language: isKaggle ? true : payload.use_cot_language,\n    constrained_decoding: isKaggle ? true : payload.constrained_decoding,",
  'enable reasoning and constrained decoding'
);
replaceAny(
  "    infer_method: isKaggle ? 'ode' : payload.infer_method,",
  "    infer_method: isKaggle ? (payload.infer_method === 'sde' ? 'sde' : 'ode') : payload.infer_method,",
  'preserve weirdness inference method'
);

// Legacy health/metadata patches only apply when those exact blocks are present.
const optionalPatches = [
  ["          kaggleThinking: false,", "          kaggleThinking: true,"],
  ["          kaggleInferMethod: 'ode',", "          kaggleInferMethod: 'adaptive-ode-sde',"],
  ["        thinking: selected.every(worker => worker.kind === 'kaggle') ? false : null,", "        thinking: selected.every(worker => worker.kind === 'kaggle') ? true : null,"],
  ["        inferMethod: selected.every(worker => worker.kind === 'kaggle') ? 'ode' : null,", "        inferMethod: selected.every(worker => worker.kind === 'kaggle') ? creativeControls.inferMethod : null,"],
  ["          ? 'SONARA ULTRA FAST: A su T4 #0 + B su T4 #1'", "          ? 'SONARA EXTREME FIDELITY: A su T4 #0 + B su T4 #1'"],
  ["          currentStage: 'SONARA ULTRA FAST: T4 #0 + T4 #1 stanno renderizzando'", "          currentStage: 'SONARA EXTREME FIDELITY: T4 #0 + T4 #1 stanno renderizzando'"]
];
for (const [from, to] of optionalPatches) {
  if (source.includes(from)) source = source.replace(from, to);
}

if (!source.includes('global_caption: tempoLockText(bpm)')) {
  throw new Error('[SONARA v16] BPM global caption lock missing before deploy');
}
if (!source.includes('Math.round(clamp(body.bpm, 124, 30, 300))')) {
  throw new Error('[SONARA v16] BPM 30-300 range missing before deploy');
}
if (!source.includes('never half-time')) {
  throw new Error('[SONARA v16] anti-half-time tempo lock missing before deploy');
}

fs.writeFileSync(file, source, 'utf8');
console.log('[SONARA] Extreme Fidelity v16 activated with 12-step T4 render and authoritative BPM tempo lock preserved.');
