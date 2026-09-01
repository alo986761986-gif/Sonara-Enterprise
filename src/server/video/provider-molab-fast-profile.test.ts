import assert from 'node:assert/strict';
import { molabFastGenerationProfile } from '../../../api/video/provider';

const previousFrames = process.env.SONARA_MOLAB_VIDEO_FRAMES;
const previousSteps = process.env.SONARA_MOLAB_VIDEO_STEPS;

try {
  process.env.SONARA_MOLAB_VIDEO_FRAMES = '193';
  process.env.SONARA_MOLAB_VIDEO_STEPS = '28';
  assert.deepEqual(molabFastGenerationProfile(), {
    frames: 97,
    steps: 12,
    durationSeconds: 8,
    outputFps: 24
  });

  process.env.SONARA_MOLAB_VIDEO_FRAMES = '50';
  process.env.SONARA_MOLAB_VIDEO_STEPS = '10';
  assert.deepEqual(molabFastGenerationProfile(), {
    frames: 49,
    steps: 10,
    durationSeconds: 8,
    outputFps: 24
  });
} finally {
  if (previousFrames === undefined) delete process.env.SONARA_MOLAB_VIDEO_FRAMES;
  else process.env.SONARA_MOLAB_VIDEO_FRAMES = previousFrames;
  if (previousSteps === undefined) delete process.env.SONARA_MOLAB_VIDEO_STEPS;
  else process.env.SONARA_MOLAB_VIDEO_STEPS = previousSteps;
}

console.log('MoLab fast profile caps legacy production settings at 97 frames and 12 steps.');
