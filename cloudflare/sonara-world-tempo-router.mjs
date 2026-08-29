import brandRuntime from './sonara-brand-router.mjs';
import {
  resolveProfessionalTempoProfile,
  describeTempoExecution
} from '../src/musicTempoIntelligence.ts';

export { SonaraJobState } from './sonara-brand-router.mjs';

const WORLD_TEMPO_VERSION = 'sonara-world-tempo-v1';
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const PROFILE_PATH = '/api/tempo-profile';
const BPM_MIN = 40;
const BPM_MAX = 220;

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function validBpm(value) {
  const bpm = Number(value);
  if (!Number.isFinite(bpm) || bpm < BPM_MIN || bpm > BPM_MAX) return null;
  return Math.round(bpm);
}

function firstBpm(...values) {
  for (const value of values) {
    const bpm = validBpm(value);
    if (bpm !== null) return bpm;
  }
  return null;
}

function parsePromptBpm(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/\b(?:at|a|@|tempo\s*[:=]?\s*)?(\d{2,3})\s*bpm\b/i)
    || text.match(/\bbpm\s*[:=]?\s*(\d{2,3})\b/i);
  return match ? validBpm(match[1]) : null;
}

function readTaxonomyContext(body = {}) {
  return {
    family: String(body.sonaraSelectedFamily || body.genreFamily || body.family || body.musicFamily || 'Electronic / Dance'),
    genre: String(body.sonaraSelectedGenre || body.genre || body.musicGenre || 'House'),
    subgenre: String(body.sonaraSelectedSubgenre || body.subgenre || body.style || body.musicStyle || body.genre || 'House'),
    mood: String(body.sonaraSelectedMood || body.mood || body.atmosphere || 'Authentic'),
    prompt: String(body.rawPrompt || body.creatorPrompt || body.creator_prompt || body.musicPrompt || body.prompt || '')
  };
}

function resolveProfile(context) {
  const primary = resolveProfessionalTempoProfile(context);
  if (primary.source !== 'family') return primary;

  // The source taxonomy contains several future professional genres as subgenre labels.
  // Re-resolving the subgenre as a genre lets those labels use a dedicated genre BPM
  // instead of falling all the way back to the family average.
  if (context.subgenre && normalize(context.subgenre) !== normalize(context.genre)) {
    const derived = resolveProfessionalTempoProfile({
      ...context,
      genre: context.subgenre,
      subgenre: context.subgenre
    });
    if (derived.source !== 'family') return derived;
  }
  return primary;
}

function resolveMode(body, request) {
  const headerMode = String(request.headers.get('x-sonara-bpm-mode') || '').toLowerCase();
  const bodyMode = String(body.sonaraBpmMode || body.bpmMode || body.tempoMode || '').toLowerCase();
  if (bodyMode === 'auto' || headerMode === 'auto') return 'auto';
  if (bodyMode === 'manual' || headerMode === 'manual') return 'manual';
  return 'unspecified';
}

function tempoDecision(body, request) {
  const context = readTaxonomyContext(body);
  const profile = resolveProfile(context);
  const explicitPromptBpm = parsePromptBpm(context.prompt);
  const mode = resolveMode(body, request);
  const incomingBpm = firstBpm(
    body.requestedBpm,
    body.requested_bpm,
    body.targetBpm,
    body.target_bpm,
    body.preferredBpm,
    body.preferred_bpm,
    body.bpm,
    body.tempo
  );

  let bpm;
  let authority;
  if (explicitPromptBpm !== null) {
    bpm = explicitPromptBpm;
    authority = 'creator-prompt';
  } else if (mode === 'auto') {
    bpm = profile.idealBpm;
    authority = 'professional-auto-taxonomy';
  } else if (incomingBpm !== null) {
    bpm = incomingBpm;
    authority = mode === 'manual' ? 'creator-manual' : 'incoming-explicit-value';
  } else {
    bpm = profile.idealBpm;
    authority = 'professional-taxonomy-fallback';
  }

  return { context, profile, bpm, mode, authority, explicitPromptBpm };
}

function professionalTempoLock(decision) {
  const { profile, bpm, authority } = decision;
  return [
    `SONARA PROFESSIONAL WORLD TEMPO TAXONOMY ${WORLD_TEMPO_VERSION}.`,
    `Musical hierarchy: ${profile.family} > ${profile.genre} > ${profile.subgenre}.`,
    `Canonical tempo range for this musical identity: ${profile.minBpm}-${profile.maxBpm} BPM; canonical reference ${profile.idealBpm} BPM.`,
    `AUTHORITATIVE RENDER BPM: exactly ${bpm} BPM. Authority source: ${authority}.`,
    describeTempoExecution(profile, bpm),
    'Drums, bass, percussion, note subdivision, phrase pacing, fills, transitions and arrangement density must make the selected BPM audible, not merely store it as metadata.',
    'Never replace the creator BPM with a generic parent-genre default. Manual BPM and BPM explicitly written in the creator prompt are inviolable.'
  ].join(' ');
}

async function rewriteGenerationRequest(request) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || !GENERATE_PATHS.has(url.pathname)) return request;
  const type = String(request.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('application/json')) return request;

  try {
    const body = await request.clone().json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return request;
    const decision = tempoDecision(body, request);
    const lock = professionalTempoLock(decision);
    const existingPrompt = String(body.prompt || '').trim();
    const next = {
      ...body,
      bpm: decision.bpm,
      requestedBpm: decision.bpm,
      targetBpm: decision.bpm,
      preferredBpm: decision.bpm,
      bpmLock: true,
      promptBpmAuthoritative: decision.authority === 'creator-prompt',
      sonaraBpmAuthority: decision.authority,
      sonaraBpmMode: decision.mode,
      sonaraProfessionalTempoTaxonomy: WORLD_TEMPO_VERSION,
      sonaraTempoFamily: decision.profile.family,
      sonaraTempoGenre: decision.profile.genre,
      sonaraTempoSubgenre: decision.profile.subgenre,
      sonaraCanonicalBpmMin: decision.profile.minBpm,
      sonaraCanonicalBpmMax: decision.profile.maxBpm,
      sonaraCanonicalBpmIdeal: decision.profile.idealBpm,
      sonaraTempoClass: decision.profile.energy,
      sonaraTempoFeel: decision.profile.feel,
      sonaraTempoRhythmicDensity: decision.profile.rhythmicDensity,
      sonaraPerceptualTempoLock: true,
      prompt: `${lock}\n\n${existingPrompt}`.slice(0, 12000)
    };

    const headers = new Headers(request.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    headers.set('x-sonara-world-tempo', WORLD_TEMPO_VERSION);
    headers.set('x-sonara-bpm-lock', `exact-${decision.bpm}`);
    headers.set('x-sonara-bpm-authority', decision.authority);
    headers.set('x-sonara-tempo-class', decision.profile.energy);
    return new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify(next),
      redirect: request.redirect
    });
  } catch {
    return request;
  }
}

function profileResponse(request) {
  const url = new URL(request.url);
  const context = {
    family: url.searchParams.get('family') || 'Electronic / Dance',
    genre: url.searchParams.get('genre') || 'House',
    subgenre: url.searchParams.get('subgenre') || url.searchParams.get('genre') || 'House',
    mood: url.searchParams.get('mood') || 'Authentic',
    prompt: url.searchParams.get('prompt') || ''
  };
  const profile = resolveProfile(context);
  return new Response(JSON.stringify({
    version: WORLD_TEMPO_VERSION,
    bpm: profile.idealBpm,
    family: profile.family,
    genre: profile.genre,
    subgenre: profile.subgenre,
    minBpm: profile.minBpm,
    maxBpm: profile.maxBpm,
    idealBpm: profile.idealBpm,
    energy: profile.energy,
    feel: profile.feel,
    rhythmicDensity: profile.rhythmicDensity,
    source: profile.source,
    explicitPromptBpm: profile.source === 'explicit-prompt'
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-sonara-tempo-taxonomy': WORLD_TEMPO_VERSION
    }
  });
}

const AUTO_RUNTIME_SCRIPT = `<script id="sonara-world-tempo-v1">(()=>{
if(window.__sonaraWorldTempoV1)return;window.__sonaraWorldTempoV1=true;
const ENDPOINT='/api/tempo-profile';
const prompt=()=>document.getElementById('sonara-prompt');
const section=()=>prompt()?.closest('section')||null;
const bpmInput=()=>section()?.querySelector('input[aria-label="BPM preferiti"]')||null;
const selects=()=>section()?[...section().querySelectorAll('select')]:[];
const mode=()=>{const s=section(),b=bpmInput();return String(b?.dataset?.sonaraBpmMode||s?.dataset?.sonaraBpmMode||'manual').toLowerCase()==='auto'?'auto':'manual'};
const ctx=()=>{const a=selects();return{family:a[0]?.value||'Electronic / Dance',genre:a[1]?.value||'House',subgenre:a[2]?.value||a[1]?.value||'House',mood:a[3]?.value||'Authentic',prompt:String(prompt()?.value||'')}};
const profileUrl=c=>{const u=new URL(ENDPOINT,location.origin);Object.entries(c).forEach(([k,v])=>u.searchParams.set(k,String(v||'')));return u};
const silentValue=(el,value)=>{if(!el)return;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(el,String(value));else el.value=String(value)};
let timer=0,seq=0;
const getProfile=async c=>{const r=await nativeFetch(profileUrl(c),{cache:'no-store',headers:{'x-sonara-tempo-probe':'world-v1'}});if(!r.ok)throw new Error('tempo-profile-'+r.status);return r.json()};
const sync=async()=>{if(mode()!=='auto')return;const id=++seq,c=ctx();try{const p=await getProfile(c);if(id!==seq||mode()!=='auto')return;const b=bpmInput();silentValue(b,p.bpm);if(b){b.dataset.sonaraAutoBpm=String(p.bpm);b.dataset.sonaraAutoBpmReason='World taxonomy: '+p.family+' > '+p.genre+' > '+p.subgenre+' · '+p.minBpm+'-'+p.maxBpm+' BPM';b.dataset.sonaraWorldTempo='true'}window.dispatchEvent(new CustomEvent('sonara:world-tempo-profile',{detail:p}))}catch{}};
const schedule=()=>{clearTimeout(timer);timer=setTimeout(sync,260)};
const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{const req=input instanceof Request?input:new Request(input,init);let u;try{u=new URL(req.url,location.origin)}catch{return nativeFetch(input,init)}if(req.method.toUpperCase()==='POST'&&(u.pathname==='/api/billing/generate'||u.pathname==='/api/engine/generate')&&String(req.headers.get('content-type')||'').toLowerCase().includes('application/json')){try{const body=await req.clone().json(),c=ctx(),m=mode(),headers=new Headers(req.headers);body.sonaraBpmMode=m;body.sonaraSelectedFamily=c.family;body.sonaraSelectedGenre=c.genre;body.sonaraSelectedSubgenre=c.subgenre;body.sonaraSelectedMood=c.mood;headers.set('x-sonara-bpm-mode',m);headers.set('x-sonara-world-tempo','sonara-world-tempo-v1');if(m==='auto'){const p=await getProfile(c);body.bpm=p.bpm;body.requestedBpm=p.bpm;body.targetBpm=p.bpm;body.preferredBpm=p.bpm;body.sonaraAutoTempoProfile=p;silentValue(bpmInput(),p.bpm)}headers.delete('content-length');headers.set('content-type','application/json');return nativeFetch(new Request(req.url,{method:req.method,headers,body:JSON.stringify(body),credentials:req.credentials,cache:'no-store',redirect:req.redirect}))}catch(e){console.warn('[SONARA][World Tempo]',e instanceof Error?e.message:String(e))}}return nativeFetch(input,init)};
document.addEventListener('input',e=>{if(e.target===prompt()||e.target instanceof HTMLSelectElement)schedule()},true);
document.addEventListener('change',e=>{if(e.target===prompt()||e.target instanceof HTMLSelectElement||e.target===bpmInput())schedule()},true);
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
[300,800,1600].forEach(ms=>setTimeout(schedule,ms));
})();</script>`;

function withTempoHeader(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-tempo-taxonomy', WORLD_TEMPO_VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function injectAutoRuntime(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return withTempoHeader(response);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-tempo-taxonomy', WORLD_TEMPO_VERSION);
  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter().on('head', {
    element(el) { el.append(AUTO_RUNTIME_SCRIPT, { html: true }); }
  }).transform(safe);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === PROFILE_PATH) {
      return request.method === 'HEAD' ? withTempoHeader(new Response(null, { status: 200 })) : profileResponse(request);
    }

    const rewritten = await rewriteGenerationRequest(request);
    const response = await brandRuntime.fetch(rewritten, env, ctx);
    const publicHost = url.hostname === 'sonaraenterprise.com' || url.hostname === 'www.sonaraenterprise.com';
    if (!publicHost) return withTempoHeader(response);
    if (request.method === 'GET') return injectAutoRuntime(response);
    return withTempoHeader(response);
  }
};

export { tempoDecision, professionalTempoLock, resolveProfile, WORLD_TEMPO_VERSION };
