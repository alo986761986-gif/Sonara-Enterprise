import test from 'node:test';
import assert from 'node:assert/strict';
import { withGatewayVerifier, deriveRelayGatewayInternalKey } from './sonara-gateway-verifier.mjs';

const path = '/api/sonara-multi/audio/sr2_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('HeartMuLa signed audio is verified with the same derived key as the job gateway', async () => {
  const env = {
    SONARA_GATEWAY_SHA256: '1'.repeat(64),
    SONARA_RELAY_TOKEN: 'private-test-relay-secret-'.repeat(3),
    SONARA_R2_RELAY_ENABLED: 'true'
  };
  const expected = await deriveRelayGatewayInternalKey(env);
  let observed = false;
  const runtime = {
    async fetch(req, scoped) {
      observed = true;
      assert.equal(new URL(req.url).pathname, path);
      assert.equal(scoped.SONARA_INTERNAL_PROXY_SECRET, expected);
      assert.equal(req.headers.get('X-Sonara-Internal-Secret'), null);
      return new Response('ok');
    }
  };
  const response = await withGatewayVerifier(runtime).fetch(
    new Request('https://api.sonaraenterprise.com' + path + '?exp=9999999999999&sig=' + 'a'.repeat(64)),
    env, {}
  );
  assert.equal(response.status, 200);
  assert.equal(observed, true);
});
test('HeartMuLa agent heartbeat uses the derived key while keeping its relay token', async () => {
  const env = {
    SONARA_GATEWAY_SHA256: '1'.repeat(64),
    SONARA_RELAY_TOKEN: 'private-test-relay-secret-'.repeat(3),
  };
  let observed = false;
  const runtime = {
    async fetch(req, scoped) {
      observed = true;
      assert.equal(scoped.SONARA_INTERNAL_PROXY_SECRET, await deriveRelayGatewayInternalKey(env));
      assert.equal(req.headers.get('X-Sonara-Relay-Token'), 'agent-secret-test');
      return new Response('ok');
    }
  };
  const resp = await withGatewayVerifier(runtime).fetch(
    new Request('https://api.sonaraenterprise.com/api/sonara-multi/agent/heartbeat',
      {method:'POST',headers:{'X-Sonara-Relay-Token':'agent-secret-test'},body:'{}'}),
    env,{}
  );
  assert.equal(resp.status,200);
  assert.equal(observed,true);
});
