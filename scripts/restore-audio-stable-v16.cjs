const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'cloudflare/sonara-engine-v9-dual-fast.mjs');
let source = fs.readFileSync(file, 'utf8');

function replaceExact(from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`[SONARA stable-v16] missing expected v17 block: ${label}`);
  }
  source = source.replace(from, to);
}

// Remove the v17 recursive result decoder and restore the exact v16 one-level
// ACE-Step /query_result decoding that was present in the saved stable build.
const helperStart = source.indexOf('\n\nfunction deepAudioRef(');
const helperEnd = source.indexOf('\n\nexport function buildPayload', helperStart);
if (helperStart < 0 || helperEnd < 0) {
  throw new Error('[SONARA stable-v16] recursive v17 decoder helpers not found');
}
source = source.slice(0, helperStart) + source.slice(helperEnd);

replaceExact(
`      const outcome = taskOutcome(item);
      if (outcome === 'failed' || item?.error) {
        throw new SonaraEngineError(String(item?.error || item?.message || \`SONARA worker \${worker.id} generation failed.\`), 502, false);
      }
      const ref = deepAudioRef(item, worker);
      if (ref) {
        refs.push(ref);
        completed += 1;
      } else if (outcome === 'completed') {
        throw new SonaraEngineError(\`SONARA worker \${worker.id} completed without a readable audio reference.\`, 502, false);
      }`,
`      const status = Number(item?.status ?? item?.state ?? 0);
      if (status === 2 || status === 3 || item?.error) {
        throw new SonaraEngineError(String(item?.error || item?.message || \`SONARA worker \${worker.id} generation failed.\`), 502, false);
      }
      let ref = audioRefFromItem(item, worker);
      if (!ref && status === 1) {
        const resultItems = parseItems(item?.result);
        for (const resultItem of resultItems) {
          ref = audioRefFromItem(resultItem, worker);
          if (ref) break;
        }
        if (!ref) {
          throw new SonaraEngineError(\`SONARA worker \${worker.id} completed without returning an audio file.\`, 502, false);
        }
      }
      if (ref) {
        refs.push(ref);
        completed += 1;
      }`,
  'poll result decoder'
);

replaceExact(
`    const taskCount = Math.max(1, (context.tasks || []).length);
    const elapsedMs = Math.max(0, Date.now() - Number(context.createdAt || Date.now()));
    const heartbeatProgress = Math.min(52, 20 + Math.floor(elapsedMs / 15000));
    const completionProgress = 20 + Math.round((completed / taskCount) * 70);
    const progress = Math.max(heartbeatProgress, completionProgress);`,
`    const progress = 20 + Math.round((completed / Math.max(1, (context.tasks || []).length)) * 70);`,
  'progress heartbeat'
);

replaceExact(
`      metadata: { ...(context.metadata || {}), currentStage: \`SONARA: rendering tempo-locked \${completed}/\${taskCount} • motore attivo\` }`,
`      metadata: { ...(context.metadata || {}), currentStage: \`SONARA: rendering tempo-locked \${completed}/\${(context.tasks || []).length}\` }`,
  'render stage'
);

source = source.replace("        resultDecoder: 'recursive-v17',\n", '');
source = source.replace('        progressHeartbeat: true,\n', '');

if (source.includes('function deepAudioRef') || source.includes('function taskOutcome')) {
  throw new Error('[SONARA stable-v16] v17 decoder still present after rollback');
}
if (source.includes('heartbeatProgress') || source.includes("resultDecoder: 'recursive-v17'") || source.includes('progressHeartbeat: true')) {
  throw new Error('[SONARA stable-v16] v17 heartbeat/metadata still present after rollback');
}
if (!source.includes('const resultItems = parseItems(item?.result)')) {
  throw new Error('[SONARA stable-v16] stable ACE-Step result parser missing');
}
if (!source.includes("const KAGGLE_PROFILE = 'kaggle-t4x2-extreme-fidelity-v16';")) {
  throw new Error('[SONARA stable-v16] extreme fidelity profile missing');
}
if (!source.includes('const KAGGLE_STEPS = 12;') || !source.includes('const KAGGLE_GUIDANCE_SCALE = 1.15;')) {
  throw new Error('[SONARA stable-v16] fidelity parameters changed unexpectedly');
}

fs.writeFileSync(file, source, 'utf8');
console.log('[SONARA] Audio runtime restored to saved stable v16 behavior (pre-v17 decoder/heartbeat).');
