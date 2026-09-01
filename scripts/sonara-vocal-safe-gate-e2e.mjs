import fs from 'node:fs';

const API = String(process.env.API_ORIGIN || 'https://api.sonaraenterprise.com').replace(/\/$/, '');
const WEB = String(process.env.WEB_ORIGIN || 'https://sonaraenterprise.com').replace(/\/$/, '');
const REPORT = process.env.SONARA_VOCAL_SAFE_REPORT || 'sonara-vocal-safe-gate-e2e-report.json';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const out = { startedAt: new Date().toISOString(), ok: false, stages: [], outputs: {} };
const save = () => { out.finishedAt = new Date().toISOString(); fs.writeFileSync(REPORT, JSON.stringify(out, null, 2) + '\n'); };

async function json(url, init = {}, allowed = [200, 202]) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(120000) });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`non-JSON HTTP ${r.status}: ${text.slice(0,180)}`); }
  if (!allowed.includes(r.status)) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data).slice(0,500)}`);
  return data;
}
const job = data => data?.job || data?.data || data || {};
const status = data => String(job(data).status || '').toUpperCase();
const urls = data => {
  const j = job(data), a = [];
  const add = x => { x = String(x || '').trim(); if (/^https:\/\//.test(x) && !a.includes(x)) a.push(x); };
  add(j.audioUrl); for (const x of j.audioUrls || []) add(x); for (const x of j.candidates || []) add(x?.audioUrl || x?.url); return a;
};

async function pollMusic(id) {
  for (let i=1;i<=160;i++) {
    const d = await json(`${WEB}/api/music/job/${encodeURIComponent(id)}?safe=${Date.now()}-${i}`, { headers:{'Cache-Control':'no-cache'} });
    console.log(`music ${i}: ${status(d)} ${Number(job(d).progress||0)}%`);
    if (status(d)==='COMPLETED') return job(d);
    if (['FAILED','ERROR','CANCELLED'].includes(status(d))) throw new Error(`music failed: ${JSON.stringify(job(d)).slice(0,500)}`);
    await sleep(5000);
  }
  throw new Error('music timeout');
}

async function pollSafe(id) {
  for (let i=1;i<=160;i++) {
    const d = await json(`${API}/api/studio/job/${encodeURIComponent(id)}?safe=${Date.now()}-${i}`, { headers:{'Cache-Control':'no-cache'} });
    console.log(`safe ${i}: ${status(d)} ${Number(job(d).progress||0)}%`);
    if (status(d)==='COMPLETED') return job(d);
    if (['FAILED','ERROR','CANCELLED'].includes(status(d))) throw new Error(`safe failed: ${JSON.stringify(job(d)).slice(0,700)}`);
    await sleep(4000);
  }
  throw new Error('safe timeout');
}

try {
  console.log('=== generate ULTRA vocal ===');
  const lyrics='[Verse]\nNeon on the window, midnight in my eyes\nI can hear the city breathing through the lights\n\n[Chorus]\nStay with me inside this purple night\nHold the rhythm till the morning light';
  const prompt='Professional deep melodic house, natural intimate female lead vocal, 118 BPM, A minor, warm sub bass, rounded kick, analog chords, emotional chorus, clear lyrics, stable human vocal timbre.';
  const submit = await json(`${API}/api/engine/generate`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prompt,rawPrompt:prompt,lyrics,vocalMode:'female',vocalLanguage:'en',genre:'House',subgenre:'Melodic House',bpm:118,key:'A Minor',durationSec:30,generationProfileV3:'ultra',renderProfile:'ultra'}) });
  const musicId=String(submit.jobId||submit?.result?.jobId||''); if(!musicId) throw new Error('generation jobId missing');
  const generated=await pollMusic(musicId); const source=urls(generated)[0]; if(!source) throw new Error('source audio missing');
  if(generated?.metadata?.topLevelAudioAlignedWithDirectorRank!==true) throw new Error('rank-one alignment missing');
  out.outputs.generation={jobId:musicId,sourceAudioUrl:source,metadata:generated.metadata};

  console.log('=== submit Vocal Safe Gate ===');
  const safeSubmit=await json(`${API}/api/studio/vocal-refine-safe`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceAudioUrl:source,bpm:118,key:'A Minor',durationSec:30,preserveStrength:0.95,issues:['harsh sibilance and brittle consonants','unstable formants or synthetic vowel tone'],prompt:'Conservative vocal-only polish. Preserve lyrics, singer identity, melody, timing, BPM, key, arrangement and instrumental. Correct only sibilance and unstable synthetic formants.'})});
  const safeId=String(safeSubmit.jobId||''); if(!safeId.startsWith('vocal-safe-')) throw new Error(`safe jobId invalid: ${safeId}`);
  const done=await pollSafe(safeId);
  const gate=done.vocalSafeGate||{};
  if(done.audioUrl!==source && gate.selected!=='refined') throw new Error('non-original selected without refined approval');
  if(gate.selected==='refined') {
    if(gate.releaseSafe!==true || Number(gate.refinedScore)<88 || Number(gate.technicalScoreDelta)<-1) throw new Error(`unsafe refined promotion: ${JSON.stringify(gate).slice(0,900)}`);
    if(done.audioUrl!==done.refinedAudioUrl) throw new Error('refined selected but audioUrl mismatch');
  } else {
    if(done.audioUrl!==source || done.fallbackUsed!==true) throw new Error('fallback did not return original rank-one audio');
  }
  out.ok=true;
  out.outputs.safe={jobId:safeId,selectedVersion:done.selectedVersion,fallbackUsed:done.fallbackUsed,audioUrl:done.audioUrl,originalAudioUrl:done.originalAudioUrl,refinedAudioUrl:done.refinedAudioUrl,vocalSafeGate:gate};
  console.log(JSON.stringify({ok:true,selected:gate.selected,fallbackUsed:done.fallbackUsed,originalScore:gate.originalScore,refinedScore:gate.refinedScore,delta:gate.technicalScoreDelta,reason:gate.reason},null,2));
} catch(e) {
  out.error=e instanceof Error?e.message:String(e); console.error(out.error); process.exitCode=1;
} finally { save(); }
