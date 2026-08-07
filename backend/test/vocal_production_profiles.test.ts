import assert from 'node:assert/strict';
import { AceStepEngine } from '../src/engine/AceStepEngine';
import { AceStepPromptEngine } from '../src/services/AceStepPromptEngine';
import {
  prepareLyricsForAceStep,
  resolveVocalProductionProfile,
  VOCAL_DELIVERY_OPTIONS,
  VOCAL_HARMONY_OPTIONS,
  VOCAL_MODE_OPTIONS,
  VOCAL_REGISTER_OPTIONS,
  VOCAL_TIMBRE_OPTIONS,
  vocalProductionPromptKeywords
} from '../../shared/vocalProfiles';

async function run() {
  assert.equal(VOCAL_MODE_OPTIONS.length, 5);
  assert.ok(VOCAL_TIMBRE_OPTIONS.length >= 10);
  assert.ok(VOCAL_REGISTER_OPTIONS.length >= 5);
  assert.ok(VOCAL_DELIVERY_OPTIONS.length >= 9);
  assert.ok(VOCAL_HARMONY_OPTIONS.length >= 7);

  const instrumental = resolveVocalProductionProfile({
    mode: 'instrumental',
    lyricsPresent: false
  });
  assert.equal(instrumental.isInstrumental, true);
  assert.equal(instrumental.requiresLyrics, false);
  assert.equal(prepareLyricsForAceStep('ignored words', instrumental), '[instrumental]');
  assert.match(vocalProductionPromptKeywords(instrumental).join(' | '), /no lead vocal/i);
  assert.match(vocalProductionPromptKeywords(instrumental).join(' | '), /reject accidental singing/i);

  const legacyLyricsAuto = resolveVocalProductionProfile({ lyricsPresent: true });
  assert.equal(legacyLyricsAuto.requestedMode, 'auto');
  assert.equal(legacyLyricsAuto.isInstrumental, false);

  const autoWithoutLyrics = resolveVocalProductionProfile({
    mode: 'auto',
    lyricsPresent: false
  });
  assert.equal(autoWithoutLyrics.effectiveMode, 'instrumental');

  const female = resolveVocalProductionProfile({
    mode: 'female',
    timbre: 'warm',
    register: 'high',
    delivery: 'soulful',
    harmony: 'thirds-sixths',
    lyricsPresent: true,
    genreVocalDirection: 'authentic Soul lead phrasing'
  });
  assert.equal(female.effectiveMode, 'female');
  assert.equal(female.requiresLyrics, true);
  assert.match(female.identity, /adult female lead voice/i);
  assert.match(female.identity, /no imitation/i);
  assert.match(female.timbreDirection, /rounded low mids/i);
  assert.match(female.registerDirection, /upper mix or head register/i);
  assert.match(female.deliveryDirection, /tasteful melisma/i);
  assert.match(female.harmonyDirection, /thirds and sixths/i);

  const male = resolveVocalProductionProfile({
    mode: 'male',
    timbre: 'dark',
    register: 'low',
    delivery: 'raspy',
    harmony: 'double-tracked',
    lyricsPresent: true
  });
  assert.match(male.identity, /adult male lead voice/i);
  assert.match(male.timbreDirection, /deep chest resonance/i);
  assert.match(male.registerDirection, /chest-dominant lower tessitura/i);
  assert.match(male.deliveryDirection, /controlled organic grain/i);
  assert.match(male.harmonyDirection, /never phase-copy/i);

  const duet = resolveVocalProductionProfile({
    mode: 'duet',
    timbre: 'velvety',
    register: 'wide',
    delivery: 'powerful',
    harmony: 'duet',
    lyricsPresent: true
  });
  assert.match(duet.identity, /one female and one male/i);
  assert.match(duet.identity, /separate formants/i);
  assert.match(duet.registerDirection, /chest, mix and head-register transitions/i);
  assert.match(duet.harmonyDirection, /alternate lines between two distinct voices/i);

  const unstructuredLyrics = prepareLyricsForAceStep(
    'Hold the light inside\nLet the morning find us',
    female
  );
  assert.equal(
    unstructuredLyrics,
    '[verse]\nHold the light inside\nLet the morning find us'
  );
  const structuredLyrics = '[verse]\nFirst line\n\n[chorus]\nReal hook';
  assert.equal(prepareLyricsForAceStep(structuredLyrics, female), structuredLyrics);

  const promptResult = await AceStepPromptEngine.generatePrompt(
    'Soul song with expressive dynamics and real lyrical emotion',
    'Soul',
    96,
    {
      mode: 'female',
      timbre: 'warm',
      register: 'wide',
      delivery: 'soulful',
      harmony: 'call-response',
      lyricsPresent: true
    }
  );
  assert.equal(promptResult.vocalProfile.effectiveMode, 'female');
  assert.equal(promptResult.injectedVocalKeywords.length, 12);
  assert.match(promptResult.optimizedPrompt, /VOICE_IDENTITY:/);
  assert.match(promptResult.optimizedPrompt, /NATURAL_TIMBRE:/);
  assert.match(promptResult.optimizedPrompt, /REGISTER_AND_RANGE:/);
  assert.match(promptResult.optimizedPrompt, /VOCAL_DYNAMICS:/);
  assert.match(promptResult.optimizedPrompt, /HUMAN_NATURALISM:/);
  assert.match(promptResult.optimizedPrompt, /ARTIFACT_REJECTION:/);
  assert.match(promptResult.optimizedPrompt, /authentic Soul lead phrasing|expressive lead/i);
  assert.match(promptResult.optimizedPrompt, /reject robotic cadence, flat monotone delivery/i);

  const enginePrompt = (AceStepEngine.getInstance() as any).buildPrompt(
    {
      genre: 'Soul',
      mood: 'Intimate',
      prompt: promptResult.optimizedPrompt,
      vocalProfile: promptResult.vocalProfile,
      vocalPrompt: promptResult.injectedVocalKeywords.join(', ')
    },
    96
  );
  assert.match(enginePrompt, /natural lead vocal centered with chest warmth/i);
  assert.equal(
    (enginePrompt.match(/VOICE_IDENTITY:/g) || []).length,
    1,
    'vocal directives must reach ACE-Step once, without duplicated conditioning'
  );

  console.log(JSON.stringify({
    status: 'PASS',
    vocalModes: VOCAL_MODE_OPTIONS.map(option => option.value),
    timbres: VOCAL_TIMBRE_OPTIONS.length,
    registers: VOCAL_REGISTER_OPTIONS.length,
    deliveries: VOCAL_DELIVERY_OPTIONS.length,
    harmonies: VOCAL_HARMONY_OPTIONS.length,
    naturalDirectives: promptResult.injectedVocalKeywords.length,
    lyricsStructure: 'PASS',
    aceStepPromptBridge: 'PASS'
  }, null, 2));
}

void run();
