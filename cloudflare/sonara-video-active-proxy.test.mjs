import assert from 'node:assert/strict';
import { proxyActiveVideoApi } from './sonara-web-v15-router.mjs';

const source = new Request('https://sonaraenterprise.com/api/video/generate?scene=1', {
  method: 'POST',
  headers: {
    authorization: 'Bearer firebase-test-token',
    'content-type': 'application/json'
  },
  body: JSON.stringify({ prompt: 'Cinematic Mediterranean sunrise' })
});

let forwarded;
const response = await proxyActiveVideoApi(source, async request => {
  forwarded = request;
  return new Response(JSON.stringify({ jobId: 'video_test', status: 'PROCESSING' }), {
    status: 202,
    headers: { 'content-type': 'application/json' }
  });
});

assert.ok(forwarded instanceof Request);
assert.equal(forwarded.url, 'https://sonara-enterprise.vercel.app/api/video/generate?scene=1');
assert.equal(forwarded.method, 'POST');
assert.equal(forwarded.headers.get('authorization'), 'Bearer firebase-test-token');
assert.equal(forwarded.headers.get('x-forwarded-host'), 'sonaraenterprise.com');
assert.equal(forwarded.headers.get('x-sonara-video-edge'), 'molab-wan22-blackwell-v1');
assert.deepEqual(await forwarded.json(), { prompt: 'Cinematic Mediterranean sunrise' });
assert.equal(response.status, 202);
assert.equal(response.headers.get('x-sonara-video-state'), 'active-molab-wan22-blackwell');
assert.equal(response.headers.get('x-sonara-video-edge'), 'vercel-auth-proxy-v1');

const failure = await proxyActiveVideoApi(
  new Request('https://sonaraenterprise.com/api/video/status'),
  async () => { throw new Error('test upstream down'); }
);
assert.equal(failure.status, 502);
assert.equal((await failure.json()).error.code, 'VIDEO_BACKEND_UNREACHABLE');

console.log('SONARA Video AI active proxy test passed.');
