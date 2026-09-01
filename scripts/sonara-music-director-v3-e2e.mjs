import fs from 'node:fs';

const API = String(process.env.API_ORIGIN || 'https://api.sonaraenterprise.com').replace(/\/$/, '');
const WEB = String(process.env.WEB_ORIGIN || 'https://sonaraenterprise.com').replace(/\/$/, '');
const SECRET = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
const REPORT_PATH = process.env.SONARA_DIRECTOR_V3_REPORT || 'sonara-music-director-v3-e2e-report.json';
const POLL_MS = Math.max(2500, Number(process.env.POLL_MS || 5000));
const MAX_POLLS = Math.max(40, Number(process.env.MAX_POLLS || 180));
const PROJECT = `prompt-v2-multigenre-${Date.now()}`;
const PROFILE = 'sonara-prompt-v2-multigenre';

const report = { startedAt:new Date().toISOString(), apiOrigin:API, webOrigin:WEB, projectId:PROJECT, capabilities:null, profiles:{}, genres:{}, ok:false, diagnostics:[] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = () => { report.finishedAt = new Date().toISOString(); fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report,null,2)}\n`); };
const h = extra => ({ ...(SECRET ? {'X-Sonara-Internal-Secret':SECRET} : {}), 'X-Sonara-Profile-Id':PROFILE, 'X-Sonara-Project-Id':PROJECT, ...(extra || {}) });

async function json(url, init = {}, allowed = [200,202]) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(Number(init.timeoutMs || 300000)) });
  const text = await response.text(); let data;
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`${init.label || url}: non-JSON HTTP ${response.status}: ${text.slice(0,400)}`); }
  if (!allowed.includes(response.status)) throw new Error(`${init.label || url}: HTTP ${response.status}: ${JSON.stringify(data).slice(0,1000)}`);
  return data;
}

function statusOf(data){ const raw=String(data?.status||data?.state||data?.data?.status||data?.data?.state||'').toUpperCase(); if(['COMPLETED','SUCCESS','SUCCEEDED','DONE','FINISHED','READY'].includes(raw))return'COMPLETED'; if(['FAILED','ERROR','CANCELLED','CANCELED'].includes(raw))return'FAILED'; return'PROCESSING'; }
function jobOf(data){ return data?.job || data?.data || data || {}; }
function audioUrls(data){ const job=jobOf(data),out=[]; const add=v=>{v=String(v||'').trim(); if(/^https:\/\//i.test(v)&&!out.includes(v))out.push(v);}; add(job.audioUrl); for(const x of Array.isArray(job.candidates)?job.candidates:[])add(x?.audioUrl||x?.url); for(const x of Array.isArray(job.outputs)?job.outputs:[])add(x?.audioUrl||x?.url); for(const x of Array.isArray(job.audioUrls)?job.audioUrls:[])add(x); return out; }
function isWavUrl(value){ try{ const u=new URL(String(value)); const p=String(u.searchParams.get('path')||u.pathname).toLowerCase(); return p.endsWith('.wav')||p.endsWith('.wav32'); }catch{return false;} }

async function waitForCapabilities(){
  const data = await json(`${API}/api/music/director/capabilities?canary=${Date.now()}`, {method:'GET',headers:{'Cache-Control':'no-cache'},label:'capabilities'}, [200]);
  if(String(data?.version||'')!=='sonara-music-director-v3') throw new Error(`Music Director V3 non pubblico: ${JSON.stringify(data).slice(0,500)}`);
  report.capabilities=data;
}

async function pollJob(jobId,label){
  for(let i=1;i<=MAX_POLLS;i++){
    const data=await json(`${WEB}/api/music/job/${encodeURIComponent(jobId)}?promptV2Canary=${Date.now()}-${i}`,{method:'GET',headers:{'Cache-Control':'no-cache'},label:`${label} poll`},[200,202]);
    const job=jobOf(data),status=statusOf(data); console.log(`${label.toUpperCase()} ${i}/${MAX_POLLS}: ${status} ${Number(job.progress||data?.progress||0)}%`);
    if(status==='FAILED')throw new Error(`${label}: job fallito: ${JSON.stringify(job.error||job.message||job).slice(0,1200)}`);
    if(status==='COMPLETED')return job;
    await sleep(POLL_MS);
  }
  throw new Error(`${label}: timeout dopo ${MAX_POLLS} poll.`);
}

async function quality2(urls, requested, label){
  const data = await json(`${API}/api/studio/quality-v2`, {
    method:'POST', headers:h({'Content-Type':'application/json'}), body:JSON.stringify({audioUrls:urls,...requested}), label:`${label} quality-v2`
  }, [200,202]);
  const reports = Array.isArray(data?.reports) ? data.reports : [];
  if(!reports.length || !reports.some(r=>r?.measuredFromRealWav===true)) throw new Error(`${label}: Quality 2.0 non ha misurato WAV reali.`);
  const ranked = reports.slice().sort((a,b)=>Number(b?.professionalScore||0)-Number(a?.professionalScore||0));
  const best = ranked[0] || {};
  const bestScore = Number(best?.professionalScore || 0);
  if(bestScore < 88) throw new Error(`${label}: qualità ${bestScore}/100 sotto 88.`);
  if(best.bpmPassed !== true) throw new Error(`${label}: BPM lock ${requested.bpm} fallito; detected=${best.detectedBpm ?? best.bpm ?? 'n/a'}.`);
  const hard = [...new Set(ranked.flatMap(r=>r?.hardFailureReasons||[]))];
  if(hard.length) throw new Error(`${label}: hard failure ${hard.join(', ')}.`);
  return { bestProfessionalScore:bestScore, bpmPassed:true, detectedBpm:best.detectedBpm??best.bpm??null, keyPassed:best.keyComparable===true?best.keyPassed===true:null, reports:ranked.map(r=>({professionalScore:r?.professionalScore,professionalReleasePassed:r?.professionalReleasePassed,measuredFromRealWav:r?.measuredFromRealWav,bpmPassed:r?.bpmPassed,detectedBpm:r?.detectedBpm??r?.bpm??null,hardFailureReasons:r?.hardFailureReasons||[]})) };
}

async function runCase(c){
  console.log(`\n=== REAL ${c.id.toUpperCase()} GENERATION ===`);
  const submitted=await json(`${API}/api/engine/generate`,{method:'POST',headers:h({'Content-Type':'application/json',Accept:'application/json'}),body:JSON.stringify({title:`SONARA ${c.id} Canary`,genreFamily:c.genreFamily,genre:c.genre,subgenre:c.subgenre,mood:c.mood,rawPrompt:c.prompt,prompt:c.prompt,lyrics:'',vocalMode:'instrumental',bpm:c.bpm,key:c.key,durationSec:30,weirdness:c.weirdness,styleInfluence:c.styleInfluence,candidateCount:2,dualFast:true,generationProfileV3:c.profile||'quality',sonaraMusicDirectorV3:'sonara-music-director-v3',projectId:PROJECT,profileId:PROFILE,sonaraPromptV2MultiGenreE2E:true}),label:`${c.id} submit`});
  const jobId=String(submitted?.jobId||submitted?.job_id||submitted?.id||''); if(!jobId)throw new Error(`${c.id}: jobId mancante.`);
  console.log(`${c.id}: ${jobId}`);
  const done=await pollJob(jobId,c.id); const urls=audioUrls(done).slice(0,2);
  if(urls.length!==2)throw new Error(`${c.id}: attesi 2 master, ricevuti ${urls.length}.`);
  if(!urls.every(isWavUrl))throw new Error(`${c.id}: output non interamente WAV.`);
  const quality=await quality2(urls,{bpm:c.bpm,key:c.key,durationSec:30},c.id);
  return {jobId,genre:c.genre,subgenre:c.subgenre,requestedBpm:c.bpm,requestedKey:c.key,audioUrls:urls,...quality};
}

const CASES=[
{id:'deep-house-quality',genreFamily:'Electronic / Dance',genre:'House',subgenre:'Deep House',bpm:122,key:'A Minor',weirdness:48,styleInfluence:92,mood:'Deep, dark, emotional, hypnotic, elegant, late-night',prompt:'Professional deep house instrumental, exact 122 BPM in A minor. Deep controlled sub bass, rounded club kick, crisp restrained percussion, warm analog minor chords, subtle dub echoes, evolving nocturnal pads, memorable understated motif, tension and release, polished stereo depth, clean transients, deliberate ending. No vocals. Avoid generic EDM and pop structure.'},
{id:'deep-house-ultra',profile:'ultra',genreFamily:'Electronic / Dance',genre:'House',subgenre:'Deep House',bpm:122,key:'A Minor',weirdness:42,styleInfluence:96,mood:'Deep, dark, emotional, hypnotic, elegant, late-night',prompt:'Release-ready deep house instrumental, exact 122 BPM in A minor. Expensive analog character, deep controlled sub, rounded club kick, detailed restrained percussion, warm extended minor chords, dub space, evolving nocturnal pads, memorable two-bar hook, organic micro-variation, strong tension and release, deliberate DJ-friendly ending, natural dynamics, pristine transients, coherent stereo depth. No vocals. No generic EDM.'},
{id:'tech-house',genreFamily:'Electronic / Dance',genre:'House',subgenre:'Tech House',bpm:126,key:'F Minor',weirdness:42,styleInfluence:94,mood:'Driving, minimal, dark, club-focused',prompt:'Professional Tech House instrumental at exact 126 BPM in F minor. Tight punchy kick, elastic mono bass phrase, pronounced 16th-note shuffle, rolling hats, syncopated percussion, sparse dry stabs, filtered hook fragments, compact DJ arrangement, controlled FX, strong club low end. No lush cinematic pads, no trance supersaws.'},
{id:'afro-house',genreFamily:'Electronic / Dance',genre:'House',subgenre:'Afro House',bpm:120,key:'D Minor',weirdness:50,styleInfluence:94,mood:'Organic, hypnotic, soulful, spiritual',prompt:'Professional Afro House instrumental at exact 120 BPM in D minor. Interlocking polyrhythms, hand drums, shakers, grounded four-on-the-floor kick, deep bass, organic mallets, soulful modal harmony, call-and-response motifs, warm pads, earthy textures, gradual spiritual build. No generic EDM drop.'},
{id:'trap',genreFamily:'Hip Hop / Rap',genre:'Trap',subgenre:'Trap',bpm:140,key:'C Minor',weirdness:45,styleInfluence:95,mood:'Dark, cinematic, heavy, focused',prompt:'Professional Trap instrumental at exact 140 BPM in C minor. Deep controlled 808, weighty kick relationship, crisp snare, expressive hi-hat subdivisions and rolls, sparse dark keys and bells, strong tonal center, spacious verse pocket, hook lift. No four-on-the-floor house groove.'},
{id:'hip-hop',genreFamily:'Hip Hop / Rap',genre:'Hip-Hop / Rap',subgenre:'Boom Bap',bpm:94,key:'E Minor',weirdness:38,styleInfluence:93,mood:'Raw, soulful, confident, head-nod',prompt:'Professional Hip-Hop / Boom Bap instrumental at exact 94 BPM in E minor. Human pocket, punchy kick and snare, swung hats, warm sample-like keys, focused bass, dusty character drums, restrained melodic motif, clear vocal space. No EDM transitions.'},
{id:'jungle-dnb',genreFamily:'Electronic / Dance',genre:'Drum & Bass',subgenre:'Jungle / Drum & Bass',bpm:174,key:'G Minor',weirdness:58,styleInfluence:96,mood:'Dark, kinetic, rave, atmospheric',prompt:'Professional Jungle / Drum & Bass instrumental at exact 174 BPM in G minor. Genuine full-time rapid chopped breakbeats, rolling sub bass, atmospheric pads, concise dark motif, controlled Reese texture, strong forward motion. Never reinterpret as half-time; no house groove.'}
];

async function main(){
  try{
    await waitForCapabilities();
    for(const c of CASES){ const result=await runCase(c); if(c.id.startsWith('deep-house-')) report.profiles[c.id.replace('deep-house-','')]=result; else report.genres[c.id]=result; save(); }
    report.ok=true; save(); console.log('\nSONARA PROMPT INTELLIGENCE V2 MULTI-GENRE REAL CANARY: PASS');
  }catch(error){ report.ok=false; report.error=error instanceof Error?error.message:String(error); save(); console.error(`\nSONARA PROMPT INTELLIGENCE V2 MULTI-GENRE CANARY: FAIL\n${report.error}`); process.exitCode=1; }
}
await main();
