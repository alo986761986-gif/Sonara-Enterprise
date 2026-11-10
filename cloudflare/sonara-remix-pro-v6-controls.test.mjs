import test from 'node:test';
import assert from 'node:assert/strict';
import { parseV6Controls, v6PreviewBrief } from './sonara-remix-pro-v6-controls.mjs';

test('V6 controls are bounded and require allowlisted master and mode', () => {
  const controls = parseV6Controls({mode:'wild',master:'club',melody:80,groove:70});
  assert.equal(controls.harmony,60);
  assert.equal(controls.timbre,55);
  assert.equal(controls.humanize,60);
  assert.equal(controls.melody,80);
  assert.throws(() => parseV6Controls({mode:'delete-files'}));
  assert.throws(() => parseV6Controls({master:'ultraloud'}));
  assert.throws(() => parseV6Controls({groove:101}));
  assert.throws(() => parseV6Controls({harmony:33}));
  assert.throws(() => parseV6Controls({humanize:'100'}));
  assert.throws(() => parseV6Controls({__proto__:null,unknown:1}));
});
test('preview is bounded and specifically forbids source overlays', () => {
  const text=v6PreviewBrief({mode:'experimental',harmony:40});
  assert.match(text,/Experimental arrangement/);
  assert.match(text,/never a source overlay or medley/);
  assert.ok(text.length<=1350);
});
test('legacy jobs do not require V6 controls', () => {
  assert.equal(parseV6Controls(undefined),null);
  assert.equal(v6PreviewBrief(null),'');
});
