import sonaraEngine from './sonara-engine-v9-dual-fast.mjs';

const VERCEL_WEB_ORIGIN = 'https://sonara-enterprise-sonaramusicai86-2765s-projects.vercel.app';
const WEB_HOSTS = new Set(['sonaraenterprise.com', 'www.sonaraenterprise.com']);
const ENGINE_PATHS = [
  '/api/music/job/',
  '/api/modal/audio',
  '/api/engine/'
];

const HOTFIX_SCRIPT = String.raw`<script id="sonara-neapolitan-urban-hotfix" data-sonara-taxonomy-hotfix="neapolitan-urban-v1">
(() => {
  if (window.__SONARA_NEAPOLITAN_URBAN_HOTFIX__) return;
  window.__SONARA_NEAPOLITAN_URBAN_HOTFIX__ = true;

  const FAMILY = 'Neomelodica Napoletana';
  const GENRE = 'Neomelodica Napoletana Moderna';
  const REQUIRED = ['Rap Napoletano', 'Hip-Hop Napoletano', 'Trap Napoletano'];
  let remembered = '';
  let scheduled = false;

  function optionValues(select) {
    return Array.from(select.options || []).map(option => option.value);
  }

  function locateControls() {
    const selects = Array.from(document.querySelectorAll('select'));
    const familyIndex = selects.findIndex(select => optionValues(select).includes(FAMILY));
    if (familyIndex < 0) return null;

    const family = selects[familyIndex];
    const genreIndex = selects.findIndex((select, index) => index > familyIndex && optionValues(select).includes(GENRE));
    if (genreIndex < 0) return null;

    const genre = selects[genreIndex];
    const subgenre = selects.slice(genreIndex + 1).find(select => {
      const values = optionValues(select);
      return values.includes('Neomelodico Moderno') || values.includes('Neomelodico Trap') || REQUIRED.some(value => values.includes(value));
    });
    if (!subgenre) return null;
    return { family, genre, subgenre };
  }

  function patch() {
    scheduled = false;
    const controls = locateControls();
    if (!controls) return;
    const { family, genre, subgenre } = controls;
    if (family.value !== FAMILY || genre.value !== GENRE) {
      remembered = '';
      return;
    }

    for (const label of REQUIRED) {
      if (!optionValues(subgenre).includes(label)) {
        const option = document.createElement('option');
        option.value = label;
        option.textContent = label;
        option.dataset.sonaraHotfix = 'neapolitan-urban-v1';
        const trapOption = Array.from(subgenre.options).find(item => item.value === 'Neomelodico Trap');
        if (trapOption?.nextSibling) subgenre.insertBefore(option, trapOption.nextSibling);
        else subgenre.appendChild(option);
      }
    }

    if (remembered && REQUIRED.includes(remembered) && subgenre.value !== remembered) {
      subgenre.value = remembered;
    }
  }

  function schedulePatch() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(patch);
  }

  document.addEventListener('change', event => {
    const target = event.target;
    if (target instanceof HTMLSelectElement) {
      if (REQUIRED.includes(target.value)) remembered = target.value;
      else {
        const controls = locateControls();
        if (!controls || target === controls.family || target === controls.genre) remembered = '';
      }
      schedulePatch();
    }
  }, true);

  const observer = new MutationObserver(schedulePatch);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  patch();
})();
</script>`;

function isEngineRequest(url) {
  return ENGINE_PATHS.some(prefix => url.pathname.startsWith(prefix));
}

async function proxyWeb(request) {
  const incoming = new URL(request.url);
  const upstream = new URL(incoming.pathname + incoming.search, VERCEL_WEB_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.set('x-sonara-edge-hotfix', 'neapolitan-urban-v1');

  const init = {
    method: request.method,
    headers,
    redirect: 'manual'
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

  const response = await fetch(upstream.toString(), init);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('x-sonara-taxonomy-hotfix', 'neapolitan-urban-v1');

  const contentType = response.headers.get('content-type') || '';
  if (request.method === 'GET' && contentType.includes('text/html')) {
    const html = await response.text();
    const patched = html.includes('sonara-neapolitan-urban-hotfix')
      ? html
      : html.replace(/<\/body>/i, `${HOTFIX_SCRIPT}</body>`);
    responseHeaders.delete('content-length');
    responseHeaders.set('cache-control', 'no-store, max-age=0');
    return new Response(patched, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (WEB_HOSTS.has(url.hostname) && !isEngineRequest(url)) {
      return proxyWeb(request);
    }
    return sonaraEngine.fetch(request, env, ctx);
  }
};
