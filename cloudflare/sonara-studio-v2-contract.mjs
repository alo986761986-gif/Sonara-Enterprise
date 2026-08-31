export const SONARA_STUDIO_V2_VERSION = 'sonara-studio-v2.0-production';
export const SONARA_SESSIONS_VERSION = '2.0';
export const SONARA_LONG_MEMORY_VERSION = 'sonara-long-song-memory-v1';
export const SONARA_VERSION_HISTORY_VERSION = 'sonara-session-history-v1';

export const STEMS_12 = Object.freeze([
  'vocals',
  'drums',
  'bass',
  'guitar',
  'keys',
  'synth',
  'strings',
  'brass',
  'woodwinds',
  'percussion',
  'pads',
  'fx'
]);

export const SESSION_OPERATIONS = Object.freeze([
  'replace',
  'inpaint',
  'extend',
  'remix',
  'audio-to-audio',
  'style-dna',
  'voice-dna',
  'stems',
  'stems-pro',
  'regenerate-stem',
  'regenerate-stem-section',
  'complete',
  'repair'
]);

const clean = value => String(value ?? '').trim();
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const first = (...values) => values.map(clean).find(Boolean) || '';

export function sessionOperationInstruction(operation) {
  const value = clean(operation).toLowerCase();
  const map = {
    replace: 'Replace only the selected region. Preserve everything outside it exactly, including singer identity, BPM, key, groove, ambience, loudness, instrumentation and arrangement continuity. Make both edit boundaries inaudible.',
    inpaint: 'Inpaint only the selected region seamlessly. Preserve the surrounding composition, singer identity, BPM, key, groove and production fingerprint. The transition into and out of the repaired region must be inaudible.',
    extend: 'Extend the arrangement naturally from the current ending. Reuse the song identity, singer, motif vocabulary, harmonic language, chorus identity, groove, instrumentation and production fingerprint without mechanically repeating a previous section.',
    remix: 'Create an alternate production while preserving the song identity, requested taxonomy, BPM, key, singer continuity and recognizable motifs.',
    'audio-to-audio': 'Use the source audio as structural and musical context. Preserve requested identity locks while creating a coherent original transformation.',
    'style-dna': 'Apply the active Style DNA consistently without overriding explicit SONARA Family > Genre > Subgenre > Atmosphere, BPM or key.',
    'voice-dna': 'Lock the active Voice DNA across the result: timbre, formants, register, accent, pronunciation, breath behavior, vibrato and expressive character.',
    'stems-pro': 'Produce phase-aligned, time-aligned, full-length professional stems with minimal bleed and artifacting.',
    'regenerate-stem-section': 'Regenerate only the selected stem section in context. Preserve exact bar grid, harmony, BPM, key, phase/timing relationship and the surrounding stem performance.'
  };
  return map[value] || '';
}

export function normalizeSongMemory(input = {}, previous = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const old = previous && typeof previous === 'object' ? previous : {};
  const bpm = finite(source.bpm ?? source.requestedBpm ?? old.bpm);
  const durationSec = finite(source.durationSec ?? source.duration ?? source.audio_duration ?? old.durationSec);
  return {
    version: SONARA_LONG_MEMORY_VERSION,
    persistent: true,
    projectId: first(source.projectId, source.sonaraProjectId, old.projectId),
    title: first(source.title, source.songTitle, source.projectName, old.title).slice(0, 160),
    family: first(source.family, source.musicFamily, old.family).slice(0, 100),
    genre: first(source.genre, source.selectedGenre, old.genre).slice(0, 100),
    subgenre: first(source.subgenre, source.selectedSubgenre, source.style, old.subgenre).slice(0, 120),
    atmosphere: first(source.atmosphere, source.mood, old.atmosphere).slice(0, 180),
    bpm: bpm == null ? null : Math.max(40, Math.min(220, Math.round(bpm))),
    key: first(source.key, source.key_scale, source.keySignature, old.key).slice(0, 40),
    timeSignature: first(source.timeSignature, source.time_signature, old.timeSignature).slice(0, 16),
    singerIdentity: first(source.singerIdentity, source.voiceIdentity, old.singerIdentity).slice(0, 1200),
    voiceProfileId: first(source.voiceProfileId, source?.sonaraActiveVoiceProfile?.id, old.voiceProfileId).slice(0, 100),
    personaProfileId: first(source.personaProfileId, source?.sonaraActivePersonaProfile?.id, old.personaProfileId).slice(0, 100),
    motif: first(source.motif, source.motifMemory, source.hook, old.motif).slice(0, 1600),
    chorusIdentity: first(source.chorusIdentity, source.chorus, source.hookIdentity, old.chorusIdentity).slice(0, 2200),
    harmony: first(source.harmony, source.chordProgression, source.chords, old.harmony).slice(0, 1600),
    instrumentation: first(source.instrumentation, source.instruments, old.instrumentation).slice(0, 2200),
    arrangement: first(source.arrangement, source.sectionBlueprint, source.structure, old.arrangement).slice(0, 3000),
    ending: first(source.ending, source.endingPlan, old.ending).slice(0, 1200),
    lyricsAnchor: first(source.lyricsAnchor, source.lyricsChorus, source.lyrics, old.lyricsAnchor).slice(0, 3000),
    creatorBrief: first(source.sonaraOriginalCreatorBrief, source.rawPrompt, source.creatorPrompt, source.prompt, old.creatorBrief).slice(0, 4000),
    durationSec: durationSec == null ? null : Math.max(1, Math.min(600, durationSec)),
    lastOperation: first(source.sonaraSessionOperation, source.operation, old.lastOperation).slice(0, 80),
    updatedAt: Date.now(),
    createdAt: Number(old.createdAt || Date.now())
  };
}

export function mergeSongMemory(previous = {}, incoming = {}) {
  const next = normalizeSongMemory(incoming, previous);
  const keepIfEmpty = [
    'title','family','genre','subgenre','atmosphere','key','timeSignature','singerIdentity','voiceProfileId','personaProfileId',
    'motif','chorusIdentity','harmony','instrumentation','arrangement','ending','lyricsAnchor','creatorBrief','lastOperation','projectId'
  ];
  for (const key of keepIfEmpty) {
    if (!clean(next[key]) && clean(previous?.[key])) next[key] = previous[key];
  }
  if (next.bpm == null && finite(previous?.bpm) != null) next.bpm = finite(previous.bpm);
  if (next.durationSec == null && finite(previous?.durationSec) != null) next.durationSec = finite(previous.durationSec);
  return next;
}

export function memoryInstruction(memory = {}) {
  if (!memory || typeof memory !== 'object') return '';
  const pieces = [];
  if (memory.family || memory.genre || memory.subgenre) pieces.push(`taxonomy ${[memory.family, memory.genre, memory.subgenre].filter(Boolean).join(' > ')}`);
  if (memory.atmosphere) pieces.push(`atmosphere ${memory.atmosphere}`);
  if (memory.bpm) pieces.push(`BPM ${memory.bpm}`);
  if (memory.key) pieces.push(`key ${memory.key}`);
  if (memory.singerIdentity) pieces.push(`singer ${memory.singerIdentity}`);
  if (memory.motif) pieces.push(`motif memory ${memory.motif}`);
  if (memory.chorusIdentity) pieces.push(`chorus identity ${memory.chorusIdentity}`);
  if (memory.harmony) pieces.push(`harmony ${memory.harmony}`);
  if (memory.instrumentation) pieces.push(`instrumentation ${memory.instrumentation}`);
  if (memory.arrangement) pieces.push(`section blueprint ${memory.arrangement}`);
  if (memory.ending) pieces.push(`ending plan ${memory.ending}`);
  if (!pieces.length) return '';
  return `SONARA LONG SONG MEMORY: ${pieces.join('; ')}. Preserve these identities unless the user explicitly requests a change.`;
}

export function studioV2Capabilities() {
  return {
    version: SONARA_STUDIO_V2_VERSION,
    sessions: SONARA_SESSIONS_VERSION,
    timelineRegionSelection: true,
    timelineReplace: true,
    timelineInpaint: true,
    timelineExtend: true,
    dualABTakes: true,
    persistentVersionHistory: SONARA_VERSION_HISTORY_VERSION,
    voiceDnaInheritance: true,
    styleDnaInheritance: true,
    stems: [...STEMS_12],
    maxStems: 12,
    isolateStem: true,
    removeStem: true,
    regenerateStem: true,
    regenerateStemSection: true,
    audioToAudio: true,
    longSongMemory: SONARA_LONG_MEMORY_VERSION,
    motifContinuity: true,
    chorusIdentityLock: true,
    singerIdentityContinuity: true,
    endingIntegrity: true,
    professionalReleaseGate: 88
  };
}
