import assert from 'node:assert/strict';
import { resolveMusicTaxonomyHierarchy } from './musicTaxonomyHierarchy';

const bossa = resolveMusicTaxonomyHierarchy({
  family: 'Latin America',
  genre: 'Bossa Nova',
  subgenre: 'Bossa Nova',
  atmosphere: 'Intimate'
});
assert.equal(bossa.family, 'Latin America');
assert.equal(bossa.genre, 'Bossa Nova');
assert.equal(bossa.subgenre, 'Bossa Nova');
assert.equal(bossa.atmosphere, 'Intimate');

const deepHouse = resolveMusicTaxonomyHierarchy({
  family: 'Electronic / Dance',
  genre: 'House',
  subgenre: 'Deep House',
  atmosphere: 'Aggressive'
});
assert.equal(deepHouse.subgenre, 'Deep House');
assert.notEqual(deepHouse.atmosphere, 'Aggressive');
assert.ok(deepHouse.corrections.some(item => item.startsWith('atmosphere:')));

const inferred = resolveMusicTaxonomyHierarchy({
  family: '',
  genre: 'Trap',
  subgenre: 'Trap Soul',
  atmosphere: 'Dark'
});
assert.equal(inferred.family, 'Hip-Hop / Rap');
assert.equal(inferred.genre, 'Trap');
assert.equal(inferred.subgenre, 'Trap Soul');

const familyWins = resolveMusicTaxonomyHierarchy({
  family: 'Jazz',
  genre: 'Trap',
  subgenre: 'UK Drill',
  atmosphere: 'Menacing'
});
assert.equal(familyWins.family, 'Jazz');
assert.notEqual(familyWins.genre, 'Trap');
assert.notEqual(familyWins.subgenre, 'UK Drill');
assert.ok(familyWins.corrections.some(item => item.startsWith('genre:')));
assert.ok(familyWins.corrections.some(item => item.startsWith('subgenre:')));

const rnbTrapSoul = resolveMusicTaxonomyHierarchy({
  family: 'R&B / Soul / Funk',
  genre: 'R&B',
  subgenre: 'Trap Soul',
  atmosphere: 'Intimate'
});
assert.equal(rnbTrapSoul.canonicalPath.startsWith('R&B / Soul / Funk > R&B > Trap Soul > '), true);

console.log('SONARA taxonomy hierarchy tests passed.');
