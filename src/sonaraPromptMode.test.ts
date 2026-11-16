import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFreePromptBody, explicitPromptBpm, normalizePromptMode } from './sonaraPromptMode';

test('Prompt Libero is the default for old installs and blank preferences', () => {
  assert.equal(normalizePromptMode(undefined), 'free');
  assert.equal(normalizePromptMode('old-style'), 'free');
  assert.equal(normalizePromptMode('guided'), 'guided');
});

test('Exact user prompt survives without taxonomy, style, or stale manual BPM', () => {
  const prompt = 'Live Jazz Fusion at 150 BPM; Rhodes, fretless bass and expressive acoustic drums.';
  const body = buildFreePromptBody({ prompt, durationSec: 180, title: 'Jazz Session' });
  assert.equal(body.prompt, prompt);
  assert.equal(body.rawPrompt, prompt);
  assert.equal(body.bpm, 150);
  assert.equal(body.sonaraExactRequestedBpm, 150);
  assert.equal(body.sonaraPromptMode, 'free');
  assert.equal(body.durationSec, 180);
  assert.equal((body as Record<string, unknown>).genre, undefined);
  assert.equal((body as Record<string, unknown>).styleInfluence, undefined);
  assert.equal((body as Record<string, unknown>).key, undefined);
});

test('Without explicit BPM leave the generation tempo unspecified', () => {
  const prompt = 'Expansive classical piano with natural dynamics';
  const body = buildFreePromptBody({ prompt, durationSec: 240 });
  assert.equal(body.prompt, prompt);
  assert.equal('bpm' in body, false);
  assert.equal('sonaraExactRequestedBpm' in body, false);
  assert.equal(explicitPromptBpm('BPM 150'), 150);
  assert.equal(explicitPromptBpm('a 150 bpm'), 150);
  assert.equal(explicitPromptBpm('90 BPM'), 90);
  assert.equal(explicitPromptBpm('250 BPM'), null);
  assert.equal(explicitPromptBpm('A composition without a tempo'), null);
});