import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { videoUiScriptResponse } from './sonara-video-ui-edge.mjs';

const source = await videoUiScriptResponse().text();
let now = 1_000_000;
let upstreamPayload = {
  jobId: 'video-progress-test',
  status: 'PROCESSING',
  progress: 55,
  stage: 'SONARA Video AI: rendering cinematografico'
};

class FakeDate extends Date {
  static now() { return now; }
}

class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

class FakeElement {}
class FakeTextAreaElement extends FakeElement {}

const fakeWindow = {
  fetch: async () => new Response(JSON.stringify(upstreamPayload), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=UTF-8' }
  }),
  location: {
    href: 'https://sonaraenterprise.com/',
    origin: 'https://sonaraenterprise.com'
  },
  setTimeout() {},
  addEventListener() {}
};

vm.runInNewContext(source, {
  window: fakeWindow,
  document: { querySelector: () => null, documentElement: {} },
  MutationObserver: FakeMutationObserver,
  HTMLElement: FakeElement,
  HTMLTextAreaElement: FakeTextAreaElement,
  Response,
  Headers,
  URL,
  Date: FakeDate,
  Math,
  console
});

const first = await fakeWindow.fetch('/api/video/job/video-progress-test');
const firstPayload = await first.json();
assert.equal(first.status, 200);
assert.equal(firstPayload.progress, 56);
assert.match(firstPayload.stage, /avanzamento stimato/i);
assert.equal(first.headers.get('x-sonara-video-progress'), 'estimated-edge-fallback-v1');

now += 120_000;
const second = await fakeWindow.fetch('/api/video/job/video-progress-test');
const secondPayload = await second.json();
assert.ok(secondPayload.progress > firstPayload.progress);
assert.ok(secondPayload.progress <= 94);

upstreamPayload = {
  jobId: 'video-progress-test',
  status: 'COMPLETED',
  progress: 100,
  stage: 'Video pronto',
  videoUrl: '/api/video/file/video-progress-test'
};
const completed = await fakeWindow.fetch('/api/video/job/video-progress-test');
assert.deepEqual(await completed.json(), upstreamPayload);
assert.equal(completed.headers.get('x-sonara-video-progress'), null);

upstreamPayload = {
  jobId: 'real-provider-progress',
  status: 'PROCESSING',
  progress: 55,
  stage: 'Wan 2.2 RTX: denoise 11/20',
  providerStatus: 'PROCESSING'
};
const realProgress = await fakeWindow.fetch('/api/video/job/real-provider-progress');
assert.deepEqual(await realProgress.json(), upstreamPayload);
assert.equal(realProgress.headers.get('x-sonara-video-progress'), null);

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(indexHtml, /<script src="\/sonara-video-ui-edge\.js\?v=3" defer><\/script>/);
const wrangler = JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
assert.ok(wrangler.assets.run_worker_first.includes('/sonara-video-ui-edge.js'));

console.log('SONARA Video AI edge fallback advances the legacy 55% plateau and leaves real MoLab progress untouched.');
