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
const pairingEnv = {
  SONARA_RELAY_TOKEN_SHA256: hashToken(primary),
  SONARA_RELAY_TOKEN_SHA256_SECONDARY: hashToken(newNotebook),
  SONARA_R2_RELAY_ENABLED: 'true',
  SONARA_INTERNAL_PROXY_SECRET: 'gateway-test-secret',
};

async function authenticate(token, env=pairingEnv) {
  const request = new Request('https://api.sonaraenterprise.com/api/sonara-relay/auth', {
    headers: { 'X-Sonara-Relay-Token': token, 'X-Sonara-Agent-Revision': 'sonara-https-agent-guard-v5' }
  });
  return runtime.fetch(request, env, {});
}

test('old and newly paired notebook fingerprint both authenticate', async () => {
  const first = await authenticate(primary);
  const second = await authenticate(newNotebook);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const data = await second.json();
  assert.equal(data.authenticated, true);
  assert.equal(data.referenceAgentRevision, 'sonara-https-agent-guard-v5');
  assert.equal(data.gatewayConfigured, true);
});

test('unpaired notebook, near-match and missing fingerprint are rejected', async () => {
  assert.equal((await authenticate('another-valid-length-token-for-a-third-notebook')).status, 401);
  assert.equal((await authenticate(newNotebook + 'x')).status, 401);
  assert.equal((await authenticate(newNotebook, { SONARA_RELAY_TOKEN_SHA256_SECONDARY:'bad' })).status, 401);
});

test('existing Worker-only secret remains valid separately', async () => {
  const secret = 'private-worker-machine-secret-longer-than-thirty-two';
  const response = await authenticate(secret, { SONARA_RELAY_TOKEN: secret });
  assert.equal(response.status, 200);
});
