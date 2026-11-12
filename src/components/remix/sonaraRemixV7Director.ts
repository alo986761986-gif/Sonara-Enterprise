/**
 * SONARA V7 studio direction. Client-side composition briefs only.
 * Never claims a GPU/audio preview, never queues work, and never bypasses
 * the server's fixed V6 controls or a real quality release gate.
 */
export type V7Intent = {
  vocalFlow: number;
  houseGroove: number;
  harmony: number;
  arrangement: number;
};
export type V7Direction = { id: 'dialogue'|'groove'|'harmonic'; name:string; focus:string; brief:string };
const clamp=(value:number)=>Number.isFinite(value)?Math.max(0,Math.min(100,Math.round(value))):50;
const intensity=(v:number)=>v>=75?'strong':v>=40?'moderate':'subtle';

export function v7Directions(intent:V7Intent): readonly V7Direction[] {
  const vocal=intensity(clamp(intent.vocalFlow));
  const groove=intensity(clamp(intent.houseGroove));
  const tonal=intensity(clamp(intent.harmony));
  const form=intensity(clamp(intent.arrangement));
  const common=[
    'Create ONE original House song from the two authorized sources, never a PCM overlay or mashup.',
    'Preserve the natural ORIGINAL voices from A and B; no rewriting, translating or synthetic vocal impersonation.',
    'Use only the steady original kick and tempo from song A, never a competing B kick.',
    'Keep both performances intelligible and separated in the stereo mix.',
    'Maintain verified dynamic headroom; the release quality gate remains mandatory.',
  ].join(' ');
  return [
    {id:'dialogue',name:'Voci in dialogo',focus:'Voci A+B e frasi naturali',
      brief:`${common} VOICE-LED: ${vocal} focus on phrase-aware call-and-response and pauses that preserve complete words; avoid fixed A/B chorus swaps. ${form} development in the arrangement. Keep a stable harmonic bed compatible with both real singers.`},
    {id:'groove',name:'House Club Groove',focus:'Cassa A, groove e naturalezza',
      brief:`${common} GROOVE-LED: ${groove} human feel through kick-controlled dynamics, real percussion accents and tiny arrangement-level fills without changing the only A drum clock. ${vocal} focus on natural original-vocal phrasing; maintain one drum family throughout.`},
    {id:'harmonic',name:'Harmonic Deep Fusion',focus:'Tonalità, basso e arrangiamento',
      brief:`${common} HARMONY-LED: ${tonal} focus on supportive harmonic voicings and a single compatible tonal center; if the singers' estimated keys disagree or are uncertain, use sparse neutral backing instead of forceful pitch correction. ${form} evolution of melody and dynamics across intro, verses, development and outro.`},
  ];
}

export function addV7Direction(userPrompt:string, selected:V7Direction):string {
  // Preserve creator intent; the strict server prompt limit remains 6500.
  const text=userPrompt.trim().slice(0,4300);
  return [text, '[SONARA V7 Studio direction: '+selected.name+']',selected.brief].join('\n').slice(0,6500);
}
