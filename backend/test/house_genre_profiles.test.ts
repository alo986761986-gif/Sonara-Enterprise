import assert from 'node:assert/strict';
import { AceStepPromptEngine } from '../src/services/AceStepPromptEngine';
import { PatternGeneratorService } from '../src/services/PatternGeneratorService';
import {
  HOUSE_STYLE_DEFINITIONS,
  normalizeGenreName,
  resolveGenreSelection,
  resolveHouseStyleProfile
} from '../../shared/genreCatalog';

async function run() {
  assert.ok(HOUSE_STYLE_DEFINITIONS.length >= 30);

  const normalizedNames = HOUSE_STYLE_DEFINITIONS.map(profile =>
    normalizeGenreName(profile.name)
  );
  assert.equal(new Set(normalizedNames).size, normalizedNames.length);

  for (const profile of HOUSE_STYLE_DEFINITIONS) {
    assert.ok(profile.recommendedBpm >= profile.bpmRange[0]);
    assert.ok(profile.recommendedBpm <= profile.bpmRange[1]);
    assert.ok(profile.atmosphere.length > 12);
    assert.ok(profile.groove.length > 12);
    assert.ok(profile.bass.length > 12);
    assert.ok(profile.harmony.length > 12);
    assert.ok(profile.soundPalette.length > 12);
    assert.ok(profile.arrangement.length > 12);
    assert.ok(profile.vocalStyle.length > 12);

    const selection = resolveGenreSelection(profile.name);
    assert.equal(selection.familyId, 'house');
    assert.equal(selection.matchedGenre, profile.name);
    assert.equal(selection.recommendedBpm, profile.recommendedBpm);
    assert.deepEqual(selection.bpmRange, profile.bpmRange);
    assert.equal(selection.keySignature, profile.keySignature);
    assert.equal(selection.timeSignature, '4/4');
    assert.equal(selection.isCatalogEntry, true);

    const generated = await AceStepPromptEngine.generatePrompt(
      'Techno and Trap influence with a focused original hook',
      profile.name
    );
    assert.equal(generated.genreLock.primaryGenre, 'House');
    assert.equal(generated.genreLock.subgenre, profile.name);
    assert.equal(generated.genreLock.targetBpm, profile.recommendedBpm);
    assert.equal(generated.genreProfile.styleBlueprint?.atmosphere, profile.atmosphere);
    assert.match(generated.optimizedPrompt, /ATMOSPHERE:/);
    assert.match(generated.optimizedPrompt, /GROOVE:/);
    assert.match(generated.optimizedPrompt, /BASS_IDENTITY:/);
    assert.match(generated.optimizedPrompt, /HARMONIC_LANGUAGE:/);
    assert.match(generated.optimizedPrompt, /ARRANGEMENT_ARC:/);
    assert.doesNotMatch(
      generated.optimizedPrompt,
      /USER_DETAILS_SECONDARY:[^|]*(?:TECHNO|TRAP)/i
    );

    const pattern = PatternGeneratorService.generatePattern(profile.name, 986761986);
    assert.equal(pattern.genre, 'House');
    assert.equal(pattern.subgenre, profile.name);
    assert.equal(pattern.grid.timeSignature, '4/4');
    assert.equal(pattern.grid.enforceStepGrid, true);
    assert.ok(pattern.styleDirectives.length >= 8);
    assert.match(pattern.promptDirective, /HOUSE_STYLE_BLUEPRINT:/);
    assert.match(pattern.promptDirective, new RegExp(profile.name, 'i'));
  }

  const expectations: Array<[string, RegExp]> = [
    ['Deep House', /warm, intimate, deep, nocturnal and relaxed/i],
    ['Tech House', /minimal, hypnotic, cheeky/i],
    ['Progressive House', /long build-ups/i],
    ['Disco House', /orchestral strings, rhythm guitar, brass/i],
    ['Acid House', /authentic TB-303 squelch/i],
    ['Afro House', /African polyrhythms/i],
    ['Tropical House', /marimba, steel drum/i],
    ['Bass House', /modulated mid-bass call-and-response/i],
    ['Balearic House', /dreamy, coastal, spacious/i],
    ['Microhouse', /microscopic edits/i]
  ];

  for (const [genre, expected] of expectations) {
    const generated = await AceStepPromptEngine.generatePrompt(
      'create a faithful club track',
      genre
    );
    assert.match(generated.optimizedPrompt, expected);
  }

  assert.equal(resolveHouseStyleProfile('Techno House')?.name, 'Tech House');
  assert.equal(resolveHouseStyleProfile('Disco / Funky House')?.name, 'Disco House');
  assert.equal(resolveHouseStyleProfile('Filter House')?.name, 'French House');

  console.log(JSON.stringify({
    status: 'PASS',
    houseProfiles: HOUSE_STYLE_DEFINITIONS.length,
    verifiedPromptProfiles: HOUSE_STYLE_DEFINITIONS.length,
    verifiedGrooveProfiles: HOUSE_STYLE_DEFINITIONS.length,
    representativeStyles: expectations.map(([genre]) => genre)
  }, null, 2));
}

void run();
