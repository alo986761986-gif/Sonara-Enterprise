import assert from 'node:assert/strict';
import {
  buildContextualVariation,
  buildPromptContextChips,
  buildPromptDirectorBrief,
  stripVocalLanguageForInstrumental
} from './promptDirector';

const base = {
  idea: 'Dark emotional club music with female vocals and a hypnotic feeling',
  family: 'Electronic / Dance',
  genre: 'House',
  subgenre: 'Deep House',
  mood: 'Dark',
  vocalMode: 'instrumental',
  bpmMode: 'manual' as const,
  bpm: 122,
  weirdness: 35,
  styleInfluence: 82,
  styleTags: ['deep rolling bassline', 'hypnotic groove', 'warm pads', 'late-night atmosphere']
};

const stripped = stripVocalLanguageForInstrumental(base.idea);
assert.doesNotMatch(stripped, /female vocals/i, 'instrumental mode must remove explicit vocal requests');
assert.match(stripped, /dark emotional club music/i, 'instrumental sanitization must preserve the creator idea');

const professional = buildPromptDirectorBrief(base, 'professional');
assert.match(professional, /Electronic \/ Dance → House → Deep House/, 'full selected taxonomy must be locked');
assert.match(professional, /exactly 122 BPM/i, 'manual BPM must remain authoritative');
assert.match(professional, /Instrumental only/i, 'instrumental lock must be explicit');
assert.match(professional, /Weirdness 35%/i, 'weirdness must be propagated');
assert.match(professional, /Style Influence 82%/i, 'style influence must be propagated');
assert.doesNotMatch(professional, /female vocals/i, 'instrumental master prompt must not retain contradictory vocal wording');

const cinematic = buildPromptDirectorBrief({ ...base, vocalMode: 'female', idea: 'Deep and nocturnal' }, 'cinematic');
assert.match(cinematic, /Female lead vocal/i, 'female vocal selection must be propagated');
assert.match(cinematic, /CINEMATIC DIRECTION/i, 'cinematic director must add cinematic arrangement guidance');

const random = buildContextualVariation(base, 'professional', 0.42);
assert.match(random, /dark emotional club music/i, 'contextual random must preserve the creator idea');
assert.doesNotMatch(random, /techno|trance|jazz|rock/i, 'contextual random must not inject unrelated genre families');

const chips = buildPromptContextChips(base, 'professional').map(chip => chip.label);
assert.ok(chips.includes('Deep House'), 'style chip must expose the selected subgenre');
assert.ok(chips.includes('122 BPM'), 'manual BPM chip must be visible');
assert.ok(chips.includes('INSTRUMENTAL'), 'instrumental chip must be visible');
assert.ok(chips.includes('WEIRD 35%'), 'weirdness chip must be visible');
assert.ok(chips.includes('STYLE 82%'), 'style influence chip must be visible');
assert.ok(chips.includes('PROFESSIONALE'), 'director chip must be visible');

console.log('SONARA Prompt Director tests passed');
