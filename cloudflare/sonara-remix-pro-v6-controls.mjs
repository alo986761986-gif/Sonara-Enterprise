// SONARA Creative DNA V6: bounded, allowlisted server-side fusion controls.
// This file does not authorize jobs, bypass billing or depend on client text.
export const V6_FUSION_MODES = Object.freeze(['balanced', 'experimental', 'wild']);
export const V6_MASTER_PROFILES = Object.freeze(['streaming', 'club']);
const NUMERIC = Object.freeze(['melody', 'harmony', 'groove', 'timbre', 'humanize']);
const defaults = Object.freeze({
  mode: 'balanced', melody: 65, harmony: 60, groove: 65,
  timbre: 55, humanize: 60, master: 'streaming'
});
export function parseV6Controls(raw) {
  if (raw === null || raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('CONTROLS_INVALID');
  if (Object.keys(raw).some(k => !['mode', 'melody', 'harmony', 'groove', 'timbre', 'humanize', 'master'].includes(k)))
    throw new Error('CONTROLS_UNKNOWN');
  const result = {...defaults, ...raw};
  if (!V6_FUSION_MODES.includes(result.mode) || !V6_MASTER_PROFILES.includes(result.master))
    throw new Error('CONTROLS_PROFILE_INVALID');
  for (const field of NUMERIC) {
    const val = result[field];
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val > 100 || val % 5 !== 0)
      throw new Error('CONTROLS_LEVEL_INVALID');
  }
  return result;
}
const words = Object.freeze({
  balanced: 'Balanced arrangement: reconcile the two sources into one coherent composition, with clear transitions and a recurring central hook.',
  experimental: 'Experimental arrangement: develop fresh complementary motifs, altered call and response, and varied sections while maintaining harmonic coherence.',
  wild: 'Wild arrangement: create a bold new musical identity with contrasting sections, unconventional fills and original counter-melodies; do not simply copy, layer or collage the source tracks.'
});
function level(value) { return value < 35 ? 'subtle' : value > 70 ? 'prominent' : 'moderate'; }
export function v6PreviewBrief(controls) {
  const c = parseV6Controls(controls);
  if (!c) return '';
  // When the GPU V6 upgrade has not yet landed, the verified V5 engine
  // can already interpret this server-controlled composition direction.
  return [
    'SONARA CREATIVE DNA FUSION controls (safe V5 compatibility direction).',
    words[c.mode],
    'A melody influence: ' + level(c.melody) + '; reinterpret phrases instead of overlaying source audio.',
    'A harmonic influence: ' + level(c.harmony) + '; reharmonize only within one compatible tonal center.',
    'B groove influence: ' + level(c.groove) + '; use rhythmic articulation and expressive accents.',
    'B timbre influence: ' + level(c.timbre) + '; generate coherent natural instrumentation and consistent sonic space.',
    'Human groove direction: ' + level(c.humanize) + '; ghost notes, velocity variation and tasteful dynamic fills.',
    'Master target: ' + c.master + '; retain headroom, a safe peak and musical dynamics.',
    'Generate one new track, never a source overlay or medley.'
  ].join(' ').slice(0, 1350);
}
