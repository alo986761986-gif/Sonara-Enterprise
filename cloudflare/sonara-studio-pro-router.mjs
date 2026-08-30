import runtime from './sonara-studio-autopilot-router.mjs';
import { analyzeAudioCandidate, rankQualityReports } from './sonara-audio-quality-engine.mjs';
import { STUDIO_PRO_CSS, STUDIO_PRO_UI } from './sonara-studio-pro-ui.mjs';
export { SonaraJobState } from './sonara-studio-autopilot-router.mjs';

const VERSION = 'sonara-studio-pro-v1';
const API_ORIGIN = 'https://api.sonaraenterprise.com';
const PROFILE_HEADER = 'x-sonara-profile-id';
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const ALLOWED_ORIGINS = new Set(['https://sonaraenterprise.com','https://www.sonaraenterprise.com',API_ORIGIN]);
const ALLOWED_AUDIO_HOSTS = new Set(['sonaraenterprise.com','www.sonaraenterprise.com','api.sonaraenterprise.com','molab.sonaraenterprise.com']);

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
    'Access-Control-Expose-Headers': 'X-Sonara-Studio-Pro',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type':'application/json; charset=UTF-8',
      'cache-control':'private, no-store',
      'x-sonara-studio-pro':VERSION,
      ...cors(request)
    }
  });
}

function allowed(request) {
  const origin = clean(request.headers.get('Origin'));
  return ALLOWED_ORIGINS.has(origin) || (!origin && request.method === 'GET');
}

function profileId(request) {
  const value = clean(request.headers.get(PROFILE_HEADER));
  return /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : '';
}

function profileStub(env, id) {
  if (!id || !env?.SONARA_JOB_STATE) return null;
  try { return env.SONARA_JOB_STATE.get(env.SONARA_JOB_STATE.idFromName(`identity-${id}`)); }
  catch { return null; }
}

async function readIdentityState(env, id) {
  const stub = profileStub(env, id);
  if (!stub) return { persistent:true, voiceProfiles:[], personaProfiles:[], activeVoiceId:null, activePersonaId:null };
  try {
    const response = await stub.fetch('https://sonara.internal/state');
    if (!response.ok) return { persistent:true, voiceProfiles:[], personaProfiles:[], activeVoiceId:null, activePersonaId:null };
    const data = await response.json();
    return {
      persistent:true,
      voiceProfiles:Array.isArray(data.voiceProfiles)?data.voiceProfiles:[],
      personaProfiles:Array.isArray(data.personaProfiles)?data.personaProfiles:[],
      activeVoiceId:data.activeVoiceId||null,
      activePersonaId:data.activePersonaId||null,
      updatedAt:data.updatedAt||0
    };
  } catch {
    return { persistent:true, voiceProfiles:[], personaProfiles:[], activeVoiceId:null, activePersonaId:null };
  }
}

async function writeIdentityState(env, id, state) {
  const stub = profileStub(env, id);
  if (!stub) return false;
  const response = await stub.fetch('https://sonara.internal/state', {
    method:'PUT',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ ...state, persistent:true, updatedAt:Date.now() })
  });
  return response.ok;
}

function sanitizeProfile(input, type, existingId = '') {
  const id = existingId || `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  return {
    id,
    type,
    name:clean(input.name || (type === 'voice' ? 'Voice Profile' : 'Persona')).slice(0,80),
    instruction:clean(input.instruction).slice(0,3000),
    referenceAudioUrl:clean(input.referenceAudioUrl).slice(0,1200),
    strength:Math.round(clamp(input.strength, type === 'voice' ? 82 : 72, 0, 100)),
    updatedAt:Date.now(),
    createdAt:Number(input.createdAt || Date.now())
  };
}

async function identitiesEndpoint(request, env) {
  if (!allowed(request)) return json(request,{error:'Origin non autorizzata.'},403);
  const id = profileId(request);
  if (!id) return json(request,{error:'Profilo SONARA mancante.'},400);
  const state = await readIdentityState(env,id);
  if (request.method === 'GET') return json(request,{status:'success',...state});

  let body={};
  try { body=await request.json(); } catch { return json(request,{error:'JSON non valido.'},400); }
  const type = clean(body.type).toLowerCase();
  if (!['voice','persona'].includes(type)) return json(request,{error:'Tipo profilo non valido.'},400);
  const listKey = type === 'voice' ? 'voiceProfiles' : 'personaProfiles';
  const activeKey = type === 'voice' ? 'activeVoiceId' : 'activePersonaId';

  if ('activateId' in body) {
    const requested = clean(body.activateId);
    const exists = !requested || state[listKey].some(item => item.id === requested);
    if (!exists) return json(request,{error:'Profilo non trovato.'},404);
    const next={...state,[activeKey]:requested||null};
    await writeIdentityState(env,id,next);
    return json(request,{status:'success',...next});
  }

  if ('deleteId' in body) {
    const deleteId=clean(body.deleteId);
    const nextList=state[listKey].filter(item=>item.id!==deleteId);
    const next={...state,[listKey]:nextList,[activeKey]:state[activeKey]===deleteId?null:state[activeKey]};
    await writeIdentityState(env,id,next);
    return json(request,{status:'success',...next});
  }

  if (!clean(body.instruction)) return json(request,{error:'Descrizione profilo obbligatoria.'},400);
  const requestedId=clean(body.id);
  const current=requestedId ? state[listKey].find(item=>item.id===requestedId) : null;
  const profile=sanitizeProfile({...current,...body},type,current?.id||'');
  const nextList=current ? state[listKey].map(item=>item.id===current.id?profile:item) : [...state[listKey].slice(-11),profile];
  const next={...state,[listKey]:nextList,[activeKey]:body.setActive===false?state[activeKey]:profile.id};
  await writeIdentityState(env,id,next);
  return json(request,{status:'success',profile,...next});
}

function validAudioUrl(value) {
  try {
    const url=new URL(clean(value));
    return /^https:$/.test(url.protocol) && ALLOWED_AUDIO_HOSTS.has(url.hostname) ? url.toString() : '';
  } catch { return ''; }
}

async function validateBatchEndpoint(request) {
  if (!allowed(request)) return json(request,{error:'Origin non autorizzata.'},403);
  let body={};
  try { body=await request.json(); } catch { return json(request,{error:'JSON non valido.'},400); }
  const urls=(Array.isArray(body.audioUrls)?body.audioUrls:[]).map(validAudioUrl).filter(Boolean).slice(0,12);
  if (!urls.length) return json(request,{error:'Nessun URL audio SONARA valido.'},400);
  const bpm=Number(body.bpm);
  const key=clean(body.key);
  const reports=await Promise.all(urls.map(async (audioUrl,index)=>{
    try {
      const report=await analyzeAudioCandidate(audioUrl,{bpm:Number.isFinite(bpm)?bpm:null,key});
      return {...report,index,audioUrl};
    } catch(error) {
      return {index,audioUrl,measuredFromRealWav:false,qualityScore:0,qualityGatePassed:false,error:error instanceof Error?error.message:String(error)};
    }
  }));
  const ranked=rankQualityReports(reports);
  const measured=reports.filter(item=>item.measuredFromRealWav===true);
  const passed=reports.filter(item=>item.qualityGatePassed===true).length;
  const averageScore=reports.length ? Math.round((reports.reduce((sum,item)=>sum+Number(item.qualityScore||0),0)/reports.length)*10)/10 : 0;
  return json(request,{
    status:'success',
    summary:{
      total:reports.length,
      measured:measured.length,
      passed,
      failed:reports.length-passed,
      passRate:Math.round((passed/reports.length)*1000)/10,
      averageScore,
      bestScore:ranked[0]?.qualityScore??0,
      worstScore:ranked.at(-1)?.qualityScore??0
    },
    reports:ranked
  });
}

async function rewriteGenerateRequest(request, env) {
  if (request.method !== 'POST') return request;
  const url=new URL(request.url);
  if (!GENERATE_PATHS.has(url.pathname)) return request;
  if (!clean(request.headers.get('content-type')).toLowerCase().includes('application/json')) return request;
  const id=profileId(request);
  if (!id) return request;
  let body;
  try { body=await request.clone().json(); } catch { return request; }
  const state=await readIdentityState(env,id);
  const voice=state.voiceProfiles.find(item=>item.id===state.activeVoiceId)||null;
  const persona=state.personaProfiles.find(item=>item.id===state.activePersonaId)||null;
  if (!voice && !persona) return request;
  const additions=[];
  if (voice) additions.push(`SONARA ACTIVE VOICE PROFILE (${voice.name}, strength ${voice.strength}/100): ${voice.instruction}. Maintain one stable singer identity, formants, range, articulation, pronunciation, breath behavior and vibrato across the entire song.`);
  if (persona) additions.push(`SONARA ACTIVE PERSONA (${persona.name}, strength ${persona.strength}/100): ${persona.instruction}. Apply only inside the selected Family > Genre > Subgenre > Atmosphere; never override explicit taxonomy or BPM.`);
  const creator=clean(body.sonaraOriginalCreatorBrief||body.rawPrompt||body.creatorPrompt||body.creator_prompt||body.musicPrompt);
  const nextCreator=[creator,...additions].filter(Boolean).join('\n').slice(0,5000);
  const next={
    ...body,
    sonaraOriginalCreatorBrief:nextCreator,
    rawPrompt:nextCreator,
    sonaraActiveVoiceProfile:voice?{id:voice.id,name:voice.name,strength:voice.strength,referenceAudioUrl:voice.referenceAudioUrl||null}:null,
    sonaraActivePersonaProfile:persona?{id:persona.id,name:persona.name,strength:persona.strength,referenceAudioUrl:persona.referenceAudioUrl||null}:null,
    sonaraStudioProVersion:VERSION
  };
  const headers=new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type','application/json');
  headers.set('x-sonara-studio-pro','v1');
  return new Request(request.url,{method:request.method,headers,body:JSON.stringify(next),credentials:request.credentials,redirect:request.redirect,cache:'no-store'});
}

async function inject(request,response) {
  if (request.method!=='GET'||!response.ok) return response;
  const url=new URL(request.url);
  if (!['sonaraenterprise.com','www.sonaraenterprise.com'].includes(url.hostname)) return response;
  if (!clean(response.headers.get('content-type')).toLowerCase().includes('text/html')) return response;
  const html=await response.text();
  if (html.includes('sonara-studio-pro-v1')) return new Response(html,response);
  const injection=`<style id="sonara-studio-pro-v1-style">${STUDIO_PRO_CSS}</style><script id="sonara-studio-pro-v1">${STUDIO_PRO_UI.replace(/<\/script/gi,'<\\/script')}</script>`;
  const next=/<\/body>/i.test(html)?html.replace(/<\/body>/i,`${injection}</body>`):`${html}${injection}`;
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control','no-store');
  headers.set('x-sonara-studio-pro',VERSION);
  return new Response(next,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request, env, ctx) {
    const url=new URL(request.url);
    if (request.method==='OPTIONS'&&url.pathname.startsWith('/api/studio/')) return new Response(null,{status:204,headers:cors(request)});
    if (url.pathname==='/api/studio/identities'&&['GET','POST'].includes(request.method)) return identitiesEndpoint(request,env);
    if (url.pathname==='/api/studio/validate-batch'&&request.method==='POST') return validateBatchEndpoint(request);

    const rewritten=await rewriteGenerateRequest(request,env);
    let response=await runtime.fetch(rewritten,env,ctx);
    if (response.ok&&['/api/health','/api/engine/ready','/api/molab/ready','/api/studio/capabilities'].includes(url.pathname)) {
      const type=clean(response.headers.get('content-type')).toLowerCase();
      if (type.includes('application/json')) {
        try {
          const data=await response.json();
          const headers=new Headers(response.headers);
          headers.delete('content-length');
          headers.set('content-type','application/json; charset=UTF-8');
          headers.set('x-sonara-studio-pro',VERSION);
          return new Response(JSON.stringify({
            ...data,
            studioPro:{
              version:VERSION,
              editablePianoRoll:true,
              polyphonicHeuristicTranscription:true,
              midiNoteEditing:true,
              midiQuantize:true,
              midiHumanize:true,
              midiExport:true,
              midiStudioImport:true,
              persistentVoiceProfiles:true,
              persistentPersonaProfiles:true,
              batchQualityValidation:true
            }
          }),{status:response.status,statusText:response.statusText,headers});
        } catch {}
      }
    }
    return inject(request,response);
  }
};
