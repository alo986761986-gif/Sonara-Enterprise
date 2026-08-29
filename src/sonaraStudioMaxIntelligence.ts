export const SONARA_STUDIO_MAX_VERSION = 'sonara-studio-max-v1';

export interface StudioMaxSection {
  name: string;
  startSec: number;
  endSec: number;
  purpose: string;
}

export interface StudioMaxBlueprint {
  version: string;
  durationSec: number;
  bpm: number;
  key: string;
  hasVocals: boolean;
  vocalLanguage: string;
  sectionPlan: StudioMaxSection[];
  sectionMap: string;
  hookContract: string;
  vocalContract: string;
  continuityContract: string;
  arrangementContract: string;
  productionContract: string;
  candidateAContract: string;
  candidateBContract: string;
  promptContract: string;
}

interface StudioMaxInput {
  durationSec?: number;
  duration?: number;
  bpm?: number;
  key?: string;
  key_scale?: string;
  lyrics?: string;
  vocalLanguage?: string;
  vocal_language?: string;
  vocalMode?: string;
  genre?: string;
  subgenre?: string;
  family?: string;
  mood?: string;
  styleIdentity?: string;
  instrumentation?: string;
  rhythm?: string;
  harmony?: string;
  arrangement?: string;
  production?: string;
}

const clean = (value: unknown, fallback = '') => {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text || fallback;
};

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

function allocateSections(durationSec: number, hasVocals: boolean): StudioMaxSection[] {
  const duration = Math.round(clamp(durationSec, 180, 30, 480));
  let template: Array<[string, number, string]>;

  if (duration <= 45) {
    template = hasVocals
      ? [
          ['Intro', 0.10, 'establish the sonic identity immediately'],
          ['Verse', 0.28, 'deliver the core lyrical and melodic idea'],
          ['Hook', 0.42, 'state the memorable refrain clearly'],
          ['Outro', 0.20, 'resolve without an abrupt cutoff']
        ]
      : [
          ['Intro', 0.12, 'establish the sonic identity immediately'],
          ['Main Motif', 0.34, 'state the signature instrumental idea'],
          ['Peak Hook', 0.38, 'deliver the strongest recognizable motif'],
          ['Outro', 0.16, 'resolve without an abrupt cutoff']
        ];
  } else if (duration < 120) {
    template = hasVocals
      ? [
          ['Intro', 0.08, 'establish style and singer identity'],
          ['Verse 1', 0.20, 'introduce narrative and melodic language'],
          ['Pre-Chorus', 0.10, 'increase tension and expectation'],
          ['Chorus', 0.22, 'deliver the primary hook'],
          ['Development', 0.17, 'develop the song without losing identity'],
          ['Final Chorus', 0.17, 'return to the hook with greater impact'],
          ['Outro', 0.06, 'finish intentionally']
        ]
      : [
          ['Intro', 0.08, 'establish style and signature timbre'],
          ['Theme A', 0.23, 'state the main motif'],
          ['Lift', 0.13, 'build tension and density'],
          ['Main Hook', 0.24, 'deliver the strongest motif'],
          ['Variation', 0.18, 'develop rhythm and harmony'],
          ['Final Hook', 0.09, 'restate the signature idea'],
          ['Outro', 0.05, 'finish intentionally']
        ];
  } else if (duration < 240) {
    template = hasVocals
      ? [
          ['Intro', 0.05, 'establish the sonic world'],
          ['Verse 1', 0.14, 'introduce narrative and melody'],
          ['Pre-Chorus', 0.07, 'create lift'],
          ['Chorus 1', 0.15, 'state the main hook'],
          ['Verse 2', 0.14, 'advance the narrative with continuity'],
          ['Pre-Chorus 2', 0.07, 'rebuild expectation'],
          ['Chorus 2', 0.15, 'reinforce hook recall'],
          ['Bridge', 0.10, 'create meaningful contrast'],
          ['Final Chorus', 0.09, 'deliver the emotional peak'],
          ['Outro', 0.04, 'resolve the track naturally']
        ]
      : [
          ['Intro', 0.06, 'establish style and motif'],
          ['Theme A', 0.16, 'state the main musical identity'],
          ['Development A', 0.12, 'increase rhythmic and harmonic detail'],
          ['Hook 1', 0.16, 'deliver the signature motif'],
          ['Theme B', 0.14, 'introduce compatible contrast'],
          ['Breakdown', 0.10, 'create controlled negative space'],
          ['Hook 2', 0.15, 'return with stronger orchestration'],
          ['Climax', 0.07, 'deliver the peak'],
          ['Outro', 0.04, 'resolve cleanly']
        ];
  } else {
    template = hasVocals
      ? [
          ['Intro', 0.04, 'establish style, groove and singer identity'],
          ['Verse 1', 0.11, 'introduce narrative and melody'],
          ['Pre-Chorus 1', 0.06, 'build expectation'],
          ['Chorus 1', 0.13, 'state the main hook'],
          ['Verse 2', 0.11, 'advance the story while preserving identity'],
          ['Pre-Chorus 2', 0.06, 'rebuild tension'],
          ['Chorus 2', 0.13, 'strengthen hook recall'],
          ['Instrumental Development', 0.10, 'expand the musical world without genre drift'],
          ['Bridge', 0.08, 'create meaningful harmonic or textural contrast'],
          ['Final Chorus', 0.12, 'deliver the largest emotional payoff'],
          ['Extended Outro', 0.06, 'resolve naturally and avoid malformed endings']
        ]
      : [
          ['Intro', 0.05, 'establish groove, timbre and motif'],
          ['Theme A', 0.13, 'state the primary musical identity'],
          ['Development A', 0.11, 'grow rhythmic and harmonic detail'],
          ['Hook 1', 0.13, 'deliver the signature motif'],
          ['Theme B', 0.11, 'introduce a compatible secondary idea'],
          ['Development B', 0.11, 'evolve instrumentation and counterpoint'],
          ['Breakdown', 0.09, 'create controlled contrast and space'],
          ['Hook 2', 0.12, 'return to the signature motif with more impact'],
          ['Climax', 0.09, 'deliver the peak without overfilling'],
          ['Extended Outro', 0.06, 'resolve naturally and remain mixable']
        ];
  }

  const sections: StudioMaxSection[] = [];
  let cursor = 0;
  for (let index = 0; index < template.length; index++) {
    const [name, ratio, purpose] = template[index];
    const isLast = index === template.length - 1;
    const end = isLast ? duration : Math.max(cursor + 1, Math.round(cursor + duration * ratio));
    sections.push({ name, startSec: cursor, endSec: Math.min(duration, end), purpose });
    cursor = Math.min(duration, end);
  }
  sections[sections.length - 1].endSec = duration;
  return sections;
}

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const secs = String(safe % 60).padStart(2, '0');
  return `${minutes}:${secs}`;
}

export function buildStudioMaxBlueprint(input: StudioMaxInput = {}): StudioMaxBlueprint {
  const durationSec = Math.round(clamp(input.durationSec ?? input.duration, 180, 30, 480));
  const bpm = Math.round(clamp(input.bpm, 124, 40, 220));
  const key = clean(input.key || input.key_scale, 'C Major');
  const lyrics = String(input.lyrics || '').trim();
  const vocalMode = clean(input.vocalMode, '').toLowerCase();
  const hasVocals = Boolean(lyrics) || (!/instrumental|no vocals|senza voce/.test(vocalMode) && Boolean(clean(input.vocalLanguage || input.vocal_language, '')));
  const vocalLanguage = clean(input.vocalLanguage || input.vocal_language, hasVocals ? 'auto' : 'none');
  const genre = clean(input.genre, 'Music');
  const subgenre = clean(input.subgenre, genre);
  const mood = clean(input.mood, 'Authentic');
  const sections = allocateSections(durationSec, hasVocals);
  const sectionMap = sections.map(section => `${formatClock(section.startSec)}-${formatClock(section.endSec)} ${section.name}: ${section.purpose}`).join(' | ');
  const hookReturns = durationSec >= 240 ? 3 : durationSec >= 90 ? 2 : 1;

  const hookContract = hasVocals
    ? `Create one unmistakable melodic/lyrical hook and return to it at least ${hookReturns} time${hookReturns === 1 ? '' : 's'}. Preserve the core melody and key words on every return; intensify arrangement rather than replacing the hook with unrelated material.`
    : `Create one unmistakable instrumental signature motif and return to it at least ${hookReturns} time${hookReturns === 1 ? '' : 's'}. Preserve its rhythmic/melodic identity while developing orchestration, register and counterpoint.`;

  const vocalContract = hasVocals
    ? `Maintain one stable lead-singer identity from first phrase to final phrase. Language=${vocalLanguage}. Keep diction intelligible, pitch centered, breathing natural, phrasing emotionally coherent, sibilance controlled and doubles/harmonies supportive rather than replacing the lead. Do not change singer age, timbre, accent or gender presentation between sections unless the creator explicitly requests a duet or character change.`
    : 'Instrumental mode: do not invent lead vocals, spoken fragments or accidental vocalizations. Let the primary instrument or synth voice carry a memorable human-like phrase shape.';

  const continuityContract = `Keep the same song identity across the full ${durationSec}s: BPM ${bpm}, key ${key}, tonal center, groove family, core drum/bass relationship, signature sound palette and hook identity must remain coherent. New sections must feel like developments of the same composition, not stitched generations. Avoid unexplained tempo resets, key drift, sudden genre changes, random new intros, abrupt silence and malformed endings.`;

  const arrangementContract = `Use this macro-arrangement map as a musical guide: ${sectionMap}. Transitions need preparation, release and continuity. The first 10 seconds must already communicate ${subgenre}; the strongest payoff must feel earned, and the ending must resolve intentionally.`;

  const productionContract = `Studio-master target for ${subgenre} / ${mood}: preserve transients, controlled sub-bass, readable low-mid range, open non-harsh highs, stable center image, genre-appropriate stereo width, mono-compatible bass, clear front-to-back depth and no clipping. Keep musical dynamics; do not flatten every section to the same loudness. Deliver clean 48 kHz WAV-compatible quality and a complete tail.`;

  const candidateAContract = `MASTER A — HOOK/STRUCTURE: maximize immediate identity, memorable hook, clean section architecture, vocal intelligibility when present, strong groove and commercially readable arrangement while staying authentically ${subgenre}.`;
  const candidateBContract = `MASTER B — MUSICAL DETAIL: preserve the same creator brief, BPM, key, lyrics and ${subgenre} DNA, but use a genuinely different melodic contour, voicing, transition language and timbral balance. It must be an alternate composition, not a near-duplicate.`;

  const promptContract = [
    `SONARA STUDIO MAX ${SONARA_STUDIO_MAX_VERSION}.`,
    hookContract,
    vocalContract,
    continuityContract,
    arrangementContract,
    productionContract
  ].join('\n');

  return {
    version: SONARA_STUDIO_MAX_VERSION,
    durationSec,
    bpm,
    key,
    hasVocals,
    vocalLanguage,
    sectionPlan: sections,
    sectionMap,
    hookContract,
    vocalContract,
    continuityContract,
    arrangementContract,
    productionContract,
    candidateAContract,
    candidateBContract,
    promptContract
  };
}
