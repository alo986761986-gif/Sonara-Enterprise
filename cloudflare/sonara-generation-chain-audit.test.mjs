import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFreeMolabR2Payload } from './sonara-direct-prompt-r2.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('Creator billing routes explicitly chosen ACE XL models before legacy provider fallback', () => {
  const source = read('api/billing/[...path].ts');
  assert.match(source, /const aceCreator = body\.engineId === 'sonara_ace_step_v15_modal'/);
  assert.match(source, /body\.sonaraPromptMode === 'free'/);
  assert.match(source, /body\.sonaraPromptMode === 'guided'/);
  assert.match(source, /const useEleven = !aceCreator && !selectedOpenModel/);
  assert.match(source, /creatorEngineProvider: 'ace_step_xl'/);
  assert.match(source, /SONARA_ENGINE_API_URL/);
});

test('ACE-Step always receives WAV when cloud relay requires RIFF PCM', () => {
  const free = buildFreeMolabR2Payload({
    rawPrompt: 'Jazz fusion instrumental, Rhodes and fretless bass at 150 BPM',
    sonaraAceVariant: 'xl-sft', sonaraSftQualityPro: true,
    durationSec: 120
  });
  assert.equal(free.audio_format, 'wav');
  assert.equal(free.instrumental, true);
  assert.equal(free.lyrics, '[Instrumental]');
  assert.equal(free.bpm, 150);
  assert.equal(free.model, 'acestep-v15-xl-sft');
  const router = read('cloudflare/sonara-molab-xl-router.mjs');
  assert.match(router, /configured\.audio_format = 'wav'/);
  const agent = read('molab/sonara_r2_pull_agent.py');
  assert.match(agent, /data\[:4\] != b'RIFF'/);
});

test('Technical waveform scoring must not be labeled musical quality', () => {
  const app = read('src/App.tsx');
  assert.match(app, /Verifica tecnica audio \(non qualità musicale\)/);
  assert.doesNotMatch(app, /Professional audio gate:/);
  assert.match(app, /reportedModel/);
  assert.match(app, /Modello non verificato/);
});

test('Site endpoint audit must be read-only and check real Creator provider', () => {
  const audit = read('scripts/sonara-public-generation-audit.mjs');
  assert.match(audit, /creatorEngineProvider/);
  assert.match(audit, /LIVE_PROMPT_LIBERO_UI/);
  assert.match(audit, /GATEWAY_XL_SFT/);
  assert.match(audit, /R2_RELAY_JOB_QUEUE/);
  assert.doesNotMatch(audit, /\brelease_task\b|\/enqueue\b/);
});
