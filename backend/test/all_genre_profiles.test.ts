import assert from 'node:assert/strict';
import { AceStepPromptEngine } from '../src/services/AceStepPromptEngine';
import { PatternGeneratorService } from '../src/services/PatternGeneratorService';
import { GENRE_FAMILIES, normalizeGenreName } from '../../shared/genreCatalog';
import {
  countCuratedCatalogSubgenres,
  genreProductionPromptKeywords,
  hasCuratedGenreSignature,
  resolveGenreProductionBlueprint
} from '../../shared/genreProductionBlueprints';

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function run() {
  const allCatalogRows = GENRE_FAMILIES.flatMap(family =>
    family.subgenres.map(name => ({ family, name }))
  );

  assert.equal(GENRE_FAMILIES.length, 20);
  assert.equal(allCatalogRows.length, 306);
  assert.equal(countCuratedCatalogSubgenres(), allCatalogRows.length);

  for (const { name } of allCatalogRows) {
    assert.equal(hasCuratedGenreSignature(name), true, `missing signature: ${name}`);

    const blueprint = resolveGenreProductionBlueprint(name);
    assert.equal(blueprint.canonicalName, name);
    assert.equal(blueprint.isCatalogEntry, true);
    assert.equal(blueprint.isCuratedSubgenre, true);
    assert.ok(blueprint.signatureIdentity.length > 20);
    assert.ok(blueprint.atmosphere.length > 20);
    assert.ok(blueprint.groove.length > 20);
    assert.ok(blueprint.bass.length > 20);
    assert.ok(blueprint.harmony.length > 20);
    assert.ok(blueprint.soundPalette.length > 20);
    assert.ok(blueprint.arrangement.length > 20);
    assert.ok(blueprint.vocalStyle.length > 20);
    assert.ok(blueprint.bannedKeywords.length >= 3);

    const directives = genreProductionPromptKeywords(blueprint);
    assert.equal(directives.length, 8);
    assert.match(directives.join(' | '), /SIGNATURE_IDENTITY:/);
    assert.match(directives.join(' | '), /ATMOSPHERE:/);
    assert.match(directives.join(' | '), /GROOVE:/);
    assert.match(directives.join(' | '), /BASS_IDENTITY:/);
    assert.match(directives.join(' | '), /HARMONIC_LANGUAGE:/);
    assert.match(directives.join(' | '), /SIGNATURE_PALETTE:/);
    assert.match(directives.join(' | '), /ARRANGEMENT_ARC:/);
    assert.match(directives.join(' | '), /VOCAL_DIRECTION:/);

    const generated = await AceStepPromptEngine.generatePrompt(
      'Create a faithful production with an original motif and professional dynamics',
      name
    );
    assert.equal(generated.genreLock.subgenre, name);
    assert.equal(generated.genreLock.locked, true);
    assert.equal(generated.genreLock.isCatalogEntry, true);
    assert.equal(generated.genreProfile.styleBlueprint?.atmosphere, blueprint.atmosphere);
    assert.match(generated.optimizedPrompt, new RegExp(escapeRegExp(name), 'i'));
    assert.match(generated.optimizedPrompt, /SIGNATURE_IDENTITY:/);
    assert.match(generated.optimizedPrompt, /ARRANGEMENT_ARC:/);

    const pattern = PatternGeneratorService.generatePattern(name, 986761986);
    assert.equal(pattern.subgenre, name);
    assert.equal(pattern.grid.timeSignature, blueprint.timeSignature);
    assert.equal(pattern.styleDirectives.length, 8);
    assert.match(pattern.promptDirective, /GENRE_STYLE_BLUEPRINT:/);
    assert.match(pattern.promptDirective, new RegExp(escapeRegExp(name), 'i'));
  }

  const fidelityCases: Array<{
    genre: string;
    prompt: string;
    expected: RegExp;
    forbiddenSecondary: RegExp;
  }> = [
    {
      genre: 'Black Metal',
      prompt: 'House and Techno influence with dark guitars and blast beats',
      expected: /tremolo-picked guitars, blast beats/i,
      forbiddenSecondary: /USER_DETAILS_SECONDARY:[^|]*(?:HOUSE|TECHNO)/i
    },
    {
      genre: 'Salsa',
      prompt: 'Trance and Deep House influence with brass and piano',
      expected: /clave, piano montuno, tumbao bass/i,
      forbiddenSecondary: /USER_DETAILS_SECONDARY:[^|]*(?:TRANCE|HOUSE)/i
    },
    {
      genre: 'Amapiano',
      prompt: 'Tech House and EDM influence with warm keys',
      expected: /log-drum bass, shakers, jazzy keys/i,
      forbiddenSecondary: /USER_DETAILS_SECONDARY:[^|]*(?:TECH HOUSE|EDM)/i
    },
    {
      genre: 'Bebop',
      prompt: 'Pop and House influence with virtuosic saxophone',
      expected: /fast walking bass, ride-cymbal swing/i,
      forbiddenSecondary: /USER_DETAILS_SECONDARY:[^|]*(?:POP|HOUSE)/i
    },
    {
      genre: 'Carnatic',
      prompt: 'Techno and cinematic influence with expressive melody',
      expected: /South Indian raga and tala discipline/i,
      forbiddenSecondary: /USER_DETAILS_SECONDARY:[^|]*(?:TECHNO|CINEMATIC)/i
    },
    {
      genre: 'Liquid Drum & Bass',
      prompt: 'Trap and Rock influence with soulful chords',
      expected: /fluid breaks, soulful chords, warm sub/i,
      forbiddenSecondary: /USER_DETAILS_SECONDARY:[^|]*(?:TRAP|ROCK)/i
    }
  ];

  for (const testCase of fidelityCases) {
    const generated = await AceStepPromptEngine.generatePrompt(
      testCase.prompt,
      testCase.genre
    );
    assert.equal(generated.genreLock.subgenre, testCase.genre);
    assert.match(generated.optimizedPrompt, testCase.expected);
    assert.doesNotMatch(generated.optimizedPrompt, testCase.forbiddenSecondary);
  }

  const waltzPattern = PatternGeneratorService.generatePattern('Viennese Waltz', 42);
  assert.equal(waltzPattern.grid.timeSignature, '3/4');
  assert.equal(waltzPattern.grid.enforceStepGrid, false);
  assert.match(waltzPattern.promptDirective, /authentic Viennese Waltz rhythm/i);

  const uniqueNames = new Set(allCatalogRows.map(row => normalizeGenreName(row.name)));
  console.log(JSON.stringify({
    status: 'PASS',
    catalogFamilies: GENRE_FAMILIES.length,
    catalogRows: allCatalogRows.length,
    uniqueGenreNames: uniqueNames.size,
    curatedProfiles: countCuratedCatalogSubgenres(),
    exactPromptAudits: allCatalogRows.length,
    exactPatternAudits: allCatalogRows.length,
    conflictRemovalCases: fidelityCases.map(testCase => testCase.genre)
  }, null, 2));
}

void run();
