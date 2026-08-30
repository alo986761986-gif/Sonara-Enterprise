import assert from 'node:assert/strict';
import { WORLD_MUSIC_GENRES } from './worldMusicGenres.ts';

function family(name: string) {
  const item = WORLD_MUSIC_GENRES.find(group => group.family === name);
  assert.ok(item, `missing musical family: ${name}`);
  return item;
}

function genre(familyName: string, genreName: string) {
  const item = family(familyName).genres.find(candidate => candidate.name === genreName);
  assert.ok(item, `missing real genre: ${familyName} > ${genreName}`);
  return item;
}

function exactPath(familyName: string, genreName: string, subgenreName: string) {
  const item = genre(familyName, genreName);
  assert.ok(item.subgenres.includes(subgenreName), `wrong taxonomy path: ${familyName} > ${genreName} > ${subgenreName}`);
}

function absentChild(familyName: string, genreName: string, child: string) {
  assert.ok(!genre(familyName, genreName).subgenres.includes(child), `misclassified child remains under ${familyName} > ${genreName}: ${child}`);
}

assert.equal(WORLD_MUSIC_GENRES.length, 25, 'SONARA must preserve all 25 canonical musical families');

for (const group of WORLD_MUSIC_GENRES) {
  assert.ok(group.family.trim(), 'empty family name');
  const genreNames = group.genres.map(item => item.name.toLocaleLowerCase('en-US'));
  assert.equal(new Set(genreNames).size, genreNames.length, `duplicate genres in family ${group.family}`);
  for (const item of group.genres) {
    assert.ok(item.name.trim(), `empty genre in ${group.family}`);
    assert.ok(item.subgenres.length > 0, `genre without subgenres: ${group.family} > ${item.name}`);
    const children = item.subgenres.map(value => value.toLocaleLowerCase('en-US'));
    assert.equal(new Set(children).size, children.length, `duplicate subgenres: ${group.family} > ${item.name}`);
  }
}

// Canonical example required by the creator.
exactPath('Jazz', 'Jazz', 'Traditional Jazz');
exactPath('Jazz', 'Jazz Fusion', 'Jazz Fusion');
absentChild('Jazz', 'Jazz', 'Jazz Fusion');
exactPath('Jazz', 'Jazz-Funk', 'Jazz-Funk');
exactPath('Jazz', 'Acid Jazz', 'Acid Jazz');
exactPath('Jazz', 'Nu Jazz', 'Nu Jazz');
exactPath('Jazz', 'Smooth Jazz', 'Smooth Jazz');
exactPath('Jazz', 'Latin Jazz', 'Afro-Cuban Jazz');
exactPath('Jazz', 'Ethio-Jazz', 'Ethio-Jazz');

// Electronic umbrella containers become real genre parents.
exactPath('Electronic / Dance', 'Ambient', 'Dark Ambient');
exactPath('Electronic / Dance', 'Drone', 'Drone');
exactPath('Electronic / Dance', 'Downtempo', 'Downtempo');
exactPath('Electronic / Dance', 'Hardstyle', 'Rawstyle');
exactPath('Electronic / Dance', 'Hardcore', 'Gabber');
exactPath('Electronic / Dance', 'Electro', 'Electro Funk');
exactPath('Electronic / Dance', 'Electroclash', 'Electroclash');

// Pop, rock and metal are split by genuine musical lineage.
exactPath('Pop', 'Hyperpop', 'Bubblegum Bass');
exactPath('Pop', 'Bedroom Pop', 'Bedroom Pop');
exactPath('Pop', 'Dark Pop', 'Dark Pop');
exactPath('Rock', 'Rock & Roll', 'Rockabilly');
exactPath('Rock', 'Surf Rock', 'Surf Rock');
exactPath('Metal', 'Death Metal', 'Melodic Death Metal');
exactPath('Metal', 'Black Metal', 'Atmospheric Black Metal');
exactPath('Metal', 'Doom Metal', 'Funeral Doom');
exactPath('Metal', 'Metalcore', 'Mathcore');
exactPath('Metal', 'Djent', 'Djent');

// Jazz-adjacent and blues/reggae crossover styles get their own real parent.
exactPath('Jazz', 'Crooner', 'Crooner');
exactPath('Blues', 'Blues Rock', 'Blues Rock');
exactPath('Reggae / Jamaican', 'Dub', 'Dub');
exactPath('Reggae / Jamaican', 'Rocksteady', 'Rocksteady');

// Regional families keep geography as family while genres remain musical forms.
exactPath('South Asia', 'Hindustani Classical', 'Dhrupad');
exactPath('South Asia', 'Carnatic Classical', 'Carnatic Classical');
exactPath('East Asia', 'Mongolian Throat Singing', 'Mongolian Throat Singing');
exactPath('Country / Americana', 'Bluegrass', 'Bluegrass');
exactPath('Country / Americana', 'Old-Time', 'Appalachian Folk');
exactPath('Folk / Traditional Europe', 'Singer-Songwriter', 'Singer-Songwriter');
exactPath('Folk / Traditional Europe', 'Indie Folk', 'Indie Folk');

// Media and utility categories are separated into actual musical forms.
exactPath('Cinematic / Media', 'Video Game Soundtrack', 'JRPG Soundtrack');
exactPath('Cinematic / Media', 'Chiptune', '8-Bit');
exactPath('Easy Listening / Lounge', 'Lounge', 'Lounge');
exactPath('Easy Listening / Lounge', 'Cocktail Jazz', 'Cocktail Jazz');
exactPath('Children / Novelty / Spoken', "Children's Music", 'Children Music');
exactPath('Children / Novelty / Spoken', 'Nursery Rhymes', 'Nursery Rhymes');
exactPath('Children / Novelty / Spoken', 'Lullaby', 'Lullaby');

console.log(`SONARA real taxonomy v4 passed: ${WORLD_MUSIC_GENRES.length} families, ${WORLD_MUSIC_GENRES.reduce((sum, group) => sum + group.genres.length, 0)} real genres`);
