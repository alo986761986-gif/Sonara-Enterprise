import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUniversalLockedBody, universalCaption } from './sonara-engine-v14-universal-taxonomy-lock.mjs';

function body(subgenre, genre, prompt, extra = {}) {
  return {
    genreFamily: extra.genreFamily || 'Latin America',
    genre,
    subgenre,
    mood: extra.mood || 'Intimate',
    prompt,
    vocalMode: 'instrumental',
    weirdness: extra.weirdness ?? 82,
    styleInfluence: extra.styleInfluence ?? 37
  };
}

test('v14 preserves the detailed Bossa Nova production prompt', () => {
  const source = body(
    'Bossa Nova',
    'Bossa Nova',
    'Instrumentation: nylon-string guitar, soft acoustic bass and restrained percussion. Rhythm and groove: authentic bossa guitar syncopation with human timing. Harmony and melody: rich jazz-influenced chords and smooth voice leading.'
  );
  const locked = buildUniversalLockedBody(source);
  assert.match(locked.prompt, /nylon-string guitar/i);
  assert.match(locked.prompt, /authentic bossa guitar syncopation/i);
  assert.match(locked.prompt, /rich jazz-influenced chords/i);
  assert.match(locked.prompt, /AUTHORITATIVE STYLE LOCK: Latin America > Bossa Nova > Bossa Nova/i);
  assert.equal(locked.styleInfluence, 37);
  assert.equal(locked.weirdness, 82);
  assert.equal(locked.sonaraGenreLock, 'universal-v14-taxonomy720-authoritative-prompt');
});

test('different subgenres retain different musical fingerprints', () => {
  const fado = buildUniversalLockedBody(body(
    'Fado',
    'Fado',
    'Portuguese guitar, expressive voice-led saudade, restrained accompaniment, intimate rubato and melancholic phrasing.',
    { genreFamily: 'Folk / Traditional Europe', mood: 'Saudade' }
  ));
  const samba = buildUniversalLockedBody(body(
    'Samba',
    'Samba',
    'Layered Brazilian percussion, surdo-centered pulse, syncopated ensemble momentum and communal call-and-response.',
    { mood: 'Festive' }
  ));
  const amapiano = buildUniversalLockedBody(body(
    'Amapiano',
    'Amapiano',
    'South African log-drum bass movement, spacious groove, jazzy keys and patient rhythmic evolution.',
    { genreFamily: 'Africa', mood: 'Deep' }
  ));

  assert.match(fado.prompt, /Portuguese guitar/i);
  assert.match(samba.prompt, /surdo-centered pulse/i);
  assert.match(amapiano.prompt, /log-drum bass movement/i);
  assert.notEqual(fado.prompt, samba.prompt);
  assert.notEqual(samba.prompt, amapiano.prompt);
  assert.doesNotMatch(amapiano.prompt, /AUTHORITATIVE STYLE LOCK:.*House > House/i);
});

test('professional prompt is no longer truncated to the legacy 500 characters', () => {
  const detailed = `Instrumentation: ${'acoustic detail '.repeat(80)} UNIQUE_END_MARKER`;
  const caption = universalCaption(body('Fado', 'Fado', detailed, { genreFamily: 'Folk / Traditional Europe' }));
  assert.ok(caption.length > 500, `expected detailed caption > 500 chars, got ${caption.length}`);
  assert.match(caption, /UNIQUE_END_MARKER/);
});

test('electronic family remains delegated unchanged to validated electronic locks', () => {
  const source = body('Tech House', 'House', 'Tech House professional prompt', { genreFamily: 'Electronic / Dance' });
  const locked = buildUniversalLockedBody(source);
  assert.equal(locked, source);
});
