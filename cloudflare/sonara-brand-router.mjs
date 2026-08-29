import webRuntime from './sonara-web-v15-router.mjs';
export { SonaraJobState } from './sonara-web-v15-router.mjs';

const BRAND_ICON_PATH = '/sonara-brand-icon.svg';
const BRAND_ICON = `${BRAND_ICON_PATH}?v=20260829-5`;
const BRAND_BOOT = '/sonara-brand-boot.svg?v=20260829-4';
const BRAND_VERSION = 'sonic-s-v5';
const SEO_TITLE = 'SONARA AI MUSIC PLATFORM';
const SEO_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const MUSIC_GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const BPM_MIN = 40;
const BPM_MAX = 220;

const PROMPT_STYLE_RULES = [
  { pattern: /\b(?:liquid\s+)?drum\s*(?:&|and)\s*bass\b|\bdnb\b/i, family: 'Electronic / Dance', genre: 'Drum & Bass', subgenre: 'Drum & Bass' },
  { pattern: /\bjungle\b/i, family: 'Electronic / Dance', genre: 'Drum & Bass', subgenre: 'Jungle' },
  { pattern: /\bhard\s*techno\b/i, family: 'Electronic / Dance', genre: 'Techno', subgenre: 'Hard Techno' },
  { pattern: /\bindustrial\s*techno\b/i, family: 'Electronic / Dance', genre: 'Techno', subgenre: 'Industrial Techno' },
  { pattern: /\bdetroit\s*techno\b/i, family: 'Electronic / Dance', genre: 'Techno', subgenre: 'Detroit Techno' },
  { pattern: /\bdub\s*techno\b/i, family: 'Electronic / Dance', genre: 'Techno', subgenre: 'Dub Techno' },
  { pattern: /\btechno\b/i, family: 'Electronic / Dance', genre: 'Techno', subgenre: 'Techno' },
  { pattern: /\btech\s*house\b/i, family: 'Electronic / Dance', genre: 'House', subgenre: 'Tech House' },
  { pattern: /\bdeep\s*house\b/i, family: 'Electronic / Dance', genre: 'House', subgenre: 'Deep House' },
  { pattern: /\bafro\s*house\b/i, family: 'Electronic / Dance', genre: 'House', subgenre: 'Afro House' },
  { pattern: /\bprogressive\s*house\b/i, family: 'Electronic / Dance', genre: 'House', subgenre: 'Progressive House' },
  { pattern: /\bacid\s*house\b/i, family: 'Electronic / Dance', genre: 'House', subgenre: 'Acid House' },
  { pattern: /\bhouse\b/i, family: 'Electronic / Dance', genre: 'House', subgenre: 'House' },
  { pattern: /\bpsy(?:chedelic)?\s*trance\b|\bgoa\s*trance\b/i, family: 'Electronic / Dance', genre: 'Trance', subgenre: 'Psytrance' },
  { pattern: /\btrance\b/i, family: 'Electronic / Dance', genre: 'Trance', subgenre: 'Trance' },
  { pattern: /\bdubstep\b/i, family: 'Electronic / Dance', genre: 'Bass Music', subgenre: 'Dubstep' },
  { pattern: /\bamapiano\b/i, family: 'Electronic / Dance', genre: 'Amapiano', subgenre: 'Amapiano' },
  { pattern: /\bboom\s*bap\b/i, family: 'Hip-Hop / Rap', genre: 'Hip-Hop', subgenre: 'Boom Bap' },
  { pattern: /\buk\s*drill\b|\bdrill\b/i, family: 'Hip-Hop / Rap', genre: 'Drill', subgenre: 'UK Drill' },
  { pattern: /\btrap\b/i, family: 'Hip-Hop / Rap', genre: 'Trap', subgenre: 'Trap' },
  { pattern: /\bhip[- ]?hop\b|\brap\b/i, family: 'Hip-Hop / Rap', genre: 'Hip-Hop', subgenre: 'Hip-Hop' },
  { pattern: /\bblack\s*metal\b/i, family: 'Rock / Metal', genre: 'Metal', subgenre: 'Black Metal' },
  { pattern: /\bdoom\s*metal\b/i, family: 'Rock / Metal', genre: 'Metal', subgenre: 'Doom Metal' },
  { pattern: /\bmetal\b/i, family: 'Rock / Metal', genre: 'Metal', subgenre: 'Metal' },
  { pattern: /\bpost[- ]?rock\b/i, family: 'Rock / Metal', genre: 'Rock', subgenre: 'Post-Rock' },
  { pattern: /\brock\b/i, family: 'Rock / Metal', genre: 'Rock', subgenre: 'Rock' },
  { pattern: /\bbebop\b/i, family: 'Jazz / Blues', genre: 'Jazz', subgenre: 'Bebop' },
  { pattern: /\bjazz\s*fusion\b/i, family: 'Jazz / Blues', genre: 'Jazz', subgenre: 'Jazz Fusion' },
  { pattern: /\bjazz\b/i, family: 'Jazz / Blues', genre: 'Jazz', subgenre: 'Jazz' },
  { pattern: /\breggae\b/i, family: 'Reggae / Caribbean', genre: 'Reggae', subgenre: 'Reggae' },
  { pattern: /\bafrobeats\b/i, family: 'African', genre: 'Afrobeats', subgenre: 'Afrobeats' },
  { pattern: /\bafrobeat\b/i, family: 'African', genre: 'Afrobeat', subgenre: 'Afrobeat' },
  { pattern: /\bambient\b/i, family: 'Ambient / Experimental', genre: 'Ambient', subgenre: 'Ambient' },
  { pattern: /\bpop\b/i, family: 'Pop', genre: 'Pop', subgenre: 'Pop' }
];

function parsePromptBpm(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/\b(?:at|a|@|tempo\s*[:=]?\s*)?(\d{2,3})\s*bpm\b/i)
    || text.match(/\bbpm\s*[:=]?\s*(\d{2,3})\b/i);
  if (!match) return null;
  const valueNumber = Number(match[1]);
  if (!Number.isFinite(valueNumber)) return null;
  return Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, valueNumber)));
}

function detectPromptStyle(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return PROMPT_STYLE_RULES.find(rule => rule.pattern.test(text)) || null;
}

function tempoMotionInstruction(bpm) {
  if (bpm >= 160) {
    return `FULL-TIME FAST MOTION LOCK: the music must be audibly fast at ${bpm} BPM, not merely tagged with that metadata. Do not render an ${Math.round(bpm / 2)} BPM half-time feel. Keep the primary drum grid, bass rhythm, hats/percussion, phrase pacing and transitions moving at the perceptual speed of ${bpm} BPM, with genre-authentic eighth-note and sixteenth-note activity.`;
  }
  if (bpm >= 130) {
    return `UPTEMPO MOTION LOCK: preserve a clearly energetic full-time pulse at ${bpm} BPM. Do not slow the perceived groove through half-time reinterpretation unless the creator explicitly requests half-time.`;
  }
  return `TEMPO MOTION LOCK: the audible groove and phrase pacing must correspond to exactly ${bpm} BPM for the entire rendered track.`;
}

async function enforceCreatorMusicIntent(request) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || !MUSIC_GENERATE_PATHS.has(url.pathname)) return request;
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) return request;

  try {
    const body = await request.clone().json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return request;

    const creatorPrompt = String(body.rawPrompt || body.creatorPrompt || body.creator_prompt || body.musicPrompt || '').trim();
    const visiblePrompt = String(body.prompt || '').trim();
    const promptSource = creatorPrompt || visiblePrompt;
    const explicitBpm = parsePromptBpm(creatorPrompt) ?? parsePromptBpm(visiblePrompt);
    const explicitStyle = detectPromptStyle(promptSource);
    let next = { ...body };

    if (explicitStyle) {
      next = {
        ...next,
        genreFamily: explicitStyle.family,
        genre: explicitStyle.genre,
        subgenre: explicitStyle.subgenre,
        promptGenreAuthoritative: true,
        sonaraCreatorStylePriority: true,
        sonaraEdgeStyleLock: 'creator-prompt-v3'
      };
    }

    if (explicitBpm !== null) {
      const lock = [
        `SONARA HARD TEMPO LOCK: exactly ${explicitBpm} BPM.`,
        `CREATOR BPM PRIORITY: ${explicitBpm} BPM was explicitly written by the creator and overrides every UI default, automatic genre tempo, metadata fallback or previously inferred BPM.`,
        tempoMotionInstruction(explicitBpm),
        `Ignore any conflicting BPM number that appears later in inherited or fallback production text; ${explicitBpm} BPM is the only authoritative render tempo.`
      ].join(' ');
      next = {
        ...next,
        bpm: explicitBpm,
        requestedBpm: explicitBpm,
        targetBpm: explicitBpm,
        preferredBpm: explicitBpm,
        promptBpmAuthoritative: true,
        bpmLock: true,
        sonaraEdgeTempoLock: 'creator-prompt-v3',
        prompt: `${lock}\n\n${visiblePrompt}`.slice(0, 12000)
      };
    }

    if (next === body || (!explicitStyle && explicitBpm === null)) return request;
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    if (explicitBpm !== null) headers.set('x-sonara-bpm-lock', `creator-prompt-${explicitBpm}`);
    if (explicitStyle) headers.set('x-sonara-style-lock', `creator-prompt-${explicitStyle.subgenre}`);
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

const BRAND_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="title desc">
  <title id="title">SONARA</title>
  <desc id="desc">SONARA sonic S logo</desc>
  <defs>
    <linearGradient id="sonaraBlue" x1="30" y1="30" x2="225" y2="225" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0b4dff"/>
      <stop offset="0.42" stop-color="#009dff"/>
      <stop offset="0.76" stop-color="#12e6ff"/>
      <stop offset="1" stop-color="#3df6ff"/>
    </linearGradient>
    <linearGradient id="sonaraDeep" x1="220" y1="55" x2="40" y2="205" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3cf5ff"/>
      <stop offset="0.28" stop-color="#0aa8ff"/>
      <stop offset="0.62" stop-color="#0755ff"/>
      <stop offset="1" stop-color="#07298f"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="256" height="256" rx="48" fill="#02050b"/>
  <circle cx="128" cy="128" r="104" fill="#071731" opacity=".28"/>
  <g filter="url(#glow)" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M42 82C61 35 118 22 169 36c24 7 43 20 55 36-30-17-63-23-94-16-31 7-50 27-47 49 2 16 14 28 34 35" stroke="url(#sonaraBlue)" stroke-width="28"/>
    <path d="M139 124c24 7 39 21 41 39 2 20-11 38-34 48-32 15-74 7-104-17 31 13 64 13 86 0 20-12 28-31 21-47-4-9-11-17-21-23" stroke="url(#sonaraDeep)" stroke-width="28"/>
  </g>
  <g filter="url(#glow)" stroke="url(#sonaraBlue)" stroke-width="6" stroke-linecap="round">
    <line x1="76" y1="125" x2="76" y2="133"/><line x1="88" y1="118" x2="88" y2="140"/>
    <line x1="100" y1="108" x2="100" y2="150"/><line x1="112" y1="96" x2="112" y2="162"/>
    <line x1="124" y1="78" x2="124" y2="180"/><line x1="136" y1="92" x2="136" y2="166"/>
    <line x1="148" y1="105" x2="148" y2="153"/><line x1="160" y1="114" x2="160" y2="144"/>
    <line x1="172" y1="121" x2="172" y2="137"/><line x1="184" y1="126" x2="184" y2="132"/>
  </g>
</svg>`;

const HEADER_BRAND_SCRIPT = `<script id="sonara-header-brand-v5-safe">(()=>{const icon=${JSON.stringify(BRAND_ICON)};const isBrandIcon=src=>{try{return new URL(src||'',location.origin).pathname==='/sonara-brand-icon.svg'}catch{return String(src||'').includes('/sonara-brand-icon.svg')}};let scheduled=false;const apply=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;document.querySelectorAll('header').forEach(header=>{const label=[...header.querySelectorAll('h1,h2,span,div')].find(el=>el.children.length===0&&(el.textContent||'').trim().toUpperCase()==='SONARA ENTERPRISE');if(!label)return;const group=label.parentElement;const row=group&&group.parentElement?group.parentElement:group;let img=(row&&row.querySelector('img'))||header.querySelector('img[src*="sonara-ai-icon"],img[alt*="SONARA"],img[data-sonara-brand-logo="true"]');if(!img&&row){img=document.createElement('img');row.insertBefore(img,row.firstChild);}if(img){if(!isBrandIcon(img.getAttribute('src')))img.setAttribute('src',icon);if(img.getAttribute('alt')!=='SONARA Enterprise')img.setAttribute('alt','SONARA Enterprise');img.setAttribute('width','44');img.setAttribute('height','44');img.setAttribute('data-sonara-brand-logo','true');img.setAttribute('loading','eager');img.style.width='44px';img.style.height='44px';img.style.objectFit='contain';img.style.borderRadius='12px';img.style.flex='0 0 auto';}});});};const releaseBoot=()=>document.querySelectorAll('[aria-label="SONARA boot animation"],[data-sonara-boot="active"]').forEach(el=>{el.style.pointerEvents='none';el.style.opacity='0';setTimeout(()=>el.remove(),120)});const start=()=>{apply();new MutationObserver(apply).observe(document.body||document.documentElement,{childList:true,subtree:true});[100,350,800,1500,3000].forEach(ms=>setTimeout(apply,ms));setTimeout(releaseBoot,2700);};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();})();</script>`;

const PROMPT_TEMPO_SYNC_SCRIPT = `<script id="sonara-prompt-tempo-sync-v3">(()=>{const parse=t=>{t=String(t||'');const m=t.match(/\\b(?:at|a|@|tempo\\s*[:=]?\\s*)?(\\d{2,3})\\s*bpm\\b/i)||t.match(/\\bbpm\\s*[:=]?\\s*(\\d{2,3})\\b/i);if(!m)return null;const n=Math.round(Number(m[1]));return Number.isFinite(n)&&n>=40&&n<=220?n:null};const apply=()=>{const p=document.getElementById('sonara-prompt');if(!(p instanceof HTMLTextAreaElement))return;const bpm=parse(p.value);if(!bpm)return;const s=p.closest('section');const i=s&&s.querySelector('input[aria-label="BPM preferiti"]');if(!(i instanceof HTMLInputElement))return;if(Number(i.value)!==bpm){const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(set)set.call(i,String(bpm));else i.value=String(bpm)}i.dataset.sonaraPromptBpm=String(bpm);i.dataset.sonaraPromptBpmAuthoritative='true';};const schedule=()=>[0,140,280,520].forEach(ms=>setTimeout(apply,ms));document.addEventListener('input',e=>{if(e.target&&e.target.id==='sonara-prompt')schedule()},true);window.addEventListener('sonara:bpm-mode',schedule);new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();})();</script>`;

function applySeoHeaders(headers) {
  headers.delete('x-robots-tag');
  headers.set('x-robots-tag', SEO_ROBOTS);
  headers.set('x-sonara-seo-title', 'sonara-ai-music-platform-v1');
}

function withBrandHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-brand', BRAND_VERSION);
  headers.set('x-sonara-header-brand', 'enterprise-logo-v5');
  headers.set('x-sonara-boot-safety', 'loop-guard-v1');
  applySeoHeaders(headers);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function brandHtml(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return withBrandHeaders(response);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-brand', BRAND_VERSION);
  headers.set('x-sonara-header-brand', 'enterprise-logo-v5');
  headers.set('x-sonara-boot-safety', 'loop-guard-v1');
  applySeoHeaders(headers);
  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(SEO_TITLE); } })
    .on('meta[name="robots"]', { element(el) { el.setAttribute('content', SEO_ROBOTS); } })
    .on('meta[property="og:site_name"]', { element(el) { el.setAttribute('content', SEO_TITLE); } })
    .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', SEO_TITLE); } })
    .on('meta[name="twitter:title"]', { element(el) { el.setAttribute('content', SEO_TITLE); } })
    .on('link[rel="icon"]', { element(el) { el.remove(); } })
    .on('link[rel="shortcut icon"]', { element(el) { el.remove(); } })
    .on('link[rel="apple-touch-icon"]', { element(el) { el.remove(); } })
    .on('meta[property="og:image"]', { element(el) { el.remove(); } })
    .on('head', {
      element(el) {
        el.append(
          `<meta name="googlebot" content="${SEO_ROBOTS}">` +
          `<link rel="icon" type="image/svg+xml" sizes="any" href="${BRAND_ICON}">` +
          `<link rel="shortcut icon" type="image/svg+xml" href="${BRAND_ICON}">` +
          `<link rel="apple-touch-icon" href="${BRAND_ICON}">` +
          `<meta property="og:image" content="https://sonaraenterprise.com${BRAND_BOOT}">` +
          `<meta name="x-sonara-header-brand" content="enterprise-logo-v5">` +
          HEADER_BRAND_SCRIPT + PROMPT_TEMPO_SYNC_SCRIPT,
          { html: true }
        );
      }
    })
    .transform(safe);
}

function brandIconResponse(request) {
  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: {
        'content-type': 'image/svg+xml; charset=UTF-8',
        'cache-control': 'public, max-age=86400',
        'x-sonara-brand': BRAND_VERSION
      }
    });
  }
  return new Response(BRAND_ICON_SVG, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=UTF-8',
      'cache-control': 'public, max-age=86400',
      'x-sonara-brand': BRAND_VERSION
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const publicHost = url.hostname === 'sonaraenterprise.com' || url.hostname === 'www.sonaraenterprise.com';

    if (publicHost && url.pathname === BRAND_ICON_PATH) return brandIconResponse(request);

    if (publicHost && (url.pathname === '/favicon.ico' || url.pathname === '/apple-touch-icon.png' || url.pathname === '/sonara-ai-icon.png')) {
      const iconUrl = new URL(BRAND_ICON, url.origin).toString();
      return Response.redirect(iconUrl, 302);
    }

    const musicRequest = await enforceCreatorMusicIntent(request);
    const response = await webRuntime.fetch(musicRequest, env, ctx);
    if (!publicHost) return response;

    if (request.method === 'GET') return brandHtml(response);
    if (request.method === 'HEAD') return withBrandHeaders(response);
    return response;
  }
};
