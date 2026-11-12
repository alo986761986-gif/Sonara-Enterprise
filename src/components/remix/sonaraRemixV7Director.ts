/**
 * SONARA Remix Pro producer directions.
 * Client-side composition briefs only: no audio job is created here.
 * The GPU V5 renderer limits creatorPrompt to its first 1,000 characters.
 * Front-load the three production stages while preserving creator intent.
 * No model upgrade, listening evaluation or release-gate bypass is implied.
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

const productionContract = [
  'ONE newly arranged House record from authorized songs A+B; not a mashup or PCM overlay.',
  'ARRANGEMENT: write a fresh bass/harmonic backing with evolving 8/16-bar sections, intro, development, transitions and outro. Keep one 4/4 pulse and tempo from A; no second kit or competing kick.',
  'VOCALS: retain authentic performances A+B and complete words; arrange natural phrases with breathing space, not fixed alternating chorus blocks. No re-singing, translation or cloned voices.',
  'MASTER: protect vocal intelligibility, balance kick against bass, avoid harsh highs and frequency masking, retain punch and dynamic headroom. Keep the mandatory technical release gate.',
].join(' ');

export function v7Directions(intent:V7Intent): readonly V7Direction[] {
  const vocal=intensity(clamp(intent.vocalFlow));
  const groove=intensity(clamp(intent.houseGroove));
  const tonal=intensity(clamp(intent.harmony));
  const form=intensity(clamp(intent.arrangement));
  return [
    {id:'dialogue',name:'Voci in dialogo',focus:'Frasi originali A+B, pause naturali',
      brief:`${productionContract} VOICE-LED: ${vocal} natural call-and-response, ${form} musical form; sparse accompaniment behind active singers.`},
    {id:'groove',name:'House Club Groove',focus:'Un solo groove, nuova strumentazione',
      brief:`${productionContract} GROOVE-LED: ${groove} dynamic arrangement and human-feel accents without changing A clock; ${vocal} phrase-aware vocal space.`},
    {id:'harmonic',name:'Harmonic Deep Fusion',focus:'Basso, accordi e sviluppo armonico',
      brief:`${productionContract} HARMONY-LED: ${tonal} harmonic cohesion; if source keys conflict, prefer a neutral sparse backing rather than forcing singer pitch. ${form} evolving sections.`},
  ];
}

export function addV7Direction(userPrompt:string, selected:V7Direction):string {
  // Keep user intent first, then all three production stages inside the
  // V5 GPU's first 1,000 creatorPrompt characters. Remaining user text
  // stays available to earlier fusion-prompt stages up to the server limit.
  const user=userPrompt.trim();
  const opening=user.slice(0,240);
  const producer=selected.brief.slice(0,680);
  const remainder=user.slice(240,4300);
  const head=[opening,'[SONARA PRODUCER - '+selected.name+']',producer].join('\n');
  return (head+(remainder?'\n[ADDITIONAL CREATOR DIRECTIONS]\n'+remainder:'')).slice(0,6500);
}
