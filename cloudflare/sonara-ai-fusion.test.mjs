import assert from 'node:assert/strict';
import test from 'node:test';
import runtime from './sonara-r2-https-relay.mjs';

const json = value => new Request('https://api.sonaraenterprise.com/api/sonara-relay/enqueue', {
  method:'POST',
  headers:{ 'Content-Type':'application/json', 'X-Sonara-Internal-Secret':'private-server-key', 'X-Sonara-User-Uid':'verified-user' },
  body:JSON.stringify(value)
});
const env = {
  SONARA_R2_RELAY_ENABLED:'true',
  SONARA_INTERNAL_PROXY_SECRET:'private-server-key',
  SONARA_AUDIO_BUCKET: { put: async () => null },
};

test('AI Fusion is disabled unless GPU fusion backend explicitly enabled', async () => {
  const caps = await runtime.fetch(new Request('https://api.sonaraenterprise.com/api/sonara-relay/fusion-capabilities'),env,{});
  assert.equal(caps.status,200);
  const body=await caps.json();
  assert.equal(body.available,false);
  assert.equal(body.mode,'dual-audio-generative-conditioning');
});

test('two-source jobs fail closed when dedicated GPU mode has not been enabled', async () => {
  const res=await runtime.fetch(json({sonaraAiFusion:{
    version:1,
    sourceReferenceId:'sref_12345678-1234-1234-1234-123456789abc',
    styleReferenceId:'sref_12345678-1234-1234-1234-123456789abd'
  }}),env,{});
  assert.equal(res.status,503);
  assert.match((await res.json()).error,/non ancora attivo/);
});

test('fusion must have two different reference IDs even when feature flag is on', async () => {
  const id='sref_12345678-1234-1234-1234-123456789abc';
  const res=await runtime.fetch(json({sonaraAiFusion:{version:1,sourceReferenceId:id,styleReferenceId:id}}),{
    ...env,SONARA_AI_FUSION_ENABLED:'true'
  },{});
  assert.equal(res.status,400);
});

test('fusion agent revision advertised by authorized probe', async () => {
  const machine='a-second-machine-token-with-more-than-32-characters';
  const res=await runtime.fetch(new Request('https://api.sonaraenterprise.com/api/sonara-relay/auth',{
    headers: {'X-Sonara-Relay-Token':machine}
  }),{...env,SONARA_RELAY_TOKEN:machine},{});
  assert.equal(res.status,200);
  const data=await res.json();
  assert.equal(data.fusionAgentRevision,'sonara-fusion-agent-v6');
});
