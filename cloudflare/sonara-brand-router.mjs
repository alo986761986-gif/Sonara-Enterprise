import webRuntime from './sonara-web-v15-router.mjs';
export { SonaraJobState } from './sonara-web-v15-router.mjs';

const BRAND_ICON_PATH = '/sonara-brand-icon.svg';
const BRAND_ICON = `${BRAND_ICON_PATH}?v=20260829-5`;
const BRAND_BOOT = '/sonara-brand-boot.svg?v=20260829-4';
const BRAND_VERSION = 'sonic-s-v5';
const SEO_TITLE = 'SONARA AI MUSIC PLATFORM';
const SEO_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

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
          HEADER_BRAND_SCRIPT,
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

    const response = await webRuntime.fetch(request, env, ctx);
    if (!publicHost) return response;

    if (request.method === 'GET') return brandHtml(response);
    if (request.method === 'HEAD') return withBrandHeaders(response);
    return response;
  }
};
