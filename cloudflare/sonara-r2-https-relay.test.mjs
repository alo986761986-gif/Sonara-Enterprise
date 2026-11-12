import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import runtime, { relayQueueKey, relayQueueJobId } from './sonara-r2-https-relay.mjs';

test('relay queue index is timestamp ordered and reversible', () => {
  const id='sr2_12345678-1234-1234-1234-123456789abc';
  const earlier=relayQueueKey(10,id);
  const later=relayQueueKey(1000,id);
  assert.ok(earlier < later);
  assert.equal(relayQueueJobId(later),id);
  assert.match(later,/^relay-v1\/queue\/\d{13}\/sr2_/);
});

const hashToken = token => createHash('sha256').update(token).digest('hex');
const primary = 'existing-notebook-sample-private-token-with-strong-length';
const newNotebook = 'new-notebook-separate-sample-private-token-with-length';
const thirdNotebook = 'third-notebook-sample-private-token-with-strong-length';
const fourthNotebook = 'fourth-notebook-independent-sample-private-token-long';
const fifthNotebook = 'fifth-notebook-independent-sample-private-token-long';
const sixthNotebook = 'sixth-notebook-separate-rtx6000-local-token-test-long';
const seventhNotebook = 'seventh-notebook-independent-rtx6000-local-token-long';
const eighthNotebook = 'eighth-notebook-independent-rtx6000-recovery-token-long';
const pairingEnv = {
  SONARA_RELAY_TOKEN_SHA256: hashToken(primary),
  SONARA_RELAY_TOKEN_SHA256_SECONDARY: hashToken(newNotebook),
  SONARA_RELAY_TOKEN_SHA256_TERTIARY: hashToken(thirdNotebook),
  SONARA_RELAY_TOKEN_SHA256_QUATERNARY: hashToken(fourthNotebook),
  SONARA_RELAY_TOKEN_SHA256_QUINARY: hashToken(fifthNotebook),
  SONARA_RELAY_TOKEN_SHA256_SENARY: hashToken(sixthNotebook),
  SONARA_RELAY_TOKEN_SHA256_SEPTENARY: hashToken(seventhNotebook),
  SONARA_RELAY_TOKEN_SHA256_OCTONARY: hashToken(eighthNotebook),
  SONARA_R2_RELAY_ENABLED: 'true',
  SONARA_INTERNAL_PROXY_SECRET: 'gateway-test-secret',
};

async function authenticate(token, env=pairingEnv) {
  const request = new Request('https://api.sonaraenterprise.com/api/sonara-relay/auth', {
    headers: { 'X-Sonara-Relay-Token': token, 'X-Sonara-Agent-Revision': 'sonara-https-agent-guard-v5' }
  });
  return runtime.fetch(request, env, {});
}

test('all eight paired notebook fingerprints authenticate without revoking old ones', async () => {
  const first = await authenticate(primary);
  const second = await authenticate(newNotebook);
  const third = await authenticate(thirdNotebook);
  const fourth = await authenticate(fourthNotebook);
  const fifth = await authenticate(fifthNotebook);
  const sixth = await authenticate(sixthNotebook);
  const seventh = await authenticate(seventhNotebook);
  const eighth = await authenticate(eighthNotebook);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 200);
  assert.equal(fourth.status, 200);
  assert.equal(fifth.status, 200);
  assert.equal(sixth.status, 200);
  assert.equal(seventh.status, 200);
  assert.equal(eighth.status, 200);
  const data = await second.json();
  assert.equal(data.authenticated, true);
  assert.equal(data.referenceAgentRevision, 'sonara-https-agent-guard-v5');
  assert.equal(data.gatewayConfigured, true);
});

test('unpaired notebook, near-match and missing fingerprint are rejected', async () => {
  assert.equal((await authenticate('another-valid-length-token-for-a-third-notebook')).status, 401);
  assert.equal((await authenticate(newNotebook + 'x')).status, 401);
  assert.equal((await authenticate(thirdNotebook + 'x')).status, 401);
  assert.equal((await authenticate(fourthNotebook + 'x')).status, 401);
  assert.equal((await authenticate(fifthNotebook + 'x')).status, 401);
  assert.equal((await authenticate(sixthNotebook + 'x')).status, 401);
  assert.equal((await authenticate(seventhNotebook + 'x')).status, 401);
  assert.equal((await authenticate(eighthNotebook + 'x')).status, 401);
  assert.equal((await authenticate(newNotebook, { SONARA_RELAY_TOKEN_SHA256_SECONDARY:'bad' })).status, 401);
  assert.equal((await authenticate(thirdNotebook, { SONARA_RELAY_TOKEN_SHA256_TERTIARY:'bad' })).status, 401);
  assert.equal((await authenticate(fourthNotebook, { SONARA_RELAY_TOKEN_SHA256_QUATERNARY:'bad' })).status, 401);
  assert.equal((await authenticate(fifthNotebook, { SONARA_RELAY_TOKEN_SHA256_QUINARY:'bad' })).status, 401);
  assert.equal((await authenticate(sixthNotebook, { SONARA_RELAY_TOKEN_SHA256_SENARY:'bad' })).status, 401);
  assert.equal((await authenticate(seventhNotebook, { SONARA_RELAY_TOKEN_SHA256_SEPTENARY:'bad' })).status, 401);
  assert.equal((await authenticate(eighthNotebook, { SONARA_RELAY_TOKEN_SHA256_OCTONARY:'bad' })).status, 401);
});

test('rotated eighth fingerprint accepts new MoLab token and rejects superseded token', async () => {
  const latest='new-private-token-example-for-rotated-eighth-home-notebook-long';
  const previous='eighth-notebook-independent-rtx6000-recovery-token-long';
  const rotated={...pairingEnv,SONARA_RELAY_TOKEN_SHA256_OCTONARY:hashToken(latest)};
  assert.equal((await authenticate(latest,rotated)).status,200);
  assert.equal((await authenticate(previous,rotated)).status,401);
  for(const token of [primary,newNotebook,thirdNotebook,fourthNotebook,fifthNotebook,sixthNotebook,seventhNotebook]) {
    assert.equal((await authenticate(token,rotated)).status,200);
  }
});

test('existing Worker-only secret remains valid separately', async () => {
  const secret = 'private-worker-machine-secret-longer-than-thirty-two';
  const response = await authenticate(secret, { SONARA_RELAY_TOKEN: secret });
  assert.equal(response.status, 200);
});


test('dedicated V4 Pro fingerprint authenticates only matching V3 agent, no legacy relay', async () => {
  const proToken = 'new-independent-sonara-pro-notebook-credential-for-testing';
  const fingerprint = hashToken(proToken);
  const env = {
    ...pairingEnv,
    SONARA_REMIX_PRO_ENABLED: 'true',
    SONARA_REMIX_PRO_BILLING_READY: 'true',
    SONARA_REMIX_PRO_TOKEN_SHA256: fingerprint,
    SONARA_AUDIO_BUCKET: {
      store: new Map(),
      async put(key, data) { this.store.set(key, data); return {etag:'mock'}; },
      async get(key) {
        const val=this.store.get(key);
        return val===undefined?null:{json:async()=>JSON.parse(val)};
      }
    }
  };
  const heartbeat = (token, revision) => runtime.fetch(new Request(
    'https://api.sonaraenterprise.com/api/sonara-relay/pro-heartbeat', {
      method:'POST',
      headers:{
        'x-sonara-relay-token':token,
        'x-sonara-pro-agent-revision':revision,
        'content-type':'application/json'
      },
      body:JSON.stringify({gpuReady:true,formatsReady:true})
    }), env, {});
  const rev='sonara-remix-pro-r2-agent-v3-dual-reference-fusion';
  assert.equal((await heartbeat(proToken, rev)).status,200);
  const caps=await runtime.fetch(new Request(
    'https://api.sonaraenterprise.com/api/sonara-relay/pro-capabilities'),env,{});
  assert.equal(caps.status,200);
  const data=await caps.json();
  assert.equal(data.available,true);
  assert.equal(data.fusionAvailable,true);
  assert.equal((await heartbeat(proToken+'x', rev)).status,401);
  assert.equal((await heartbeat(proToken,'sonara-remix-pro-r2-agent-v2-longwav')).status,401);
  assert.equal((await authenticate(proToken,env)).status,401);
  assert.equal((await authenticate(primary,env)).status,200);
});

test('dedicated Pro fingerprint is disabled if missing, malformed or not matching', async () => {
  const token='independent-pro-agent-token-test-with-sufficient-length';
  const makeEnv = expected => ({
    SONARA_RELAY_TOKEN_SHA256:hashToken(primary),
    SONARA_REMIX_PRO_TOKEN_SHA256: expected,
    SONARA_REMIX_PRO_ENABLED:'true',
    SONARA_REMIX_PRO_BILLING_READY:'true',
    SONARA_R2_RELAY_ENABLED:'true',
    SONARA_AUDIO_BUCKET:{async put(){throw Error('must not reach storage')}}
  });
  const send = (expected, text=token) => runtime.fetch(new Request(
    'https://api.sonaraenterprise.com/api/sonara-relay/pro-heartbeat',{
      method:'POST',headers:{
        'X-Sonara-Relay-Token':text,
        'X-Sonara-Pro-Agent-Revision':'sonara-remix-pro-r2-agent-v3-dual-reference-fusion',
        'Content-Type':'application/json'},
      body:'{"gpuReady":true}'
    }),makeEnv(expected),{});
  assert.equal((await send(undefined)).status,401);
  assert.equal((await send('invalid')).status,401);
  assert.equal((await send(hashToken(token),token+'x')).status,401);
  assert.equal((await send(hashToken(token),'short')).status,401);
});
