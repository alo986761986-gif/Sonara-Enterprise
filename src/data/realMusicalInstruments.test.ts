import assert from 'node:assert/strict';
import {
  ALL_REAL_MUSICAL_INSTRUMENTS,
  REAL_INSTRUMENT_SUGGESTIONS,
  extractRealInstrumentsFromText,
  getRealInstrumentGroup,
  matchesRealInstrumentSearch
} from './realMusicalInstruments.ts';

assert.ok(REAL_INSTRUMENT_SUGGESTIONS.length >= 20, 'expected broad real-instrument family coverage');
assert.ok(ALL_REAL_MUSICAL_INSTRUMENTS.length >= 250, 'expected at least 250 real instruments');

const normalized = ALL_REAL_MUSICAL_INSTRUMENTS.map(item => item.toLocaleLowerCase('en-US'));
assert.equal(new Set(normalized).size, normalized.length, 'duplicate instrument names are not allowed');

for (const group of REAL_INSTRUMENT_SUGGESTIONS) {
  assert.ok(group.label.trim(), 'instrument group label cannot be empty');
  assert.ok(group.items.length > 0, `instrument group cannot be empty: ${group.label}`);
}

assert.equal(getRealInstrumentGroup('Violin'), 'Bowed Strings');
assert.equal(getRealInstrumentGroup('TR-808 Drum Machine'), 'Electronic Instruments & Machines');
assert.equal(getRealInstrumentGroup('Darbuka'), 'Middle East & Central Asia — Winds & Percussion');
assert.equal(getRealInstrumentGroup('Kora'), 'African Instruments');
assert.equal(getRealInstrumentGroup('Sitar'), 'South Asia — Strings');
assert.equal(getRealInstrumentGroup('Guzheng'), 'East Asia — Strings');

assert.equal(matchesRealInstrumentSearch('Resonator Guitar', 'dobro'), true);
assert.equal(matchesRealInstrumentSearch('Darbuka', 'doumbek'), true);
assert.equal(matchesRealInstrumentSearch('Rhodes Electric Piano', 'rhodes'), true);
assert.equal(matchesRealInstrumentSearch('TR-808 Drum Machine', '808'), true);

const selected = extractRealInstrumentsFromText('Deep house with Rhodes, TR-909 and Darbuka, plus Kora textures.');
assert.deepEqual(selected.sort(), ['Darbuka', 'Kora', 'Rhodes Electric Piano', 'TR-909 Drum Machine'].sort());

for (const forbidden of ['Talk Box', 'Tape Loops', 'Field Recorder', 'Turntables', 'Arpeggiator', 'Synth Pad', 'Synth Lead', 'Synth Pluck']) {
  assert.equal(ALL_REAL_MUSICAL_INSTRUMENTS.includes(forbidden), false, `${forbidden} is a technique/device/role, not a canonical instrument entry`);
}

console.log(`SONARA real instrument catalog passed: ${REAL_INSTRUMENT_SUGGESTIONS.length} families, ${ALL_REAL_MUSICAL_INSTRUMENTS.length} instruments`);
