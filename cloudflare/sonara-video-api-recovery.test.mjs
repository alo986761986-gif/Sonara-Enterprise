import assert from 'node:assert/strict';
import { recoverVideoApi, isVideoApiRequest } from './sonara-video-api-recovery.mjs';

const workerBase = 'https://gpu1.example.test';
const env = { SONARA_VIDEO_WORKER_URL: workerBase, SONARA_ZERO_COST_VIDEO: 'true', SONARA_ENABLE_GEMINI_VIDEO: 'false' };

const generateRequest = new Request('https://sonaraenterprise.com/api/video/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
  body: JSON.stringify({ prompt: 'cinematic Naples sunset', aspectRatio: '16:9', resolution: '720p', durationSeconds: 8 })
});

assert.equal(isVideoApiRequest(generateRequest), true);
assert.equal(isVideoApiRequest(new Request('https://sonaraenterprise.com/api/billing/generate')), false);

{
  const calls = [];
  const response = await recoverVideoApi(generateRequest, {
    env,
    fetcher: async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      calls.push(url.toString());
      assert.notEqual(url.hostname.includes('googleapis.com'), true);
      assert.notEqual(url.hostname.includes('vercel.app'), true);
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', provider: 'kaggle-wan21', model: 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers', profile: 'max-t4-v3' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.pathname === '/v1/video/generate') {
        const body = JSON.parse(String(init.body || '{}'));
        assert.equal(body.prompt, 'cinematic Naples sunset');
        assert.equal(body.durationSeconds, 8);
        return new Response(JSON.stringify({ jobId: 'wan_test123', status: 'PROCESSING', progress: 2 }), {
          status: 202,
          headers: { 'content-type': 'application/json' }
        });
      }
      throw new Error(`Unexpected request ${url}`);
    }
  });
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('x-sonara-video-provider'), 'kaggle-wan21');
  assert.equal(response.headers.get('x-sonara-video-recovery'), 'cloudflare-video-json-v4-t4-only');
  const payload = await response.json();
  assert.equal(payload.jobId, 'edge_wan_test123');
  assert.equal(payload.provider, 'kaggle-wan21');
  assert.equal(payload.zeroCost, true);
  assert.equal(payload.googleBillingRequired, false);
  assert.equal(payload.geminiEnabled, false);
  assert.equal(calls.some(url => url.includes('google')), false);
  assert.equal(calls.some(url => url.includes('vercel.app')), false);
}

{
  const health = await recoverVideoApi(new Request('https://sonaraenterprise.com/api/video/edge-health'), {
    env,
    fetcher: async input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      assert.equal(url.toString(), `${workerBase}/health`);
      return new Response(JSON.stringify({ status: 'ok', provider: 'kaggle-wan21', model: 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers', profile: 'max-t4-v3', loaded: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  const payload = await health.json();
  assert.equal(health.status, 200);
  assert.equal(payload.valid, true);
  assert.equal(payload.provider, 'kaggle-wan21');
  assert.equal(payload.zeroCost, true);
  assert.equal(payload.googleBillingRequired, false);
  assert.equal(payload.geminiEnabled, false);
  assert.equal(payload.vertexEnabled, false);
  assert.equal(payload.routeMode, 'kaggle-t4-only');
}

{
  const pollRequest = new Request('https://sonaraenterprise.com/api/video/job/edge_wan_test123');
  const response = await recoverVideoApi(pollRequest, {
    env,
    fetcher: async input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      assert.equal(url.toString(), `${workerBase}/v1/video/job/wan_test123`);
      return new Response(JSON.stringify({
        jobId: 'wan_test123', status: 'COMPLETED', progress: 100,
        videoPath: '/v1/video/file/wan_test123.mp4', provider: 'kaggle-wan21', profile: 'max-t4-v3'
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const payload = await response.json();
  assert.equal(payload.status, 'COMPLETED');
  assert.equal(payload.provider, 'kaggle-wan21');
  assert.equal(payload.videoUrl, 'https://sonaraenterprise.com/api/video/edge-media?job=wan_test123');
}

{
  const longRequest = new Request('https://sonaraenterprise.com/api/video/generate', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'cinematic long video sequence', durationSeconds: 60 })
  });
  let called = false;
  const response = await recoverVideoApi(longRequest, {
    env,
    fetcher: async () => { called = true; throw new Error('should not call provider'); }
  });
  assert.equal(called, false);
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error.code, 'ZERO_COST_VIDEO_LIMIT');
  assert.equal(payload.googleBillingRequired, false);
}

{
  let googleCalled = false;
  const response = await recoverVideoApi(generateRequest, {
    env: { ...env, GEMINI_API_KEY: 'must-never-be-used', SONARA_ENABLE_GEMINI_VIDEO: 'true' },
    fetcher: async input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.hostname.includes('google')) googleCalled = true;
      if (url.pathname === '/health') return new Response(JSON.stringify({ status: 'ok', provider: 'kaggle-wan21' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.pathname === '/v1/video/generate') return new Response(JSON.stringify({ jobId: 'wan_google_blocked' }), { status: 202, headers: { 'content-type': 'application/json' } });
      throw new Error(`Unexpected ${url}`);
    }
  });
  assert.equal(response.status, 202);
  assert.equal(googleCalled, false);
}

console.log('SONARA Video AI T4-only test passed: generation bypasses Vercel/Google and uses Kaggle WAN exclusively.');
