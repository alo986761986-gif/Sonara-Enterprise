// SONARA Remix Pro V3 visual overlay - ONLY UI, never the audio/generation backend.
// Build job supplies the actual compiled, versioned React app/CSS constants.
import { REMIX_V3_JS, REMIX_V3_CSS } from './sonara-remix-pro-v3-built.mjs';

const RELEASE='sonara-remix-pro-v3-visual-20261109';
const TOKEN='__sonara_remix_v3_visual_asset';
const EXACT_ROUTES=new Set(['/','/studio','/remix']);
const HOSTS=new Set(['sonaraenterprise.com','www.sonaraenterprise.com']);
const MAX_JS_BYTES=4_000_000;
const MAX_CSS_BYTES=150_000;
if (REMIX_V3_JS.length<15000 || REMIX_V3_JS.length>MAX_JS_BYTES ||
    REMIX_V3_CSS.length<1000 || REMIX_V3_CSS.length>MAX_CSS_BYTES ||
    !REMIX_V3_JS.includes('sonara-remix-pro-v3') ||
    !REMIX_V3_CSS.includes('sonara-pro-v3__hero')) {
  throw new Error('The verified React Remix Pro V3 assets are missing or invalid');
}
const asset=(body,type)=>new Response(body,{
  headers:{
    'Content-Type':type,
    'Cache-Control':'no-store, max-age=0',
    'X-Content-Type-Options':'nosniff',
    'X-Sonara-Remix-Visual':RELEASE,
    'Cross-Origin-Resource-Policy':'same-origin'
  }
});
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    // For workers.dev staging, forward only the legitimate homepage request to
    // the primary production Worker through the private Service binding.
    const staging=url.hostname.endsWith('.workers.dev');
    const validHost=staging||HOSTS.has(url.hostname);
    if(!validHost) return new Response('Unexpected host',{status:404});
    if(!env.SONARA_MAIN?.fetch) return new Response('Upstream unavailable',{status:503});
    if(!EXACT_ROUTES.has(url.pathname)) return new Response('Not found',{status:404});
    if(url.pathname==='/' && request.method==='GET' && url.searchParams.get(TOKEN)==='js')
      return asset(REMIX_V3_JS,'text/javascript; charset=UTF-8');
    if(url.pathname==='/' && request.method==='GET' && url.searchParams.get(TOKEN)==='css')
      return asset(REMIX_V3_CSS,'text/css; charset=UTF-8');
    const original=staging?new URL(url.pathname+url.search,'https://sonaraenterprise.com'):url;
    const upstreamRequest=staging?new Request(original.toString(),request):request;
    // Never handle auth, upload, billing, private R2 or creation endpoints here.
    const response=await env.SONARA_MAIN.fetch(upstreamRequest);
    if(request.method!=='GET' || !response.ok ||
       !String(response.headers.get('content-type')||'').toLowerCase().includes('text/html')) return response;
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('cache-control','no-store, max-age=0');
    headers.set('x-sonara-remix-visual',RELEASE);
    // This is the only HTML mutation. No old frontend bundle replacement and
    // no duplicate React app at root; the isolated V3 app mounts only when the
    // user opens the original Remix Pro tab.
    const safe=new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    return new HTMLRewriter()
      .on('head',{element(el){
        el.append('<link id="sonara-remix-v3-visual-css" rel="stylesheet" href="/?'+TOKEN+'=css">', {html:true});
        el.append('<script id="sonara-remix-v3-visual-js" type="module" src="/?'+TOKEN+'=js"></script>', {html:true});
      }})
      .transform(safe);
  }
};
