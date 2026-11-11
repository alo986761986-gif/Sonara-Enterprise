import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const section=readFileSync(new URL('../src/components/remix/SonaraRemixSection.tsx',import.meta.url),'utf8');
const pro=readFileSync(new URL('../src/components/remix/SonaraRemixProPanel.tsx',import.meta.url),'utf8');

test('V6 Creative DNA is the only default Remix view and old V3 tab is gone',()=>{
  assert.match(section,/useState<'library' \| 'upload' \| 'multitrack' \| 'pro'>\('pro'\)/);
  assert.match(section,/data-sonara-remix-unified-v6="true"/);
  assert.match(section,/data-testid="sonara-remix-mode-v6"/);
  assert.match(section,/sourceTab === 'pro' \? ' is-pro' : ''/);
  assert.doesNotMatch(section,/<Sparkles \/>Remix Pro<\/button>/);
});
test('single-track and multitrack remain opt-in and are never removed',()=>{
  assert.match(section,/data-testid="sonara-remix-mode-single"/);
  assert.match(section,/sourceTab === 'multitrack'/);
  assert.match(section,/<SonaraMultitrackMixer onMixReady=/);
  assert.match(section,/sourceTab !== 'pro' && <section className="sonara-remix-controls-panel">/);
  assert.match(section,/sourceTab !== 'pro' && <section className="sonara-remix-results-panel">/);
  assert.match(section,/<SonaraRemixProPanel \/>/);
});
test('V6 panel retains two-source upload and requires original vocal preservation',()=>{
  assert.match(pro,/data-sonara-remix-v6-primary="true"/);
  assert.match(pro,/V6 · CREATIVE DNA FUSION/);
  assert.match(pro,/data-testid="sonara-remix-pro-input-a"/);
  assert.match(pro,/data-testid="sonara-remix-pro-input-b"/);
  assert.match(pro,/sonaraRemixProV6:true/);
  assert.match(pro,/Voci originali A\+B/);
  assert.match(pro,/Per conservare le voci originali A\+B serve Remix Pro V6 GPU attivo/);
  assert.match(pro,/data-testid="sonara-v6-fusion-controls"/);
});
