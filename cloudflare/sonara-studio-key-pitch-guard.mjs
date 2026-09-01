import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-quality-ultra-stability-guard.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-studio-key-pitch-1';
const APPLY_PATH = '/api/studio/pitch-key';
const CAPABILITIES_PATH = '/api/studio/pitch-key/capabilities';
const ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  'https://api.sonaraenterprise.com'
]);

const clean = value => String(value ?? '').trim();
const clamp = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const snapHalf = value => Math.round(Number(value || 0) * 2) / 2;
const signed = value => `${value > 0 ? '+' : ''}${value}`;

function cors(request) {
  const origin = clean(request.headers.get('Origin'));
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Cache-Control,Pragma,X-Sonara-Profile-Id',
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
      'x-sonara-studio-key-pitch': VERSION,
      ...cors(request)
    }
  });
}

function validKey(value) {
  const text = clean(value);
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').slice(0, 32);
  return /^[A-G](?:#|b)?(?:\s+(?:major|minor|maj|min))?$/i.test(normalized) ? normalized : '';
}

function buildIssues(body) {
  const targetKey = validKey(body.targetKey || body.key || body.keySignature);
  const trackPitch = snapHalf(clamp(body.trackPitchSemitones, 0, -12, 12));
  const vocalPitch = snapHalf(clamp(body.vocalPitchSemitones, 0, -12, 12));
  const formantShift = snapHalf(clamp(body.vocalFormantSemitones ?? body.formantShift, 0, -6, 6));
  const preserveTempo = body.preserveTempo !== false;
  const issues = [];

  if (targetKey) {
    issues.push(`Correct all harmonic tuning and out-of-key notes to the exact target key ${targetKey}. Preserve the existing melody, chord functions, arrangement, phrasing and song identity; transpose only where needed for a musically correct ${targetKey} result.`);
  }
  if (trackPitch !== 0) {
    issues.push(`Apply an exact full-program pitch shift of ${signed(trackPitch)} semitones to the musical material${preserveTempo ? ' while preserving the original BPM, bar grid, transient timing and duration' : ''}. Do not introduce time-stretch wobble, metallic artifacts or phase smearing.`);
  }
  if (vocalPitch !== 0) {
    issues.push(`Shift the lead vocal pitch by exactly ${signed(vocalPitch)} semitones independently from the instrumental backing. Preserve lyrics, timing, phrasing, vibrato character, singer identity and natural consonants; do not detune the instrumental arrangement.`);
  }
  if (formantShift !== 0) {
    issues.push(`Shift vocal formants/timbre by exactly ${signed(formantShift)} semitones independently from pitch. Preserve musical pitch, lyrics, timing, breath detail and intelligibility; avoid chipmunk, robotic, metallic or phasey vocal artifacts.`);
  }
  issues.push('Preserve stereo image, loudness balance, dynamics, ambience and the complete arrangement unless a requested key/pitch correction requires a minimal musical adjustment.');

  return { targetKey, trackPitch, vocalPitch, formantShift, preserveTempo, issues };
}

async function handleApply(request, env, ctx) {
  let body = {};
  try { body = await request.json(); }
  catch { return json(request, { error: 'SONARA Studio Pitch & Key richiede un body JSON valido.' }, 400); }

  const sourceAudioUrl = clean(body.sourceAudioUrl || body.audioUrl || body.srcAudioUrl);
  if (!sourceAudioUrl) return json(request, { error: 'Seleziona prima un brano sorgente in Studio Pro.' }, 400);

  const built = buildIssues(body);
  if (!built.targetKey && built.trackPitch === 0 && built.vocalPitch === 0 && built.formantShift === 0) {
    return json(request, { error: 'Imposta una tonalita target oppure una variazione di pitch/formanti.' }, 400);
  }

  const nextBody = {
    ...body,
    sourceAudioUrl,
    key: built.targetKey || clean(body.key || body.keySignature),
    bpm: clamp(body.bpm ?? body.requestedBpm, 124, 40, 220),
    issues: built.issues,
    preserveStrength: clamp(body.preserveStrength, 0.94, 0.72, 0.99),
    sonaraStudioPitchKey: true,
    sonaraStudioPitchKeyVersion: VERSION,
    targetKey: built.targetKey || null,
    trackPitchSemitones: built.trackPitch,
    vocalPitchSemitones: built.vocalPitch,
    vocalFormantSemitones: built.formantShift,
    preserveTempo: built.preserveTempo
  };

  const url = new URL(request.url);
  url.pathname = '/api/studio/repair';
  url.search = '';
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-studio-pitch-key', VERSION);

  const response = await runtime.fetch(new Request(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(nextBody)
  }), env, ctx);

  const outHeaders = new Headers(response.headers);
  outHeaders.set('x-sonara-studio-pitch-key', VERSION);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders
  });
}

const UI_CSS = String.raw`
#sonara-studio-pitch-key-pro{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07)}
#sonara-studio-pitch-key-pro .spk-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;font:900 10px/1 system-ui;letter-spacing:.12em;text-transform:uppercase;color:#c4b5fd}
#sonara-studio-pitch-key-pro .spk-badge{border:1px solid rgba(139,92,246,.28);background:linear-gradient(135deg,rgba(139,92,246,.15),rgba(59,130,246,.12));color:#ddd6fe;border-radius:999px;padding:4px 7px;font:900 8px/1 system-ui}
#sonara-studio-pitch-key-pro .spk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
#sonara-studio-pitch-key-pro .spk-card{border:1px solid rgba(255,255,255,.08);background:linear-gradient(145deg,rgba(76,29,149,.10),rgba(30,64,175,.07));border-radius:11px;padding:10px}
#sonara-studio-pitch-key-pro label{display:block;font:800 8px/1.2 system-ui;letter-spacing:.08em;text-transform:uppercase;color:#7f8da3;margin-bottom:6px}
#sonara-studio-pitch-key-pro select{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.10);background:#090d15;color:#f8fafc;border-radius:9px;padding:8px 9px;font:800 10px/1.2 system-ui;outline:none}
#sonara-studio-pitch-key-pro input[type=range]{width:100%;accent-color:#8b5cf6}
#sonara-studio-pitch-key-pro .spk-value{float:right;color:#e9d5ff;font:900 9px/1 system-ui}
#sonara-studio-pitch-key-pro .spk-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:9px}
#sonara-studio-pitch-key-pro button{border:1px solid rgba(255,255,255,.10);border-radius:9px;padding:9px 10px;font:900 9px/1 system-ui;cursor:pointer}
#sonara-studio-pitch-key-pro .spk-apply{background:linear-gradient(90deg,#7c3aed,#6366f1,#2563eb);border-color:rgba(196,181,253,.35);color:#fff}
#sonara-studio-pitch-key-pro .spk-reset{background:#0b1017;color:#94a3b8}
#sonara-studio-pitch-key-pro button:disabled{opacity:.45;cursor:not-allowed}
#sonara-studio-pitch-key-pro .spk-check{display:flex;align-items:center;gap:7px;margin-top:9px;font:800 9px/1.3 system-ui;color:#94a3b8;text-transform:none;letter-spacing:0}
#sonara-studio-pitch-key-pro .spk-hint,#sonara-studio-pitch-key-pro .spk-status{font:700 9px/1.5 system-ui;color:#718096;margin-top:8px}
#sonara-studio-pitch-key-pro .spk-status{color:#c4b5fd}
#sonara-studio-pitch-key-pro .spk-result{display:none;margin-top:10px;border:1px solid rgba(96,165,250,.18);background:rgba(37,99,235,.07);border-radius:10px;padding:9px}
#sonara-studio-pitch-key-pro .spk-result.show{display:block}
#sonara-studio-pitch-key-pro audio{width:100%;height:34px;margin-top:7px}
@media(max-width:720px){#sonara-studio-pitch-key-pro .spk-grid{grid-template-columns:1fr}}
`;

const UI_JS = String.raw`(() => {
  if (window.__sonaraStudioPitchKeyV1) return;
  window.__sonaraStudioPitchKeyV1 = true;
  const API = 'https://api.sonaraenterprise.com';
  const SOURCE_KEY = 'sonara.studio.sourceAudioUrl';
  const q = (selector, root) => (root || document).querySelector(selector);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const signed = n => (n > 0 ? '+' : '') + n;
  const status = text => { const el=q('#spk-status'); if(el) el.textContent=text; };
  const sourceUrl = () => (q('#sonara-ai-source-url')?.value || localStorage.getItem(SOURCE_KEY) || q('#sonara-ai-source-player')?.src || '').trim();
  const currentBpm = () => clamp(Number(localStorage.getItem('sonara.preferredBpm') || 124), 40, 220);
  const allKeys = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const keyOptions = ['<option value="">Mantieni / nessuna correzione Key</option>'].concat(allKeys.flatMap(k => ['<option value="'+k+' major">'+k+' Major</option>','<option value="'+k+' minor">'+k+' Minor</option>'])).join('');

  function mount(){
    if(q('#sonara-studio-pitch-key-pro')) return;
    const anchor = q('#sonara-pro-midi-box') || q('#sonara-intelligence-box') || q("#sonara-studio-ai-panel .sonara-ai-body");
    if(!anchor){setTimeout(mount,500);return;}
    const box=document.createElement('div');
    box.id='sonara-studio-pitch-key-pro';
    box.innerHTML='<div class="spk-title"><span>Pitch & Key Pro</span><span class="spk-badge">KEY · VOICE · PITCH</span></div>' +
      '<div class="spk-grid">' +
        '<div class="spk-card"><label>Tonalita target del brano</label><select id="spk-key">' + keyOptions + '</select><div class="spk-hint">Corregge note fuori tonalita e armonia verso la Key scelta senza riscrivere il brano.</div></div>' +
        '<div class="spk-card"><label>Pitch brano <span id="spk-track-v" class="spk-value">0 st</span></label><input id="spk-track" type="range" min="-12" max="12" step="0.5" value="0"><div class="spk-hint">Pitch globale professionale. Con Preserva BPM non altera la velocita.</div></div>' +
        '<div class="spk-card"><label>Pitch voce <span id="spk-vocal-v" class="spk-value">0 st</span></label><input id="spk-vocal" type="range" min="-12" max="12" step="0.5" value="0"><div class="spk-hint">Sposta la voce mantenendo lyrics, timing, vibrato e identita del cantante.</div></div>' +
        '<div class="spk-card"><label>Formanti / timbro voce <span id="spk-formant-v" class="spk-value">0 st</span></label><input id="spk-formant" type="range" min="-6" max="6" step="0.5" value="0"><div class="spk-hint">Modifica il colore della voce indipendentemente dalla nota: piu grave/scuro o piu chiaro.</div></div>' +
      '</div>' +
      '<label class="spk-check"><input id="spk-tempo" type="checkbox" checked> Preserva BPM, durata, bar grid e arrangiamento</label>' +
      '<div class="spk-actions"><button id="spk-apply" class="spk-apply">APPLICA CORREZIONE PROFESSIONALE</button><button id="spk-reset" class="spk-reset">RESET</button></div>' +
      '<div id="spk-status" class="spk-status">Pronto. Seleziona una Key o modifica Pitch / Voce.</div>' +
      '<div id="spk-result" class="spk-result"><div style="font:900 9px/1 system-ui;color:#bfdbfe">RISULTATO CORRETTO</div><audio id="spk-audio" controls preload="metadata"></audio><button id="spk-use" class="spk-reset" style="width:100%;margin-top:7px">USA COME SORGENTE STUDIO</button></div>';
    if(anchor.id==='sonara-pro-midi-box') anchor.insertAdjacentElement('afterend',box); else anchor.appendChild(box);
    ['track','vocal','formant'].forEach(id=>q('#spk-'+id).addEventListener('input',e=>{q('#spk-'+id+'-v').textContent=signed(Number(e.target.value))+' st';}));
    q('#spk-reset').addEventListener('click',reset);
    q('#spk-apply').addEventListener('click',apply);
    q('#spk-use').addEventListener('click',useResult);
  }

  function reset(){
    q('#spk-key').value='';
    ['track','vocal','formant'].forEach(id=>{q('#spk-'+id).value='0';q('#spk-'+id+'-v').textContent='0 st';});
    q('#spk-tempo').checked=true;
    status('Reset completato.');
  }

  function resultUrl(data){
    const seen=new Set();
    const walk=value=>{
      if(!value || typeof value==='number' || typeof value==='boolean') return '';
      if(typeof value==='string') return /^https?:\/\//i.test(value) && /(?:audio|molab|\.wav|\.mp3|\.flac|\.ogg)/i.test(value) ? value : '';
      if(Array.isArray(value)){for(const item of value){const hit=walk(item);if(hit)return hit;}return '';}
      if(typeof value==='object'){
        for(const key of ['recommendedAudioUrl','audioUrl','downloadUrl','url','audio','output','outputs','result','results','items']){
          if(key in value && !seen.has(value[key])){seen.add(value[key]);const hit=walk(value[key]);if(hit)return hit;}
        }
        for(const item of Object.values(value)){const hit=walk(item);if(hit)return hit;}
      }
      return '';
    };
    return walk(data);
  }

  async function api(path, init){
    const r=await fetch(API+path,init||{}); const text=await r.text(); let data={};
    try{data=text?JSON.parse(text):{}}catch{}
    if(!r.ok) throw new Error(data.error||data.message||('HTTP '+r.status));
    return data;
  }

  async function apply(){
    const src=sourceUrl();
    if(!src){status('Seleziona prima un brano sorgente in Studio Pro.');return;}
    const body={
      sourceAudioUrl:src,
      bpm:currentBpm(),
      targetKey:q('#spk-key').value,
      trackPitchSemitones:Number(q('#spk-track').value),
      vocalPitchSemitones:Number(q('#spk-vocal').value),
      vocalFormantSemitones:Number(q('#spk-formant').value),
      preserveTempo:q('#spk-tempo').checked,
      preserveStrength:0.94
    };
    if(!body.targetKey && body.trackPitchSemitones===0 && body.vocalPitchSemitones===0 && body.vocalFormantSemitones===0){status('Imposta almeno una modifica.');return;}
    const button=q('#spk-apply'); button.disabled=true; q('#spk-result').classList.remove('show');
    try{
      status('Invio a SONARA Studio Pro...');
      const submitted=await api('/api/studio/pitch-key',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const jobId=submitted.jobId || submitted.id || submitted.job?.id;
      const pollPath=submitted.pollUrl ? submitted.pollUrl.replace(/^https:\/\/api\.sonaraenterprise\.com/,'') : (jobId ? '/api/studio/job/'+encodeURIComponent(jobId) : '');
      if(!pollPath) throw new Error('Studio Pro non ha restituito il job di elaborazione.');
      for(let attempt=1;attempt<=180;attempt++){
        await sleep(attempt===1?900:2200);
        const data=await api(pollPath+(pollPath.includes('?')?'&':'?')+'pitchKey='+Date.now()+'-'+attempt,{credentials:'include',cache:'no-store'});
        const root=data.job||data.result||data;
        const state=String(root.status||data.status||'PROCESSING').toUpperCase();
        const progress=Number(root.progress??data.progress??0);
        status('Elaborazione '+(Number.isFinite(progress)?Math.round(progress)+'%':'')+' · '+state);
        if(['FAILED','ERROR','CANCELLED'].includes(state)) throw new Error(root.error||data.error||'Correzione Pitch & Key non riuscita.');
        if(['COMPLETED','SUCCESS','SUCCEEDED','DONE'].includes(state)){
          const url=resultUrl(root)||resultUrl(data);
          if(!url) throw new Error('Elaborazione completata ma audio risultante non trovato.');
          q('#spk-audio').src=url;
          q('#spk-result').dataset.url=url;
          q('#spk-result').classList.add('show');
          status('Completato: tonalita / pitch corretti. Originale preservato finche non scegli Usa come sorgente.');
          return;
        }
      }
      throw new Error('Tempo massimo di polling raggiunto. Il brano originale resta invariato.');
    }catch(e){status(e && e.message ? e.message : String(e));}
    finally{button.disabled=false;}
  }

  function useResult(){
    const url=q('#spk-result').dataset.url||q('#spk-audio').src;
    if(!url){status('Nessun risultato disponibile.');return;}
    localStorage.setItem(SOURCE_KEY,url);
    const input=q('#sonara-ai-source-url'); if(input){input.value=url;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
    const player=q('#sonara-ai-source-player'); if(player){player.src=url;player.load();}
    window.dispatchEvent(new CustomEvent('sonara:studio-source-changed',{detail:{audioUrl:url,source:'pitch-key-pro'}}));
    status('Risultato impostato come nuova sorgente Studio Pro.');
  }

  mount();
  const observer=new MutationObserver(()=>mount());
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();`;

async function injectStudioUi(response) {
  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('sonara-studio-pitch-key-v1')) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const injection = `<style id="sonara-studio-pitch-key-v1-style">${UI_CSS}</style><script id="sonara-studio-pitch-key-v1">${UI_JS.replace(/<\/script/gi, '<\\/script')}</script>`;
  const next = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${injection}</body>`) : `${html}${injection}`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(next, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === CAPABILITIES_PATH && request.method === 'GET') {
      return json(request, {
        ok: true,
        version: VERSION,
        studioProPitchKey: true,
        targetKeyCorrection: true,
        fullTrackPitchSemitones: { min: -12, max: 12, step: 0.5 },
        vocalPitchSemitones: { min: -12, max: 12, step: 0.5 },
        vocalFormantSemitones: { min: -6, max: 6, step: 0.5 },
        preserveTempo: true,
        sourcePreservedUntilAccepted: true,
        engine: 'studio-repair'
      });
    }
    if (url.pathname === APPLY_PATH && request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    if (url.pathname === APPLY_PATH && request.method === 'POST') return handleApply(request, env, ctx);

    const response = await runtime.fetch(request, env, ctx);
    if (request.method !== 'GET' || response.status >= 400) return response;
    return injectStudioUi(response);
  }
};
