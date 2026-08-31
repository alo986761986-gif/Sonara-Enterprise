import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const studioRouter = read('cloudflare/sonara-studio-ai-router.mjs');
const studioUi = read('cloudflare/sonara-studio-pro-ui.mjs');
const autopilot = read('cloudflare/sonara-studio-autopilot-router.mjs');
const promptUi = read('src/components/generator/SunoStylePromptControl.tsx');
const promptDirector = read('src/services/promptDirector.ts');
const qualityRouter = read('cloudflare/sonara-quality-gated-router.mjs');
const qualityDirectorV2 = read('cloudflare/sonara-quality-director-v2.mjs');
const sessionsV2 = read('cloudflare/sonara-next-studio-edge.mjs');
const nativeAuthMain = read('cloudflare/sonara-native-auth-main.mjs');
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
  ['Release Gate', /sonaraReleaseGate|releaseGate|AUTO-REPAIR|autoRepairRecommended/.test(qualityRouter)],
  ['SONARA Engine Quality 2.0', /sonara-engine-quality-2\.0/.test(qualityDirectorV2)],
  ['Professional release score 88', /PROFESSIONAL_RELEASE_SCORE\s*=\s*88/.test(qualityDirectorV2)],
  ['Professional WAV dimensions', /signalIntegrity/.test(qualityDirectorV2) && /dynamics/.test(qualityDirectorV2) && /durationVerification/.test(qualityDirectorV2)],
  ['Automatic professional candidate ranking', /rankProfessionalReports/.test(qualityDirectorV2)],
  ['Automatic professional repair plan', /repairPlan/.test(qualityDirectorV2)],
  ['SONARA Sessions 2.0', /SONARA Sessions 2\.0/.test(sessionsV2)],
  ['Extend operation', /\/api\/studio\/extend/.test(sessionsV2)],
  ['Replace operation', /\/api\/studio\/replace/.test(sessionsV2)],
  ['Inpaint operation', /\/api\/studio\/inpaint/.test(sessionsV2)],
  ['Remix operation', /\/api\/studio\/remix/.test(sessionsV2)],
  ['Audio-to-Audio operation', /\/api\/studio\/audio-to-audio/.test(sessionsV2)],
  ['Voice DNA operation', /\/api\/studio\/voice-dna/.test(sessionsV2)],
  ['Style DNA operation', /\/api\/studio\/style-dna/.test(sessionsV2)],
  ['Long-context musical continuity', /sonaraLongContextMemory/.test(sessionsV2) && /sonaraChorusIdentityLock/.test(sessionsV2) && /sonaraMotifContinuity/.test(sessionsV2)],
  ['Quality 2.0 active in official Worker chain', /sonara-next-studio-edge\.mjs/.test(nativeAuthMain)]
];

for (const [name, present] of capabilities) assert.equal(present, true, `SONARA product capability missing: ${name}`);

console.log(`SONARA product capability contract passed: ${capabilities.length} critical capabilities protected`);
