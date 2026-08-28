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
  assert.equal(response.headers.get('x-sonara-video-recovery'), 'cloudflare-video-json-v2');
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

{
  const env = { GEMINI_API_KEY: 'test-gemini-key' };
  let startCalls = 0;
  const started = await recoverVideoApi(request, {
    env,
    fetcher: async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.hostname.includes('vercel.app')) {
        return new Response(JSON.stringify({ jobId: 'real-job-123', status: 'PROCESSING', progress: 3 }), {
          status: 202,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.pathname.endsWith(':predictLongRunning')) {
        startCalls += 1;
        const body = JSON.parse(String(init.body || '{}'));
        assert.equal(new Headers(init.headers).get('x-goog-api-key'), 'test-gemini-key');
        assert.equal(body.instances[0].prompt, 'cinematic Naples sunset');
        assert.equal(body.parameters.durationSeconds, '8');
        return new Response(JSON.stringify({ name: 'operations/gemini-edge-123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      throw new Error(`Unexpected request ${url}`);
    }
  });
  assert.equal(startCalls, 1);
  assert.equal(started.status, 202);
  assert.equal(started.headers.get('x-sonara-video-provider'), 'gemini-edge');
  const startedPayload = await started.json();
  assert.equal(startedPayload.jobId, 'edge_real-job-123');
  assert.equal(startedPayload.provider, 'gemini');

  const setCookie = started.headers.get('set-cookie') || '';
  const cookiePair = setCookie.split(';')[0];
  assert.match(cookiePair, /^sonara_video_edge=/);

  const polling = await recoverVideoApi(new Request(`https://sonaraenterprise.com/api/video/job/${startedPayload.jobId}`, {
    headers: { cookie: cookiePair, authorization: 'Bearer test-token' }
  }), {
    env,
    fetcher: async input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      assert.equal(url.pathname, '/v1beta/operations/gemini-edge-123');
      return new Response(JSON.stringify({ done: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  const pollingPayload = await polling.json();
  assert.equal(pollingPayload.status, 'PROCESSING');
  assert.equal(pollingPayload.provider, 'gemini');

  const completed = await recoverVideoApi(new Request(`https://sonaraenterprise.com/api/video/job/${startedPayload.jobId}`, {
    headers: { cookie: cookiePair, authorization: 'Bearer test-token' }
  }), {
    env,
    fetcher: async () => new Response(JSON.stringify({
      done: true,
      response: {
        generateVideoResponse: {
          generatedSamples: [{ video: { uri: 'https://files.example.test/generated-video.mp4' } }]
        }
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  });
  const completedPayload = await completed.json();
  assert.equal(completedPayload.status, 'COMPLETED');
  assert.equal(completedPayload.progress, 100);
  assert.match(completedPayload.videoUrl, /^https:\/\/sonaraenterprise\.com\/api\/video\/edge-media\?token=/);

  const media = await recoverVideoApi(new Request(completedPayload.videoUrl), {
    env,
    fetcher: async (input, init) => {
      assert.equal(String(input), 'https://files.example.test/generated-video.mp4');
      assert.equal(init.headers.get('x-goog-api-key'), 'test-gemini-key');
      return new Response(new Uint8Array([0, 0, 0, 24]), {
        status: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': '4' }
      });
    }
  });
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('content-type'), 'video/mp4');
  assert.equal(media.headers.get('x-sonara-video-provider'), 'gemini-edge');
}

{
  const env = { GEMINI_API_KEY: 'test-gemini-key' };
  const longRequest = new Request('https://sonaraenterprise.com/api/video/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: JSON.stringify({ prompt: 'cinematic long video sequence', aspectRatio: '16:9', resolution: '720p', durationSeconds: 60 })
  });
  let geminiCalled = false;
  const response = await recoverVideoApi(longRequest, {
    env,
    fetcher: async input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.hostname.includes('generativelanguage.googleapis.com')) geminiCalled = true;
      return new Response(JSON.stringify({ jobId: 'long-job', status: 'PROCESSING' }), {
        status: 202,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  assert.equal(geminiCalled, false);
  assert.equal((await response.json()).jobId, 'long-job');
}

{
  const health = await recoverVideoApi(new Request('https://sonaraenterprise.com/api/video/edge-health'), {
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetcher: async input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      assert.equal(url.pathname, '/v1beta/models/veo-3.1-fast-generate-preview');
      return new Response(JSON.stringify({ name: 'models/veo-3.1-fast-generate-preview' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  const payload = await health.json();
  assert.equal(health.status, 200);
  assert.equal(payload.configured, true);
  assert.equal(payload.valid, true);
}

console.log('SONARA Video AI recovery v2 test passed: retries remain safe and 8-second prompt-only jobs can use signed Gemini edge fallback.');
