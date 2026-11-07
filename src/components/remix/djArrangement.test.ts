import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planDjArrangement } from './djArrangement';

test('DJ mode places songs sequentially with only short adjacent overlap', () => {
  const plan = planDjArrangement([
    { id: 'one', duration: 180, cue: 0, take: 64, volume: 100, muted: false },
    { id: 'two', duration: 180, cue: 20, take: 64, volume: 100, muted: false },
    { id: 'three', duration: 180, cue: 40, take: 64, volume: 100, muted: false }
  ], 8);
  assert.equal(plan.segments.length, 3);
  assert.equal(plan.segments[0].timelineStart, 0);
  assert.equal(plan.segments[1].timelineStart, 56);
  assert.equal(plan.segments[2].timelineStart, 112);
  assert.equal(plan.totalSeconds, 176);
  assert.equal(plan.segments[2].sourceStart, 40);
});

test('muted songs are omitted from DJ arrangement', () => {
  const plan = planDjArrangement([
    { id: 'a', duration: 65, cue: 0, take: 32, volume: 100, muted: false },
    { id: 'b', duration: 65, cue: 0, take: 32, volume: 100, muted: true },
    { id: 'c', duration: 65, cue: 0, take: 32, volume: 100, muted: false }
  ], 6);
  assert.deepEqual(plan.segments.map(segment => segment.id), ['a', 'c']);
});

test('DJ plan rejects an export longer than 10 minutes', () => {
  assert.throws(() => planDjArrangement(
    Array.from({length: 5}, (_, index) => ({ id: String(index), duration: 180, cue: 0, take: 170, volume: 100, muted: false })),
    3
  ), /massimo 600/);
});

test('fade duration remains short on tiny source segments', () => {
  const plan = planDjArrangement([
    { id: 'a', duration: 6, cue: 0, take: 6, volume: 100, muted: false },
    { id: 'b', duration: 6, cue: 0, take: 6, volume: 100, muted: false }
  ], 24);
  assert.ok(plan.transitions[0] <= 1.8 + 0.001);
  assert.ok(plan.segments[1].timelineStart > 4);
});
