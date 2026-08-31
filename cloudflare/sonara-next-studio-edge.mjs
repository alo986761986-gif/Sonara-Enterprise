import worker from './sonara-ab-player-visibility-edge.mjs';
export { SonaraJobState } from './sonara-ab-player-visibility-edge.mjs';
import {
  QUALITY_DIRECTOR_VERSION,
  PROFESSIONAL_RELEASE_SCORE,
  analyzeProfessionalCandidate,
  summarizeProfessionalReports,
  upgradeQualityPayload
} from './sonara-quality-director-v2.mjs';

const VERSION = 'sonara-next-studio-edge-v1';
const JOB_PATH = /^\/api\/(?:music\/job|studio\/job)\//;
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const ALIASES = Object.freeze({
  '/api/studio/replace': '/api/studio/repaint',
  '/api/studio/inpaint': '/api/studio/repaint',
  '/api/studio/extend': '/api/studio/complete',
  '/api/studio/remix': '/api/studio/cover',
  '/api/studio/style-dna': '/api/studio/persona',
  '/api/studio/voice-dna': '/api/studio/voice',
  '/api/studio/audio-to-audio': '/api/studio/reference'
});

const clean = value => String(value ?? '').trim();
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;

function cors(request) {
  const origin = clean(request.headers.get('Origin'));
  const allowed = new Set(['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', 'https://api.sonaraenterprise.com']);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Studio,X-Sonara-Profile-Id',
    'Access-Control-Expose-Headers': 'X-Sonara-Next-Studio,X-Sonara-Quality-Director',
    Vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-next-studio': VERSION,
      'x-sonara-quality-director': QUALITY_DIRECTOR_VERSION,
      ...cors(request)
    }
  });
}

async function qualityV2(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return json(request, { error: 'JSON non valido.' }, 400); }

  const urls = (Array.isArray(body.audioUrls) ? body.audioUrls : [body.audioUrl]).map(clean).filter(Boolean).slice(0, 12);
  if (!urls.length) return json(request, { error: 'Nessun audio da analizzare.' }, 400);
  const requested = {
    bpm: numeric(body.bpm ?? body.requestedBpm),
    key: clean(body.key || body.key_scale),
    durationSec: numeric(body.durationSec ?? body.duration)
  };

  const reports = await Promise.all(urls.map(async (audioUrl, index) => {
    try {
      const report = await analyzeProfessionalCandidate(audioUrl, requested);
      return { ...report, index, audioUrl };
    } catch (error) {
      return {
        index,
        audioUrl,
        measuredFromRealWav: false,
        professionalScore: 0,
        professionalReleasePassed: false,
        professionalTier: 'reject',
        hardFailureReasons: ['analysis-error'],
        repairPlan: ['Run SONARA Quality Repair and analyze the resulting real WAV again.'],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }));
  const summary = summarizeProfessionalReports(reports, requested);
  return json(request, { status: 'success', sonaraQualityDirector: summary, reports: summary.reports });
}

async function aliasStudioRequest(request) {
  const url = new URL(request.url);
  const targetPath = ALIASES[url.pathname];
  if (!targetPath) return request;

  const nextUrl = new URL(request.url);
  nextUrl.pathname = targetPath;
  const headers = new Headers(request.headers);
  headers.set('x-sonara-next-studio', VERSION);
  headers.set('x-sonara-session-operation', url.pathname.split('/').pop() || 'studio');

  if (request.method !== 'POST') return new Request(nextUrl.toString(), request);
  const contentType = clean(headers.get('content-type')).toLowerCase();
  if (!contentType.includes('application/json')) {
    return new Request(nextUrl.toString(), {
      method: request.method,
      headers,
      body: await request.clone().arrayBuffer(),
      redirect: request.redirect
    });
  }

  try {
    const body = await request.clone().json();
    const operation = url.pathname.split('/').pop();
    const prompt = clean(body.prompt || body.instruction);
    const operationInstruction = {
      replace: 'Replace only the selected region; preserve everything outside it, singer identity, BPM, key, groove, loudness and arrangement continuity.',
      inpaint: 'Inpaint only the selected region seamlessly. Preserve the surrounding composition and make both boundaries inaudible.',
      extend: 'Extend the arrangement naturally from the source material. Reuse recognizable motifs, singer identity, harmonic language and chorus identity without copying a previous section verbatim.',
      remix: 'Create an alternate production while preserving musical coherence and the requested style locks.',
      'style-dna': 'Apply the supplied Style DNA consistently while keeping the selected SONARA taxonomy authoritative.',
      'voice-dna': 'Lock the supplied singer identity across the full result: timbre, formants, register, accent, pronunciation, breath and vibrato.',
      'audio-to-audio': 'Use the source/reference audio as musical guidance and create a coherent original continuation or transformation.'
    }[operation] || '';
    const nextBody = {
      ...body,
      prompt: [operationInstruction, prompt].filter(Boolean).join(' '),
      sonaraSessionOperation: operation,
      sonaraSessionsVersion: '2.0',
      sonaraLongContextMemory: true,
      sonaraIdentityContinuity: true,
      sonaraMotifContinuity: true
    };
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    return new Request(nextUrl.toString(), {
      method: request.method,
      headers,
      body: JSON.stringify(nextBody),
      credentials: request.credentials,
      cache: 'no-store',
      redirect: request.redirect
    });
  } catch {
    return new Request(nextUrl.toString(), request);
  }
}

async function rewriteGenerationRequest(request) {
  if (request.method !== 'POST') return request;
  const url = new URL(request.url);
  if (!GENERATE_PATHS.has(url.pathname)) return request;
  const contentType = clean(request.headers.get('content-type')).toLowerCase();
  if (!contentType.includes('application/json')) return request;
  try {
    const body = await request.clone().json();
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    headers.set('x-sonara-quality-director', QUALITY_DIRECTOR_VERSION);
    headers.set('x-sonara-long-context', 'v1');
    const next = {
      ...body,
      sonaraQualityDirector: QUALITY_DIRECTOR_VERSION,
      sonaraProfessionalReleaseScore: PROFESSIONAL_RELEASE_SCORE,
      sonaraAutomaticCandidateRanking: true,
      sonaraLongContextMemory: true,
      sonaraSectionIdentityLock: true,
      sonaraChorusIdentityLock: true,
      sonaraSingerIdentityContinuity: true,
      sonaraMotifContinuity: true,
      sonaraEndingIntegrity: true
    };
    return new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify(next),
      credentials: request.credentials,
      cache: 'no-store',
      redirect: request.redirect
    });
  } catch {
    return request;
  }
}

async function transformJson(response, transform) {
  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!response.ok || !type.includes('application/json')) return response;
  try {
    const data = await response.clone().json();
    const next = await transform(data);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json; charset=UTF-8');
    headers.set('x-sonara-next-studio', VERSION);
    headers.set('x-sonara-quality-director', QUALITY_DIRECTOR_VERSION);
    return new Response(JSON.stringify(next), { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

const UI = String.raw`(() => {
  if (window.__sonaraSessions20) return;
  window.__sonaraSessions20 = true;
  const API = 'https://api.sonaraenterprise.com';
  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => Array.from(root.querySelectorAll(selector));
  function status(text){ const box=q('#sonara-ai-status'); if(box){ box.classList.add('sonara-show'); box.textContent=text; } }
  function activateTab(name){ const tab=q("#sonara-studio-ai-panel [data-tab='"+name+"']"); if(tab instanceof HTMLElement) tab.click(); }
  function clickAction(action){ const button=q("#sonara-studio-ai-panel [data-action='"+action+"']"); if(button instanceof HTMLElement) button.click(); }
  function sourceUrl(){ return localStorage.getItem('sonara.studio.sourceAudioUrl') || q('#sonara-ai-source-player')?.src || ''; }
  function bpm(){ return Number(localStorage.getItem('sonara.preferredBpm') || 124); }
  async function quality(){
    const audioUrl=sourceUrl(); if(!audioUrl){status('Seleziona prima un audio SONARA.');return;}
    status('Quality 2.0: analisi professionale WAV in corso…');
    try{
      const response=await fetch(API+'/api/studio/quality-v2',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({audioUrl,bpm:bpm()})});
      const data=await response.json();
      const summary=data.sonaraQualityDirector||{};
      status('Quality 2.0 · score '+(summary.bestProfessionalScore ?? '—')+'/100 · '+(summary.bestTier || 'n/d')+' · release '+(summary.passed>0?'OK':'RIPARAZIONE CONSIGLIATA'));
    }catch(error){status(error?.message||String(error));}
  }
  function mount(){
    const pane=q("#sonara-studio-ai-panel [data-pane='edit']"); if(!pane){setTimeout(mount,700);return;} if(q('#sonara-sessions-20',pane))return;
    const box=document.createElement('div'); box.id='sonara-sessions-20'; box.style.cssText='margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07)';
    box.innerHTML="<div style='font:900 9px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;color:#8b9aad;margin-bottom:8px'>SONARA Sessions 2.0</div><div style='display:grid;grid-template-columns:repeat(3,1fr);gap:6px'><button class='sonara-ai-mini' data-s2='extend'>Extend</button><button class='sonara-ai-mini' data-s2='replace'>Replace</button><button class='sonara-ai-mini' data-s2='inpaint'>Inpaint</button><button class='sonara-ai-mini' data-s2='remix'>Remix</button><button class='sonara-ai-mini' data-s2='audio'>Audio→Audio</button><button class='sonara-ai-mini' data-s2='quality'>Quality 2.0</button></div><div class='sonara-ai-note'>Non distruttivo: usa gli stessi controlli Start/End, conserva BPM, identità e continuità musicale.</div>";
    pane.appendChild(box);
    qa('[data-s2]',box).forEach(button=>button.addEventListener('click',()=>{
      const action=button.getAttribute('data-s2');
      if(action==='extend') clickAction('complete');
      else if(action==='replace'||action==='inpaint') clickAction('repaint');
      else if(action==='remix'){activateTab('reference');setTimeout(()=>clickAction('cover'),0);}
      else if(action==='audio'){activateTab('reference');setTimeout(()=>clickAction('reference'),0);}
      else if(action==='quality') void quality();
    }));
  }
  mount();
  new MutationObserver(()=>mount()).observe(document.documentElement,{childList:true,subtree:true});
})();`;

async function injectUi(request, response) {
  if (request.method !== 'GET' || !response.ok) return response;
  const url = new URL(request.url);
  if (!['sonaraenterprise.com', 'www.sonaraenterprise.com'].includes(url.hostname)) return response;
  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('sonara-sessions-2-0')) return new Response(html, response);
  const injection = `<script id="sonara-sessions-2-0">${UI.replace(/<\/script/gi, '<\\/script')}</script>`;
  const next = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${injection}</body>`) : `${html}${injection}`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  headers.set('x-sonara-next-studio', VERSION);
  return new Response(next, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && (url.pathname === '/api/studio/quality-v2' || url.pathname.startsWith('/api/studio/'))) {
      return new Response(null, { status: 204, headers: cors(request) });
    }
    if (request.method === 'POST' && url.pathname === '/api/studio/quality-v2') return qualityV2(request);

    let routed = await aliasStudioRequest(request);
    routed = await rewriteGenerationRequest(routed);
    let response = await worker.fetch(routed, env, ctx);

    if (response.ok && (JOB_PATH.test(url.pathname) || GENERATE_PATHS.has(url.pathname))) {
      response = await transformJson(response, data => upgradeQualityPayload(data));
    }

    if (response.ok && ['/api/health', '/api/engine/ready', '/api/molab/ready', '/api/studio/capabilities'].includes(url.pathname)) {
      response = await transformJson(response, data => ({
        ...data,
        sonaraNextStudio: {
          version: VERSION,
          sessions: '2.0',
          qualityDirector: QUALITY_DIRECTOR_VERSION,
          professionalReleaseScore: PROFESSIONAL_RELEASE_SCORE,
          operations: ['extend','replace','inpaint','remix','audio-to-audio','style-dna','voice-dna','stems','regenerate-stem','complete','repair'],
          longContextMemory: true,
          chorusIdentityLock: true,
          singerIdentityContinuity: true,
          motifContinuity: true,
          automaticCandidateRanking: true,
          automaticRepairPlan: true
        }
      }));
    }

    return injectUi(request, response);
  }
};
