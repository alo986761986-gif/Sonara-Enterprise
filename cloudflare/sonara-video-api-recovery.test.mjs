import assert from 'node:assert/strict';
import { recoverVideoApi, isVideoApiRequest } from './sonara-video-api-recovery.mjs';

function generateRequest(body = {}) {
  return new Request('https://sonaraenterprise.com/api/video/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: JSON.stringify({
      prompt: 'cinematic Naples sunset over the sea',
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 8,
      ...body
    })
  });
}

assert.equal(isVideoApiRequest(generateRequest()), true);
assert.equal(isVideoApiRequest(new Request('https://sonaraenterprise.com/api/billing/generate')), false);

{
  let upstreamCalls = 0;
  const response = await recoverVideoApi(generateRequest(), {
    waiter: async () => {},
    fetcher: async input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      upstreamCalls += 1;
      if (upstreamCalls === 1) return new Response('<html>bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } });
      assert.equal(url.hostname, 'sonara-enterprise-sonaramusicai86-2765s-projects.vercel.app');
      return new Response(JSON.stringify({ jobId: 'video-job-1', status: 'PROCESSING' }), { status: 202, headers: { 'content-type': 'application/json' } });
    }
  });
  assert.equal(upstreamCalls, 2);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('x-sonara-video-recovery'), 'cloudflare-video-json-v3');
  const payload = await response.json();
  assert.equal(payload.error.code, 'ZERO_COST_VIDEO_WORKER_UNAVAILABLE');
}

{
  const env = {
    SONARA_VIDEO_WORKER_URL: 'https://wan.example.test',
    SONARA_ZERO_COST_VIDEO: 'true',
    SONARA_VIDEO_EDGE_SIGNING_SECRET: 'test-signing-secret',
    GEMINI_API_KEY: 'must-never-be-called'
  };
  let geminiCalls = 0;
  let wanStartCalls = 0;
  const started = await recoverVideoApi(generateRequest(), {
    env,
    fetcher: async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.hostname.includes('generativelanguage.googleapis.com')) {
        geminiCalls += 1;
        throw new Error('Gemini must not be called in zero-cost mode');
      }
      if (url.hostname.includes('vercel.app')) {
        return new Response(JSON.stringify({ jobId: 'real-job-123', status: 'PROCESSING', progress: 3 }), {
          status: 202,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', provider: 'kaggle-wan21', model: 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.pathname === '/v1/video/generate') {
        wanStartCalls += 1;
        const body = JSON.parse(String(init.body || '{}'));
        assert.equal(body.prompt, 'cinematic Naples sunset over the sea');
        assert.equal(body.durationSeconds, 8);
        return new Response(JSON.stringify({ jobId: 'wan_abc', status: 'PROCESSING', provider: 'kaggle-wan21' }), {
          status: 202,
          headers: { 'content-type': 'application/json' }
        });
      }
      throw new Error(`Unexpected request ${url}`);
    }
  });
  assert.equal(geminiCalls, 0);
  assert.equal(wanStartCalls, 1);
  assert.equal(started.status, 202);
  assert.equal(started.headers.get('x-sonara-video-provider'), 'kaggle-wan21');
  const startedPayload = await started.json();
  assert.equal(startedPayload.provider, 'kaggle-wan21');
  assert.equal(startedPayload.zeroCost, true);
  assert.match(startedPayload.jobId, /^edge_/);

  const cookiePair = (started.headers.get('set-cookie') || '').split(';')[0];
  const polling = await recoverVideoApi(new Request(`https://sonaraenterprise.com/api/video/job/${startedPayload.jobId}`, {
    headers: { cookie: cookiePair, authorization: 'Bearer test-token' }
  }), {
    env,
    fetcher: async input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      assert.equal(url.pathname, '/v1/video/job/wan_abc');
      return new Response(JSON.stringify({ status: 'PROCESSING', progress: 44, stage: 'Generazione fotogrammi WAN 2.1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  const pollingPayload = await polling.json();
  assert.equal(pollingPayload.status, 'PROCESSING');
  assert.equal(pollingPayload.provider, 'kaggle-wan21');
  assert.equal(pollingPayload.progress, 44);

  const completed = await recoverVideoApi(new Request(`https://sonaraenterprise.com/api/video/job/${startedPayload.jobId}`, {
    headers: { cookie: cookiePair, authorization: 'Bearer test-token' }
  }), {
    env,
    fetcher: async () => new Response(JSON.stringify({
      status: 'COMPLETED',
      progress: 100,
      videoPath: '/v1/video/file/wan_abc.mp4'
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  });
  const completedPayload = await completed.json();
  assert.equal(completedPayload.status, 'COMPLETED');
  assert.equal(completedPayload.provider, 'kaggle-wan21');
  assert.match(completedPayload.videoUrl, /^https:\/\/sonaraenterprise\.com\/api\/video\/edge-media\?token=/);

  const media = await recoverVideoApi(new Request(completedPayload.videoUrl), {
    env,
    fetcher: async input => {
      assert.equal(String(input), 'https://wan.example.test/v1/video/file/wan_abc.mp4');
      return new Response(new Uint8Array([0, 0, 0, 24]), {
        status: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': '4' }
      });
    }
  });
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('x-sonara-video-provider'), 'kaggle-wan21');
}

{
  const env = {
    SONARA_VIDEO_WORKER_URL: 'https://wan.example.test',
    SONARA_ZERO_COST_VIDEO: 'true',
    SONARA_VIDEO_EDGE_SIGNING_SECRET: 'test-signing-secret',
    GEMINI_API_KEY: 'must-never-be-called',
    SONARA_ENABLE_GEMINI_VIDEO: 'true'
  };
  let geminiCalls = 0;
  const response = await recoverVideoApi(generateRequest(), {
    env,
    fetcher: async input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.hostname.includes('generativelanguage.googleapis.com')) geminiCalls += 1;
      if (url.hostname.includes('vercel.app')) {
        return new Response(JSON.stringify({ jobId: 'guard-job', status: 'PROCESSING' }), { status: 202, headers: { 'content-type': 'application/json' } });
      }
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'offline', provider: 'kaggle-wan21' }), { status: 503, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected request ${url}`);
    }
  });
  assert.equal(geminiCalls, 0);
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error.code, 'ZERO_COST_VIDEO_WORKER_UNAVAILABLE');
  assert.equal(payload.zeroCost, true);
}

{
  let googleCalls = 0;
  const response = await recoverVideoApi(generateRequest({ durationSeconds: 60 }), {
    env: { SONARA_ZERO_COST_VIDEO: 'true', GEMINI_API_KEY: 'must-never-be-called' },
    fetcher: async input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.hostname.includes('generativelanguage.googleapis.com')) googleCalls += 1;
      return new Response(JSON.stringify({ jobId: 'long-job', status: 'PROCESSING' }), {
        status: 202,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  assert.equal(googleCalls, 0);
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error.code, 'ZERO_COST_VIDEO_LIMIT');
}

{
  const health = await recoverVideoApi(new Request('https://sonaraenterprise.com/api/video/edge-health'), {
    env: { SONARA_VIDEO_WORKER_URL: 'https://wan.example.test', SONARA_ZERO_COST_VIDEO: 'true', GEMINI_API_KEY: 'unused' },
    fetcher: async input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      assert.equal(url.pathname, '/health');
      return new Response(JSON.stringify({ status: 'ok', provider: 'kaggle-wan21', model: 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  const payload = await health.json();
  assert.equal(health.status, 200);
  assert.equal(payload.valid, true);
  assert.equal(payload.zeroCost, true);
  assert.equal(payload.googleBillingRequired, false);
  assert.equal(payload.geminiEnabled, false);
}

console.log('SONARA Video AI recovery v3 test passed: Kaggle WAN is preferred, zero-cost guard blocks Gemini, and Google is never called when free mode is active.');
