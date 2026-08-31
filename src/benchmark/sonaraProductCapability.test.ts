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
const studioV2Contract = read('cloudflare/sonara-studio-v2-contract.mjs');
const sessionsTimeline = read('src/components/studio/SonaraSessions2Timeline.tsx');
const nativeSessionsActivator = read('scripts/activate-studio-sessions-native.cjs');
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
  ['SONARA Studio 2.0 production contract', /sonara-studio-v2\.0-production/.test(studioV2Contract)],
  ['SONARA Sessions 2.0', /SONARA_SESSIONS_VERSION\s*=\s*'2\.0'/.test(studioV2Contract) && /data-sonara-sessions-timeline="2\.0"/.test(sessionsTimeline)],
  ['Extend operation', /\/api\/studio\/extend/.test(sessionsV2)],
  ['Replace operation', /\/api\/studio\/replace/.test(sessionsV2)],
  ['Inpaint operation', /\/api\/studio\/inpaint/.test(sessionsV2)],
  ['Remix operation', /\/api\/studio\/remix/.test(sessionsV2)],
  ['Audio-to-Audio operation', /\/api\/studio\/audio-to-audio/.test(sessionsV2)],
  ['Voice DNA operation', /\/api\/studio\/voice-dna/.test(sessionsV2)],
  ['Style DNA operation', /\/api\/studio\/style-dna/.test(sessionsV2)],
  ['Long-context musical continuity', /sonaraLongContextMemory/.test(sessionsV2) && /sonaraChorusIdentityLock/.test(sessionsV2) && /sonaraMotifContinuity/.test(sessionsV2)],
  ['Durable long-song memory', /sonara-long-song-memory-v1/.test(studioV2Contract) && /\/api\/studio\/project-memory/.test(sessionsV2)],
  ['Native exact-region A/B takes', /SONARA_SESSIONS_NATIVE_V2/.test(nativeSessionsActivator) && /sonara:studio-register-session-candidates/.test(nativeSessionsActivator) && /sonara:studio-apply-session-candidate/.test(nativeSessionsActivator)],
  ['Persistent version history', /sonara\.sessions\.history/.test(sessionsTimeline) && /RIPRISTINA/.test(sessionsTimeline)],
  ['12 Stems Pro', /STEMS_12/.test(studioV2Contract) && /maxStems:\s*12/.test(studioV2Contract) && /Stems Pro 12/.test(sessionsTimeline)],
  ['Stem isolate/remove/regenerate region', /ISOLATE/.test(sessionsTimeline) && /REMOVE \/ MUTE/.test(sessionsTimeline) && /regenerate-stem-section/.test(sessionsTimeline)],
  ['Quality 2.0 active in official Worker chain', /sonara-next-studio-edge\.mjs/.test(nativeAuthMain)]
];

for (const [name, present] of capabilities) assert.equal(present, true, `SONARA product capability missing: ${name}`);

console.log(`SONARA product capability contract passed: ${capabilities.length} critical capabilities protected`);
