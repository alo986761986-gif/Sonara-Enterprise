import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const studioRouter = read('cloudflare/sonara-studio-ai-router.mjs');
const studioUi = read('cloudflare/sonara-studio-pro-ui.mjs');
const autopilot = read('cloudflare/sonara-studio-autopilot-router.mjs');
const promptUi = read('src/components/generator/SunoStylePromptControl.tsx');
const promptDirector = read('src/services/promptDirector.ts');
const qualityRouter = read('cloudflare/sonara-quality-gated-router.mjs');
const instruments = read('src/data/realMusicalInstruments.ts');

const capabilities: Array<[string, boolean]> = [
  ['Repaint / section regeneration', /repaint/i.test(studioRouter)],
  ['Stem separation', /stems/i.test(studioRouter)],
  ['Voice Identity', /voiceIdentity|Voice Identity/i.test(studioRouter + studioUi)],
  ['Persona / Style DNA', /persona/i.test(studioRouter + studioUi)],
  ['Reference Audio', /reference/i.test(studioRouter + studioUi)],
  ['Quality Judge', /Quality Judge|sonaraQualityJudge|qualityScore/i.test(qualityRouter + studioUi)],
  ['Quality Autopilot', /autoRepair|Autopilot Quality|repairRecommended/i.test(autopilot + studioUi)],
  ['MIDI / Piano Roll', /MIDI|Piano Roll/i.test(studioUi)],
  ['Simple / Pro prompt modes', /PromptStudioMode/.test(promptDirector) && /simple/.test(promptUi) && /pro/.test(promptUi)],
  ['Prompt Director', /buildPromptDirectorBrief/.test(promptDirector)],
  ['Manual BPM lock', /manually locked to exactly/.test(promptDirector)],
  ['Real instrument catalog', /ALL_REAL_MUSICAL_INSTRUMENTS/.test(instruments)],
  ['Release Gate', /sonaraReleaseGate|releaseGate|AUTO-REPAIR|autoRepairRecommended/.test(qualityRouter)]
];

for (const [name, present] of capabilities) assert.equal(present, true, `SONARA product capability missing: ${name}`);

console.log(`SONARA product capability contract passed: ${capabilities.length} critical capabilities protected`);
