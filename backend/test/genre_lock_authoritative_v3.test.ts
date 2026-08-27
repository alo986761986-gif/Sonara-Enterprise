import assert from 'node:assert/strict';
import { AceStepPromptEngine } from '../src/services/AceStepPromptEngine';

async function main() {
  const bossaPrompt = 'Create a professional Bossa Nova production. Professional taxonomy path: Latin America > Bossa Nova > Bossa Nova. Use nylon-string guitar, intimate Brazilian syncopation and sophisticated harmony. Lock the result to exactly 132 BPM, A Minor.';
  const bossa = await AceStepPromptEngine.generatePrompt(bossaPrompt, 'Bossa Nova');
  assert.equal(bossa.genreLock.subgenre, 'Bossa Nova', 'Bossa Nova must never fall back to Melodic House');
  assert.doesNotMatch(bossa.optimizedPrompt, /MELODIC HOUSE|four-on-the-floor 4\/4 kick/i);

  const fadoPrompt = 'Create a professional Fado production. Professional taxonomy path: Folk / Traditional Europe > Fado > Fado. Portuguese guitar, voice-led saudade, restrained accompaniment. Lock the result to exactly 84 BPM, D Minor.';
  const fado = await AceStepPromptEngine.generatePrompt(fadoPrompt, 'Fado');
  assert.equal(fado.genreLock.subgenre, 'Fado', 'Fado must never fall back to Melodic House');
  assert.doesNotMatch(fado.optimizedPrompt, /MELODIC HOUSE|four-on-the-floor 4\/4 kick/i);

  const sambaPrompt = 'Create a professional Samba production. Professional taxonomy path: Latin America > Samba > Samba. Layered Brazilian percussion, surdo-centered pulse and communal momentum. Lock the result to exactly 104 BPM, C Major.';
  const samba = await AceStepPromptEngine.generatePrompt(sambaPrompt, 'Samba');
  assert.equal(samba.genreLock.subgenre, 'Samba', 'Samba must remain Samba');
  assert.doesNotMatch(samba.optimizedPrompt, /MELODIC HOUSE|four-on-the-floor 4\/4 kick/i);

  const techHouse = await AceStepPromptEngine.generatePrompt('Create a professional Tech House production.', 'Tech House');
  assert.equal(techHouse.genreLock.subgenre, 'Tech House');
  assert.match(techHouse.optimizedPrompt, /bouncy percussive bassline/i);

  console.log('authoritative genre lock v3 passed: Bossa Nova, Fado, Samba and Tech House preserve distinct identities');
}

main();
