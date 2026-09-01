import assert from 'node:assert/strict';
import { parseMolabVideoJob } from '../../../api/video/provider';

const rendering = parseMolabVideoJob({
  status: 'PROCESSING',
  progress: 46.4,
  stage: 'Wan 2.2 RTX: denoise 10/20',
  updatedAt: 1_788_236_000
});
assert.equal(rendering.done, false);
assert.equal(rendering.progress, 46);
assert.equal(rendering.stage, 'Wan 2.2 RTX: denoise 10/20');
assert.equal(rendering.providerStatus, 'PROCESSING');
assert.equal(rendering.updatedAt, 1_788_236_000);

const completed = parseMolabVideoJob({
  status: 'completed',
  progress: 92,
  stage: 'Video Wan 2.2 pronto',
  uri: 'https://worker.example/file/wan_example.mp4'
});
assert.equal(completed.done, true);
assert.equal(completed.progress, 100);
assert.equal(completed.uri, 'https://worker.example/file/wan_example.mp4');

const failed = parseMolabVideoJob({
  status: 'FAILED',
  error: 'CUDA render failed',
  progress: -3
});
assert.equal(failed.done, true);
assert.equal(failed.progress, 0);
assert.equal(failed.error, 'CUDA render failed');

const queued = parseMolabVideoJob({ status: 'QUEUED', progress: 140, stage: 'In coda' });
assert.equal(queued.done, false);
assert.equal(queued.progress, 100);

console.log('MoLab Video AI progress and stage propagate to SONARA without a fixed 55% plateau.');
