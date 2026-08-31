import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SONARA_STUDIO_V2_VERSION,
  SONARA_LONG_MEMORY_VERSION,
  STEMS_12,
  SESSION_OPERATIONS,
  mergeSongMemory,
  memoryInstruction,
  sessionOperationInstruction,
  studioV2Capabilities
} from './sonara-studio-v2-contract.mjs';

test('Studio 2.0 exposes the complete production contract', () => {
  const capabilities = studioV2Capabilities();
  assert.equal(SONARA_STUDIO_V2_VERSION, 'sonara-studio-v2.0-production');
  assert.equal(capabilities.version, SONARA_STUDIO_V2_VERSION);
  assert.equal(capabilities.maxStems, 12);
  assert.equal(STEMS_12.length, 12);
  assert.equal(capabilities.timelineRegionSelection, true);
  assert.equal(capabilities.dualABTakes, true);
  assert.equal(capabilities.voiceDnaInheritance, true);
  assert.equal(capabilities.styleDnaInheritance, true);
  assert.equal(capabilities.longSongMemory, SONARA_LONG_MEMORY_VERSION);
});

test('required Sessions and stem operations are protected', () => {
  for (const operation of ['replace','inpaint','extend','remix','audio-to-audio','stems-pro','regenerate-stem-section']) {
    assert.ok(SESSION_OPERATIONS.includes(operation), `${operation} missing`);
  }
  assert.match(sessionOperationInstruction('replace'), /selected region/i);
  assert.match(sessionOperationInstruction('inpaint'), /inaudible/i);
  assert.match(sessionOperationInstruction('extend'), /motif/i);
  assert.match(sessionOperationInstruction('voice-dna'), /Voice DNA/i);
});

test('long-song memory persists musical identity across sparse updates', () => {
  const first = mergeSongMemory({}, {
    projectId: 'song-1',
    family: 'Electronic',
    genre: 'House',
    subgenre: 'Deep House',
    bpm: 124,
    key: 'A Minor',
    singerIdentity: 'warm female alto',
    motif: 'three-note descending hook',
    chorusIdentity: 'wide layered chorus',
    harmony: 'Am F C G',
    instrumentation: 'deep bass, Rhodes, soft pads',
    arrangement: 'intro verse chorus drop chorus outro',
    ending: 'clean musical resolution'
  });
  const second = mergeSongMemory(first, { projectId: 'song-1', lastOperation: 'extend' });
  assert.equal(second.bpm, 124);
  assert.equal(second.key, 'A Minor');
  assert.equal(second.motif, 'three-note descending hook');
  assert.equal(second.chorusIdentity, 'wide layered chorus');
  assert.equal(second.lastOperation, 'extend');
  const prompt = memoryInstruction(second);
  assert.match(prompt, /three-note descending hook/);
  assert.match(prompt, /wide layered chorus/);
  assert.match(prompt, /BPM 124/);
});
