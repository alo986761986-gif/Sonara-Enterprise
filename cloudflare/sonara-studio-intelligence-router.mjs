import runtime from './sonara-studio-ai-router.mjs';
export { SonaraJobState } from './sonara-studio-ai-router.mjs';

const VERSION = 'sonara-studio-intelligence-v1';
const API_ORIGIN = 'https://api.sonaraenterprise.com';
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const ALLOWED_ORIGINS = new Set(['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', API_ORIGIN]);
const PROFILE_HEADER = 'x-sonara-profile-id';
const MAX_PROFILE_NOTES = 32;

const clean = value => String(value ?? '').trim();
const clamp = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

function cors(request) {
  const origin = clean(request.headers.get('Origin'));
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': `Authorization,Content-Type,${PROFILE_HEADER},X-Sonara-Studio`,
    'Access-Control-Expose-Headers': 'X-Sonara-Studio-Intelligence',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-studio-intelligence': VERSION,
      ...cors(request)
    }
  });
}

function allowed(request) {
  const origin = clean(request.headers.get('Origin'));
  return ALLOWED_ORIGINS.has(origin) || (!origin && request.method === 'GET');
}

function profileId(request) {
  const raw = clean(request.headers.get(PROFILE_HEADER));
  return /^[a-zA-Z0-9_-]{8,80}$/.test(raw) ? raw : '';
}

function profileStub(env, id) {
  if (!id || !env?.SONARA_JOB_STATE) return null;
  try {
    return env.SONARA_JOB_STATE.get(env.SONARA_JOB_STATE.idFromName(`taste-${id}`));
  } catch {
    return null;
  }
}

async function readProfile(env, id) {
  const stub = profileStub(env, id);
  if (!stub) return null;
  try {
    const response = await stub.fetch('https://sonara.internal/state');
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function writeProfile(env, id, profile) {
  const stub = profileStub(env, id);
  if (!stub) return false;
  const response = await stub.fetch('https://sonara.internal/state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...profile, persistent: true, updatedAt: Date.now() })
  });
  return response.ok;
}

function normalizeTaxonomy(body = {}) {
  return {
    family: clean(body.family || body.genreFamily || body.genre_family || body.sonaraSelectedFamily),
    genre: clean(body.genre || body.sonaraSelectedGenre),
    subgenre: clean(body.subgenre || body.sonaraSelectedSubgenre),
    atmosphere: clean(body.atmosphere || body.mood || body.sonaraSelectedMood)
  };
}

function profileGuidance(profile, taxonomy) {
  if (!profile || Number(profile.totalFeedback || 0) < 2) return '';
  const likes = profile.likes || {};
  const familyKey = taxonomy.family.toLowerCase();
  const genreKey = taxonomy.genre.toLowerCase();
  const subgenreKey = taxonomy.subgenre.toLowerCase();
  const compatible = [subgenreKey, genreKey, familyKey].some(key => key && Number(likes[key] || 0) > 0);
  const traits = Array.isArray(profile.preferredTraits) ? profile.preferredTraits.slice(0, 8) : [];
  const bpm = Number(profile.preferredBpm || 0);
  const parts = [];
  if (compatible && traits.length) parts.push(`User taste inside this selected DNA: ${traits.join(', ')}.`);
  if (compatible && bpm > 0) parts.push(`Historical preferred tempo is around ${Math.round(bpm)} BPM, but the explicit BPM control remains authoritative.`);
  if (Array.isArray(profile.avoidTraits) && profile.avoidTraits.length) parts.push(`Avoid when compatible: ${profile.avoidTraits.slice(0, 6).join(', ')}.`);
  return parts.join(' ');
}

async function rewriteGenerateRequest(request, env) {
  if (request.method !== 'POST') return request;
  const url = new URL(request.url);
  if (!GENERATE_PATHS.has(url.pathname)) return request;
  if (!clean(request.headers.get('content-type')).toLowerCase().includes('application/json')) return request;
  const id = profileId(request);
  if (!id) return request;
  let body;
  try { body = await request.clone().json(); } catch { return request; }
  const profile = await readProfile(env, id);
  if (!profile) return request;
  const taxonomy = normalizeTaxonomy(body);
  const guidance = profileGuidance(profile, taxonomy);
  if (!guidance) return request;
  const creator = clean(body.sonaraOriginalCreatorBrief || body.rawPrompt || body.creatorPrompt || body.creator_prompt || body.musicPrompt);
  const nextCreator = [creator, `SONARA MY TASTE: ${guidance}`].filter(Boolean).join('\n').slice(0, 2400);
  const next = {
    ...body,
    sonaraOriginalCreatorBrief: nextCreator,
    rawPrompt: nextCreator,
    sonaraMyTasteApplied: true,
    sonaraMyTasteVersion: VERSION
  };
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-my-taste', 'v1');
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(next),
    credentials: request.credentials,
    redirect: request.redirect,
    cache: 'no-store'
  });
}

function increment(map, key, amount = 1) {
  const text = clean(key).toLowerCase();
  if (!text) return map || {};
  return { ...(map || {}), [text]: Number((map || {})[text] || 0) + amount };
}

function boundedUnique(values, limit = MAX_PROFILE_NOTES) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const text = clean(value).slice(0, 100);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

async function feedbackEndpoint(request, env) {
  if (!allowed(request)) return json(request, { error: 'Origin non autorizzata.' }, 403);
  const id = profileId(request);
  if (!id) return json(request, { error: 'Profilo SONARA mancante.' }, 400);
  let body = {};
  try { body = await request.json(); } catch { return json(request, { error: 'JSON non valido.' }, 400); }
  const previous = await readProfile(env, id) || { persistent: true, totalFeedback: 0, likes: {}, dislikes: {}, preferredTraits: [], avoidTraits: [] };
  const liked = body.liked === true || Number(body.rating || 0) >= 4 || clean(body.action).toLowerCase() === 'like';
  const disliked = body.liked === false || Number(body.rating || 0) <= 2 || clean(body.action).toLowerCase() === 'dislike';
  const taxonomy = normalizeTaxonomy(body);
  let likes = { ...(previous.likes || {}) };
  let dislikes = { ...(previous.dislikes || {}) };
  for (const value of [taxonomy.family, taxonomy.genre, taxonomy.subgenre]) {
    if (liked) likes = increment(likes, value, 1);
    if (disliked) dislikes = increment(dislikes, value, 1);
  }
  const traits = boundedUnique([...(previous.preferredTraits || []), ...(Array.isArray(body.traits) ? body.traits : []), ...(liked && clean(body.note) ? [body.note] : [])]);
  const avoidTraits = boundedUnique([...(previous.avoidTraits || []), ...(Array.isArray(body.avoidTraits) ? body.avoidTraits : []), ...(disliked && clean(body.note) ? [body.note] : [])]);
  const bpm = Number(body.bpm || 0);
  const previousBpm = Number(previous.preferredBpm || 0);
  const likedCount = Number(previous.likedCount || 0) + (liked ? 1 : 0);
  const preferredBpm = liked && bpm > 0 ? (previousBpm > 0 ? ((previousBpm * Math.max(1, likedCount - 1)) + bpm) / likedCount : bpm) : previousBpm;
  const profile = {
    ...previous,
    persistent: true,
    totalFeedback: Number(previous.totalFeedback || 0) + 1,
    likedCount,
    dislikedCount: Number(previous.dislikedCount || 0) + (disliked ? 1 : 0),
    likes,
    dislikes,
    preferredTraits: traits,
    avoidTraits,
    preferredBpm: preferredBpm ? Math.round(preferredBpm * 10) / 10 : null,
    lastTaxonomy: taxonomy,
    lastFeedbackAt: Date.now()
  };
  await writeProfile(env, id, profile);
  return json(request, { status: 'success', profile });
}

async function tasteEndpoint(request, env) {
  if (!allowed(request)) return json(request, { error: 'Origin non autorizzata.' }, 403);
  const id = profileId(request);
  if (!id) return json(request, { error: 'Profilo SONARA mancante.' }, 400);
  if (request.method === 'GET') {
    return json(request, { status: 'success', profile: await readProfile(env, id) || null });
  }
  let body = {};
  try { body = await request.json(); } catch { return json(request, { error: 'JSON non valido.' }, 400); }
  const previous = await readProfile(env, id) || { persistent: true, totalFeedback: 0, likes: {}, dislikes: {} };
  const profile = {
    ...previous,
    persistent: true,
    preferredTraits: boundedUnique(body.preferredTraits || previous.preferredTraits || []),
    avoidTraits: boundedUnique(body.avoidTraits || previous.avoidTraits || []),
    preferredBpm: body.preferredBpm == null ? previous.preferredBpm || null : Math.round(clamp(body.preferredBpm, 124, 40, 220) * 10) / 10,
    intensity: Math.round(clamp(body.intensity, previous.intensity || 65, 0, 100)),
    manualProfile: true
  };
  await writeProfile(env, id, profile);
  return json(request, { status: 'success', profile });
}

const EXTRA_CSS = String.raw`
#sonara-intelligence-box{border-top:1px solid rgba(255,255,255,.07);margin-top:14px;padding-top:14px}.sonara-intelligence-title{font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#8b98aa;margin-bottom:8px}.sonara-taste-row{display:grid;grid-template-columns:1fr auto auto;gap:6px}.sonara-taste-btn{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);color:#c4cedc;border-radius:9px;padding:8px 9px;font:800 10px/1 system-ui;cursor:pointer}.sonara-taste-btn:hover{background:rgba(255,255,255,.07)}#sonara-midi-roll{height:120px;width:100%;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:#090d13;margin-top:8px}#sonara-midi-info{font-size:10px;color:#718096;line-height:1.5;margin-top:7px}
`;

const EXTRA_UI = String.raw`(() => {
  if (window.__sonaraStudioIntelligenceV1) return;
  window.__sonaraStudioIntelligenceV1 = true;
  const API = 'https://api.sonaraenterprise.com';
  const PROFILE_KEY = 'sonara.profile.id';
  const SOURCE_KEY = 'sonara.studio.sourceAudioUrl';
  let profileId = localStorage.getItem(PROFILE_KEY) || '';
  if (!profileId) { profileId = 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,12); localStorage.setItem(PROFILE_KEY, profileId); }
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    try {
      const req = input instanceof Request ? input : new Request(input, init);
      const url = new URL(req.url, location.href);
      if (url.hostname === 'api.sonaraenterprise.com' || url.origin === location.origin) {
        const headers = new Headers(req.headers); headers.set('x-sonara-profile-id', profileId);
        return nativeFetch(new Request(req, { headers }));
      }
    } catch {}
    return nativeFetch(input, init);
  };

  function waitPanel(){
    const body = document.querySelector('#sonara-studio-ai-panel .sonara-ai-body');
    if (!body) { setTimeout(waitPanel, 700); return; }
    if (document.getElementById('sonara-intelligence-box')) return;
    const box = document.createElement('div'); box.id = 'sonara-intelligence-box';
    box.innerHTML = "<div class='sonara-intelligence-title'>SONARA Intelligence</div><label class='sonara-ai-label'>My Taste · cosa vuoi sentire più spesso</label><textarea id='sonara-taste-like' class='sonara-ai-textarea' placeholder='Esempio: bassline profonde, kick asciutti, vocal intimi, mix scuro'></textarea><label class='sonara-ai-label'>Cosa vuoi evitare</label><textarea id='sonara-taste-avoid' class='sonara-ai-textarea' placeholder='Esempio: drop EDM generici, vocal troppo pop, hi-hat metallici'></textarea><div class='sonara-taste-row' style='margin-top:8px'><button class='sonara-ai-btn' id='sonara-taste-save'>Salva My Taste</button><button class='sonara-taste-btn' id='sonara-like'>♥ Mi piace</button><button class='sonara-taste-btn' id='sonara-dislike'>× Non mi piace</button></div><label class='sonara-ai-label'>Audio → MIDI AI</label><button class='sonara-ai-btn sonara-primary' id='sonara-audio-midi'>Trascrivi sorgente in MIDI</button><canvas id='sonara-midi-roll' width='500' height='120'></canvas><div id='sonara-midi-info'>Analisi monofonica locale: ideale per voce, basso, lead, piano/chitarra isolati. Il MIDI viene creato nel browser e può essere importato nello Studio.</div>";
    body.appendChild(box);
    hydrateTaste();
    document.getElementById('sonara-taste-save').addEventListener('click', saveTaste);
    document.getElementById('sonara-like').addEventListener('click', function(){ feedback(true); });
    document.getElementById('sonara-dislike').addEventListener('click', function(){ feedback(false); });
    document.getElementById('sonara-audio-midi').addEventListener('click', audioToMidi);
  }

  function headers(){ return { 'content-type':'application/json', 'x-sonara-profile-id':profileId }; }
  async function api(path, init){ const response = await nativeFetch(API + path, init); const text = await response.text(); let data={}; try{data=text?JSON.parse(text):{}}catch{} if(!response.ok) throw new Error(data.error||('HTTP '+response.status)); return data; }
  async function hydrateTaste(){ try { const data=await api('/api/studio/taste',{headers:{'x-sonara-profile-id':profileId},cache:'no-store'}); const p=data.profile||{}; document.getElementById('sonara-taste-like').value=(p.preferredTraits||[]).join(', '); document.getElementById('sonara-taste-avoid').value=(p.avoidTraits||[]).join(', '); } catch{} }
  async function saveTaste(){ const preferredTraits=document.getElementById('sonara-taste-like').value.split(',').map(x=>x.trim()).filter(Boolean); const avoidTraits=document.getElementById('sonara-taste-avoid').value.split(',').map(x=>x.trim()).filter(Boolean); await api('/api/studio/taste',{method:'POST',headers:headers(),body:JSON.stringify({preferredTraits,avoidTraits})}); const status=document.getElementById('sonara-ai-status'); if(status){status.classList.add('sonara-show');status.textContent='My Taste salvato e pronto per le prossime generazioni.';} }
  async function feedback(liked){ const source=localStorage.getItem(SOURCE_KEY)||''; const bpm=Number(localStorage.getItem('sonara.preferredBpm')||124); const traits=document.getElementById('sonara-taste-like').value.split(',').map(x=>x.trim()).filter(Boolean); const avoidTraits=document.getElementById('sonara-taste-avoid').value.split(',').map(x=>x.trim()).filter(Boolean); await api('/api/studio/feedback',{method:'POST',headers:headers(),body:JSON.stringify({liked,bpm,traits,avoidTraits,audioUrl:source})}); const status=document.getElementById('sonara-ai-status'); if(status){status.classList.add('sonara-show');status.textContent=liked?'Preferenza positiva registrata in My Taste.':'Preferenza negativa registrata: SONARA la eviterà quando compatibile.';} }

  function writeVar(value){ const out=[]; let buffer=value&0x7f; while((value>>=7)){buffer<<=8;buffer|=((value&0x7f)|0x80);} while(true){out.push(buffer&0xff);if(buffer&0x80)buffer>>=8;else break;} return out; }
  function midiBytes(notes,bpm){
    const ppq=480; const events=[]; const sorted=[];
    notes.forEach(n=>{sorted.push({tick:Math.max(0,Math.round(n.start*bpm/60*ppq)),on:true,note:n.note,vel:n.velocity||90});sorted.push({tick:Math.max(1,Math.round((n.start+n.duration)*bpm/60*ppq)),on:false,note:n.note,vel:0});});
    sorted.sort((a,b)=>a.tick-b.tick || (a.on?1:-1)); let last=0; const tempo=Math.round(60000000/bpm); events.push(0,0xff,0x51,0x03,(tempo>>16)&255,(tempo>>8)&255,tempo&255);
    sorted.forEach(e=>{events.push(...writeVar(Math.max(0,e.tick-last)),e.on?0x90:0x80,e.note&127,e.vel&127);last=e.tick;}); events.push(0,0xff,0x2f,0);
    const header=[0x4d,0x54,0x68,0x64,0,0,0,6,0,0,0,1,(ppq>>8)&255,ppq&255]; const len=events.length; const track=[0x4d,0x54,0x72,0x6b,(len>>>24)&255,(len>>>16)&255,(len>>>8)&255,len&255,...events]; return new Uint8Array([...header,...track]);
  }
  function pitch(frame,sr){ let rms=0; for(let i=0;i<frame.length;i++)rms+=frame[i]*frame[i]; rms=Math.sqrt(rms/frame.length); if(rms<0.012)return null; let best=-1,bestLag=0; const minLag=Math.floor(sr/1200),maxLag=Math.min(frame.length-2,Math.floor(sr/55)); for(let lag=minLag;lag<=maxLag;lag++){let sum=0,a=0,b=0;for(let i=0;i<frame.length-lag;i+=2){const x=frame[i],y=frame[i+lag];sum+=x*y;a+=x*x;b+=y*y;}const corr=sum/Math.sqrt((a*b)||1);if(corr>best){best=corr;bestLag=lag;}} if(best<0.62||!bestLag)return null; return sr/bestLag; }
  function toMidi(freq){return Math.max(0,Math.min(127,Math.round(69+12*Math.log2(freq/440))));}
  function mergeNotes(raw,hopSec){ const out=[]; for(const item of raw){ const prev=out[out.length-1]; if(prev&&prev.note===item.note&&item.start-(prev.start+prev.duration)<hopSec*1.6){prev.duration=(item.start+hopSec)-prev.start;prev.velocity=Math.round((prev.velocity+item.velocity)/2);}else out.push({...item,duration:hopSec});} return out.filter(n=>n.duration>=hopSec*1.5); }
  function draw(notes,total){const canvas=document.getElementById('sonara-midi-roll'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#090d13';ctx.fillRect(0,0,canvas.width,canvas.height);if(!notes.length)return;const min=Math.min(...notes.map(n=>n.note))-2,max=Math.max(...notes.map(n=>n.note))+2;ctx.fillStyle='#8b5cf6';notes.forEach(n=>{const x=n.start/Math.max(total,.1)*canvas.width,w=Math.max(2,n.duration/Math.max(total,.1)*canvas.width),y=canvas.height-((n.note-min)/Math.max(1,max-min))*canvas.height-5;ctx.fillRect(x,y,w,4);});}
  async function audioToMidi(){
    const info=document.getElementById('sonara-midi-info'); try{const url=localStorage.getItem(SOURCE_KEY)||document.querySelector('#sonara-ai-source-player')?.src||'';if(!url)throw new Error('Seleziona prima una sorgente audio.');info.textContent='Decodifica e trascrizione pitch in corso…';const res=await nativeFetch(url);if(!res.ok)throw new Error('Audio non leggibile.');const arr=await res.arrayBuffer();const ctx=new (window.AudioContext||window.webkitAudioContext)();const buf=await ctx.decodeAudioData(arr.slice(0));const sr=buf.sampleRate,ch=buf.numberOfChannels;const mono=new Float32Array(buf.length);for(let c=0;c<ch;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)mono[i]+=d[i]/ch;}const frameSize=2048,hop=1024,raw=[];for(let start=0;start+frameSize<mono.length;start+=hop){const f=pitch(mono.subarray(start,start+frameSize),sr);if(f){let energy=0;for(let i=start;i<start+frameSize;i+=8)energy+=Math.abs(mono[i]);const vel=Math.max(35,Math.min(120,Math.round(45+energy/(frameSize/8)*240)));raw.push({start:start/sr,note:toMidi(f),velocity:vel});}}const notes=mergeNotes(raw,hop/sr);if(!notes.length)throw new Error('Nessuna melodia monofonica rilevata. Prova con voce, basso o lead isolato.');const bpm=Math.max(40,Math.min(220,Number(localStorage.getItem('sonara.preferredBpm')||124)));const bytes=midiBytes(notes,bpm),blob=new Blob([bytes],{type:'audio/midi'}),file=new File([blob],'SONARA-Audio-to-MIDI.mid',{type:'audio/midi'});draw(notes,buf.duration);const root=document.querySelector('[data-sonara-studio-section="true"] .sonara-pro-studio');const inputs=root?Array.from(root.querySelectorAll("input[type='file']")):[];const input=inputs[2];if(input){const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));info.textContent=notes.length+' note rilevate · MIDI importato nella timeline Studio.';}else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;a.click();info.textContent=notes.length+' note rilevate · MIDI scaricato. Apri Studio per importarlo.';}await ctx.close();}catch(e){info.textContent=e&&e.message?e.message:String(e);}}
  waitPanel();
})();`;

async function inject(request, response) {
  if (request.method !== 'GET' || !response.ok) return response;
  const url = new URL(request.url);
  if (!['sonaraenterprise.com','www.sonaraenterprise.com'].includes(url.hostname)) return response;
  if (!clean(response.headers.get('content-type')).toLowerCase().includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('sonara-studio-intelligence-v1')) return new Response(html, response);
  const injection = `<style id="sonara-studio-intelligence-v1-style">${EXTRA_CSS}</style><script id="sonara-studio-intelligence-v1">${EXTRA_UI.replace(/<\/script/gi,'<\\/script')}</script>`;
  const next = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${injection}</body>`) : `${html}${injection}`;
  const headers = new Headers(response.headers); headers.delete('content-length'); headers.set('cache-control','no-store'); headers.set('x-sonara-studio-intelligence',VERSION);
  return new Response(next,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/studio/')) return new Response(null,{status:204,headers:cors(request)});
    if (url.pathname === '/api/studio/taste' && ['GET','POST'].includes(request.method)) return tasteEndpoint(request, env);
    if (url.pathname === '/api/studio/feedback' && request.method === 'POST') return feedbackEndpoint(request, env);

    const rewritten = await rewriteGenerateRequest(request, env);
    let response = await runtime.fetch(rewritten, env, ctx);
    if (response.ok && ['/api/health','/api/engine/ready','/api/molab/ready','/api/studio/capabilities'].includes(url.pathname)) {
      const type = clean(response.headers.get('content-type')).toLowerCase();
      if (type.includes('application/json')) {
        try {
          const data = await response.json();
          return json(request, {
            ...data,
            studioIntelligence: {
              version: VERSION,
              myTaste: true,
              durableTasteProfiles: true,
              preferenceAwareGeneration: true,
              browserAudioToMidi: true,
              pianoRollPreview: true,
              feedbackLearning: true,
              taxonomyStillAuthoritative: true
            }
          });
        } catch {}
      }
    }
    return inject(request, response);
  }
};
