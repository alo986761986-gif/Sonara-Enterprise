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

// Never let one T4 submission crash the entire Cloudflare request with a non-JSON HTTP 500.
// Keep every worker that accepted the task and degrade 2 -> 1 cleanly when necessary.
replaceAny(
  "  const selected = workers.slice(0, 2);\n  const submissions = await Promise.all(selected.map((worker, index) => submitOnWorker(worker, env, payloadForWorker(payload, worker, index))));\n  const jobId = `d9pair_${crypto.randomUUID()}`;",
  "  const selected = workers.slice(0, 2);\n  const settled = await Promise.allSettled(selected.map((worker, index) => submitOnWorker(worker, env, payloadForWorker(payload, worker, index))));\n  const submissions = settled.flatMap((result, index) => {\n    if (result.status === 'fulfilled') return [result.value];\n    console.error('[SONARA T4 SUBMIT]', { worker: selected[index]?.id, error: result.reason instanceof Error ? result.reason.message : String(result.reason || 'submit failed') });\n    return [];\n  });\n  if (!submissions.length) {\n    const errors = settled\n      .filter(result => result.status === 'rejected')\n      .map(result => result.reason instanceof Error ? result.reason.message : String(result.reason || 'submit failed'))\n      .filter(Boolean);\n    return json(request, {\n      error: 'Le T4 SONARA sono online ma non hanno accettato il job di generazione.',\n      retryable: true,\n      details: errors.slice(0, 2)\n    }, 503);\n  }\n  const jobId = `d9pair_${crypto.randomUUID()}`;",
  'fault tolerant dual T4 submission'
);
replaceAny(
  "      currentStage: selected.length >= 2 ? 'SONARA T4x2 tempo-locked rendering A + B' : 'SONARA tempo-locked rendering',",
  "      currentStage: submissions.length >= 2 ? 'SONARA T4x2 tempo-locked rendering A + B' : 'SONARA tempo-locked rendering su T4 disponibile',",
  'accurate active worker stage'
);

// ACE-Step /query_result wraps the generated files inside item.result as a JSON string.
// Decode that nested payload so completed T4 jobs advance from 0/2 to 1/2 and 2/2.
replaceAny(
  "      const ref = audioRefFromItem(item, worker);\n      if (ref) {\n        refs.push(ref);\n        completed += 1;\n      }",
  "      let ref = audioRefFromItem(item, worker);\n      if (!ref && status === 1) {\n        const resultItems = parseItems(item?.result);\n        for (const resultItem of resultItems) {\n          ref = audioRefFromItem(resultItem, worker);\n          if (ref) break;\n        }\n        if (!ref) {\n          throw new SonaraEngineError(`SONARA worker ${worker.id} completed without returning an audio file.`, 502, false);\n        }\n      }\n      if (ref) {\n        refs.push(ref);\n        completed += 1;\n      }",
  'decode nested ACE-Step query_result audio files'
);

// Make /api/health report the runtime worker pool actually visible to this Worker.
replaceAny(
  "export default {\n  async fetch(request, env, ctx) {\n    const pair = await maybeSubmitPair(request, env);",
  "export default {\n  async fetch(request, env, ctx) {\n    const requestUrl = new URL(request.url);\n    if (request.method === 'GET' && requestUrl.pathname === '/api/health') {\n      const baseResponse = await baseEngine.fetch(request, env, ctx);\n      if (!baseResponse.ok) return baseResponse;\n      try {\n        const payload = await baseResponse.clone().json();\n        const configured = configuredWorkers(env);\n        const ready = await healthyWorkers(env);\n        return json(request, {\n          ...payload,\n          aceStepConfiguredWorkerCount: configured.length,\n          aceStepWorkerCount: ready.length,\n          aceStepWorkers: ready.map(worker => ({ id: worker.id, kind: worker.kind, baseUrl: worker.baseUrl })),\n          kaggleProfile: KAGGLE_PROFILE,\n          kaggleInferenceSteps: KAGGLE_STEPS,\n          kaggleGuidanceScale: KAGGLE_GUIDANCE_SCALE\n        }, baseResponse.status);\n      } catch {\n        return baseResponse;\n      }\n    }\n    const pair = await maybeSubmitPair(request, env);",
  'runtime worker health exposure'
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
if (!source.includes('const resultItems = parseItems(item?.result)')) {
  throw new Error('[SONARA v16] ACE-Step nested query_result parser missing before deploy');
}
if (!source.includes('Promise.allSettled(selected.map')) {
  throw new Error('[SONARA v16] fault tolerant T4 submission missing before deploy');
}
if (!source.includes('aceStepWorkers: ready.map')) {
  throw new Error('[SONARA v16] runtime worker health exposure missing before deploy');
}

fs.writeFileSync(file, source, 'utf8');
console.log('[SONARA] Extreme Fidelity v16 activated with resilient dual T4 submit, worker health, BPM lock and ACE-Step result decoding.');