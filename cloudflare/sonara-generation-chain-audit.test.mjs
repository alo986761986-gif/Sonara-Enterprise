import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFreeMolabR2Payload } from './sonara-direct-prompt-r2.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('Native Cloudflare Creator routes directly to authenticated ACE-Step R2', () => {
  const gateway = read('cloudflare/sonara-ab-player-visibility-edge.mjs');
  assert.match(gateway, /const relayEnabled = env\.SONARA_R2_RELAY_ENABLED === 'true'/);
  assert.match(gateway, /await prepareMolabR2RelayPayload\(\{ \.\.\.source, sonaraUserUid: uid \}\)/);
  assert.match(gateway, /\/api\/sonara-relay\/enqueue/);
  const entry = read('cloudflare/sonara-relay-gateway-entry.mjs');
  assert.match(entry, /bridgeAceR2BillingJob/);
  const bridge = read('cloudflare/sonara-r2-billing-job-bridge.mjs');
  assert.match(bridge, /relay-v1\/jobs\//);
  assert.match(bridge, /sonara-auth\/session/);
  assert.match(bridge, /X-Sonara-User-Uid/);
  const legacy = read('api/billing/[...path].ts');
  assert.match(legacy, /SONARA_MUSIC_PROVIDER/);
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
  assert.match(audit, /LEGACY_BILLING_FALLBACK/);
  assert.match(audit, /LIVE_PROMPT_LIBERO_UI/);
  assert.match(audit, /GATEWAY_XL_SFT/);
  assert.match(audit, /R2_RELAY_JOB_QUEUE/);
  assert.doesNotMatch(audit, /\brelease_task\b|\/enqueue\b/);
});
