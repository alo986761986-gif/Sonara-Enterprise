import runtime from './sonara-studio-pro-router.mjs';
export { SonaraJobState } from './sonara-studio-pro-router.mjs';

const VERSION = 'sonara-musical-families-v1';
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);

export const MUSICAL_FAMILY_MAP = Object.freeze({
  'Electronic / Dance': 'Electronic Music',
  'Hip-Hop / Rap': 'Hip-Hop / Rap',
  'Pop': 'Pop',
  'Rock': 'Rock / Alternative / Punk',
  'Metal': 'Metal',
  'R&B / Soul / Funk': 'R&B / Soul / Funk',
  'Jazz': 'Jazz',
  'Blues': 'Blues',
  'Reggae / Jamaican': 'Reggae / Ska / Dancehall',
  'Latin America': 'Latin Music',
  'Africa': 'African Music',
  'Caribbean': 'Caribbean Music',
  'Middle East / North Africa': 'Middle Eastern / North African Music',
  'South Asia': 'South Asian Music',
  'East Asia': 'East Asian Music',
  'Southeast Asia': 'Southeast Asian Music',
  'Country / Americana': 'Country / Americana',
  'Folk / Traditional Europe': 'European Folk / Traditional Music',
  'Neomelodica Napoletana': 'Neapolitan Popular Music',
  'Classical / Art Music': 'Classical / Art Music',
  'Gospel / Spiritual': 'Sacred / Devotional Music',
  'Cinematic / Media': 'Soundtrack / Media Music',
  'Experimental / Avant-Garde': 'Experimental / Avant-Garde',
  'Easy Listening / Lounge': 'Easy Listening / Lounge',
  'Children / Novelty / Spoken': "Children's / Spoken / Novelty"
});

export const MUSICAL_FAMILIES = Object.entries(MUSICAL_FAMILY_MAP).map(([internalKey, name]) => ({
  internalKey,
  name,
  type: 'musical-family'
}));

const clean = value => String(value ?? '').trim();
const canonicalFamily = value => MUSICAL_FAMILY_MAP[clean(value)] || clean(value) || 'Music';

const FAMILY_UI = String.raw`(() => {
  if (window.__sonaraMusicalFamiliesV1) return;
  window.__sonaraMusicalFamiliesV1 = true;

  const MAP = ${JSON.stringify({
    'Electronic / Dance': 'Electronic Music',
    'Hip-Hop / Rap': 'Hip-Hop / Rap',
    'Pop': 'Pop',
    'Rock': 'Rock / Alternative / Punk',
    'Metal': 'Metal',
    'R&B / Soul / Funk': 'R&B / Soul / Funk',
    'Jazz': 'Jazz',
    'Blues': 'Blues',
    'Reggae / Jamaican': 'Reggae / Ska / Dancehall',
    'Latin America': 'Latin Music',
    'Africa': 'African Music',
    'Caribbean': 'Caribbean Music',
    'Middle East / North Africa': 'Middle Eastern / North African Music',
    'South Asia': 'South Asian Music',
    'East Asia': 'East Asian Music',
    'Southeast Asia': 'Southeast Asian Music',
    'Country / Americana': 'Country / Americana',
    'Folk / Traditional Europe': 'European Folk / Traditional Music',
    'Neomelodica Napoletana': 'Neapolitan Popular Music',
    'Classical / Art Music': 'Classical / Art Music',
    'Gospel / Spiritual': 'Sacred / Devotional Music',
    'Cinematic / Media': 'Soundtrack / Media Music',
    'Experimental / Avant-Garde': 'Experimental / Avant-Garde',
    'Easy Listening / Lounge': 'Easy Listening / Lounge',
    'Children / Novelty / Spoken': "Children's / Spoken / Novelty"
  })};

  const upstreamFetch = window.fetch.bind(window);
  const prompt = () => document.getElementById('sonara-prompt');
  const section = () => prompt()?.closest('section') || null;
  const familySelect = () => section()?.querySelector('select') || null;
  const canonical = value => MAP[String(value || '').trim()] || String(value || '').trim();

  function relabel() {
    const select = familySelect();
    if (!(select instanceof HTMLSelectElement)) return;
    Array.from(select.options).forEach(option => {
      const internal = String(option.value || option.textContent || '').trim();
      const label = canonical(internal);
      if (!label) return;
      option.textContent = label;
      option.label = label;
      option.dataset.sonaraFamilyInternalKey = internal;
      option.dataset.sonaraMusicalFamily = label;
    });
    select.dataset.sonaraMusicalFamilyTaxonomy = 'v1';
    select.setAttribute('aria-label', 'Musical Family');
  }

  const observer = new MutationObserver(() => relabel());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  [0, 50, 150, 400, 900, 1800].forEach(ms => setTimeout(relabel, ms));
  document.addEventListener('change', event => {
    if (event.target === familySelect()) [0, 40, 120].forEach(ms => setTimeout(relabel, ms));
  }, true);

  window.fetch = async (input, init) => {
    let request;
    try { request = input instanceof Request ? input : new Request(input, init); }
    catch { return upstreamFetch(input, init); }

    let url;
    try { url = new URL(request.url, location.origin); }
    catch { return upstreamFetch(input, init); }

    const isGenerate = request.method.toUpperCase() === 'POST' && (url.pathname === '/api/billing/generate' || url.pathname === '/api/engine/generate');
    const isJson = String(request.headers.get('content-type') || '').toLowerCase().includes('application/json');
    if (!isGenerate || !isJson) return upstreamFetch(input, init);

    try {
      const body = await request.clone().json();
      const internal = String(familySelect()?.value || body.sonaraSelectedFamily || body.genreFamily || body.genre_family || '').trim();
      const family = canonical(internal);
      body.sonaraCanonicalMusicalFamily = family;
      body.sonaraMusicalFamilyInternalKey = internal;
      body.sonaraMusicalFamilyTaxonomyVersion = 'v1';
      const headers = new Headers(request.headers);
      headers.delete('content-length');
      headers.set('content-type', 'application/json');
      headers.set('x-sonara-musical-family', family);
      headers.set('x-sonara-musical-family-taxonomy', 'v1');
      return upstreamFetch(new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(body),
        credentials: request.credentials,
        cache: 'no-store',
        redirect: request.redirect
      }));
    } catch {
      return upstreamFetch(input, init);
    }
  };
})();`;

async function rewriteGenerateRequest(request) {
  if (request.method !== 'POST') return request;
  const url = new URL(request.url);
  if (!GENERATE_PATHS.has(url.pathname)) return request;
  if (!clean(request.headers.get('content-type')).toLowerCase().includes('application/json')) return request;
  let body;
  try { body = await request.clone().json(); }
  catch { return request; }

  const internal = clean(body.sonaraMusicalFamilyInternalKey || body.sonaraSelectedFamily || body.genreFamily || body.genre_family);
  const family = canonicalFamily(body.sonaraCanonicalMusicalFamily || internal);
  const next = {
    ...body,
    sonaraCanonicalMusicalFamily: family,
    sonaraMusicalFamilyInternalKey: internal,
    sonaraMusicalFamilyTaxonomyVersion: VERSION
  };
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-musical-family', family);
  headers.set('x-sonara-musical-family-taxonomy', VERSION);
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(next),
    credentials: request.credentials,
    cache: 'no-store',
    redirect: request.redirect
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
      'x-sonara-musical-family-taxonomy': VERSION
    }
  });
}

async function inject(request, response) {
  if (request.method !== 'GET' || !response.ok) return response;
  const url = new URL(request.url);
  if (!['sonaraenterprise.com', 'www.sonaraenterprise.com'].includes(url.hostname)) return response;
  if (!clean(response.headers.get('content-type')).toLowerCase().includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('sonara-musical-families-v1')) return new Response(html, response);
  const injection = `<script id="sonara-musical-families-v1">${FAMILY_UI.replace(/<\/script/gi, '<\\/script')}</script>`;
  const next = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${injection}</body>`) : `${html}${injection}`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  headers.set('x-sonara-musical-family-taxonomy', VERSION);
  return new Response(next, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/music/families' && request.method === 'GET') {
      return json({
        status: 'success',
        version: VERSION,
        hierarchy: 'Musical Family > Genre > Subgenre > Atmosphere',
        internalKeysPreservedForCompatibility: true,
        count: MUSICAL_FAMILIES.length,
        families: MUSICAL_FAMILIES
      });
    }

    const rewritten = await rewriteGenerateRequest(request);
    let response = await runtime.fetch(rewritten, env, ctx);

    if (response.ok && ['/api/health', '/api/engine/ready', '/api/molab/ready', '/api/studio/capabilities'].includes(url.pathname)) {
      const type = clean(response.headers.get('content-type')).toLowerCase();
      if (type.includes('application/json')) {
        try {
          const data = await response.json();
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          headers.set('content-type', 'application/json; charset=UTF-8');
          headers.set('x-sonara-musical-family-taxonomy', VERSION);
          return new Response(JSON.stringify({
            ...data,
            musicalFamilyTaxonomy: {
              version: VERSION,
              hierarchy: 'Musical Family > Genre > Subgenre > Atmosphere',
              canonicalFamilyCount: MUSICAL_FAMILIES.length,
              internalKeysPreservedForCompatibility: true,
              canonicalLabels: MUSICAL_FAMILIES.map(item => item.name)
            }
          }), { status: response.status, statusText: response.statusText, headers });
        } catch {}
      }
    }

    return inject(request, response);
  }
};
