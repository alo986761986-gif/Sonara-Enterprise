import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-real-music-v3-edge.mjs';
import { withGatewayVerifier } from './sonara-gateway-verifier.mjs';
import { handleNativeOpenModelCreator } from './sonara-native-open-model-entry.mjs';

export { SonaraJobState, SonaraAuthStore };

// ACE-Step-only compatibility for browsers with old cached Creator assets.
// A new build already contains just ACE-Step; the edge hides legacy model
// choices and resets only the obsolete model preference on older clients.
const ACE_ONLY_HEAD = `<style id="sonara-ace-only-edge">
[data-sonara-model="heartmula-3b"],[data-sonara-model="stable-audio-3-medium"]{display:none!important}
</style><script id="sonara-ace-only-edge-boot">(()=>{try{
localStorage.setItem('sonara.generation.model.v1','ace-step');
}catch(_){}})();</script>`;

function ensureAceOnlyUi(request, response) {
  if (request.method !== 'GET' || response.status !== 200) return response;
  const url = new URL(request.url);
  if (!['sonaraenterprise.com','www.sonaraenterprise.com'].includes(url.hostname)) return response;
  if (!String(response.headers.get('content-type')||'').toLowerCase().includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.set('cache-control','no-store, max-age=0');
  headers.delete('content-length');
  return new HTMLRewriter().on('head',{
    element(element){ element.prepend(ACE_ONLY_HEAD,{html:true}); }
  }).transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));
}

const nativeOpenModelEntry = {
  async fetch(request, env, ctx) {
    const reply = await handleNativeOpenModelCreator(request, env, ctx);
    if (reply) return reply;
    return ensureAceOnlyUi(request,await runtime.fetch(request,env,ctx));
  }
};

export default withGatewayVerifier(nativeOpenModelEntry);
