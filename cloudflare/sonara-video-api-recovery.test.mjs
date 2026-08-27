import assert from 'node:assert/strict';
import { recoverVideoApi, isVideoApiRequest } from './sonara-video-api-recovery.mjs';

const request = new Request('https://sonaraenterprise.com/api/video/generate', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: 'Bearer test-token'
  },
  body: JSON.stringify({ prompt: 'cinematic Naples sunset', aspectRatio: '16:9', resolution: '720p' })
});

assert.equal(isVideoApiRequest(request), true);
assert.equal(isVideoApiRequest(new Request('https://sonaraenterprise.com/api/billing/generate')), false);

{
  let calls = 0;
  const response = await recoverVideoApi(request, {
    waiter: async () => {},
    fetcher: async upstream => {
      calls += 1;
      assert.equal(new URL(upstream.url).hostname, 'sonara-enterprise-sonaramusicai86-2765s-projects.vercel.app');
      assert.equal(upstream.headers.get('authorization'), 'Bearer test-token');
      if (calls === 1) {
        return new Response('<!doctype html><html><body>Bad Gateway</body></html>', {
          status: 502,
          headers: { 'content-type': 'text/html; charset=utf-8' }
        });
      }
      return new Response(JSON.stringify({ jobId: 'video-job-1', status: 'PROCESSING' }), {
        status: 202,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  assert.equal(calls, 2);
  assert.equal(response.status, 202);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.equal(response.headers.get('x-sonara-video-recovery'), 'cloudflare-video-json-v1');
  const payload = await response.json();
  assert.equal(payload.jobId, 'video-job-1');
}

{
  let calls = 0;
  const response = await recoverVideoApi(request, {
    waiter: async () => {},
    fetcher: async () => {
      calls += 1;
      return new Response('<html><body>upstream unavailable</body></html>', {
        status: 502,
        headers: { 'content-type': 'text/html' }
      });
    }
  });
  assert.equal(calls, 2);
  assert.equal(response.status, 503);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  const payload = await response.json();
  assert.equal(payload.error.code, 'VIDEO_UPSTREAM_RETRYABLE');
  assert.equal(payload.retryable, true);
  assert.equal(payload.upstreamStatus, 502);
  assert.equal(payload.attempts, 2);
}

{
  let calls = 0;
  const statusRequest = new Request('https://sonaraenterprise.com/api/video/status', {
    headers: { authorization: 'Bearer test-token' }
  });
  const response = await recoverVideoApi(statusRequest, {
    waiter: async () => {},
    fetcher: async () => {
      calls += 1;
      if (calls === 1) return new Response('gateway timeout', { status: 504, headers: { 'content-type': 'text/plain' } });
      return new Response(JSON.stringify({ providerConfigured: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  assert.equal(calls, 2);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).providerConfigured, true);
}

console.log('SONARA Video AI recovery test passed: transient 502/504 responses recover and HTML never reaches the UI.');
