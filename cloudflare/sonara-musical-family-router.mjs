import runtime from './sonara-studio-pro-router.mjs';
export { SonaraJobState } from './sonara-studio-pro-router.mjs';

const VERSION = 'sonara-musical-families-v2.1-exact-categories-safe';
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);

export const MUSICAL_FAMILY_MAP = Object.freeze({
  'Electronic / Dance': 'Electronic / Dance',
  'Hip-Hop / Rap': 'Hip-Hop / Rap',
  'Pop': 'Pop',
  'Rock': 'Rock',
  'Metal': 'Metal',
  'R&B / Soul / Funk': 'R&B / Soul / Funk',
  'Jazz': 'Jazz',
  'Blues': 'Blues',
  'Reggae / Jamaican': 'Reggae / Jamaican',
  'Latin America': 'Latin America',
  'Africa': 'Africa',
  'Caribbean': 'Caribbean',
  'Middle East / North Africa': 'Middle East / North Africa',
  'South Asia': 'South Asia',
  'East Asia': 'East Asia',
  'Southeast Asia': 'Southeast Asia',
  'Country / Americana': 'Country / Americana',
  'Folk / Traditional Europe': 'Folk / Traditional Europe',
  'Neomelodica Napoletana': 'Neomelodica Napoletana',
  'Classical / Art Music': 'Classical / Art Music',
  'Gospel / Spiritual': 'Gospel / Spiritual',
  'Cinematic / Media': 'Cinematic / Media',
  'Experimental / Avant-Garde': 'Experimental / Avant-Garde',
  'Easy Listening / Lounge': 'Easy Listening / Lounge',
  'Children / Novelty / Spoken': 'Children / Novelty / Spoken'
});

const LEGACY_FAMILY_ALIASES = Object.freeze({
  'Electronic Music': 'Electronic / Dance',
  'Rock / Alternative / Punk': 'Rock',
  'Reggae / Ska / Dancehall': 'Reggae / Jamaican',
  'Latin Music': 'Latin America',
  'African Music': 'Africa',
  'Caribbean Music': 'Caribbean',
  'Middle Eastern / North African Music': 'Middle East / North Africa',
  'South Asian Music': 'South Asia',
  'East Asian Music': 'East Asia',
  'Southeast Asian Music': 'Southeast Asia',
  'European Folk / Traditional Music': 'Folk / Traditional Europe',
  'Neapolitan Popular Music': 'Neomelodica Napoletana',
  'Sacred / Devotional Music': 'Gospel / Spiritual',
  'Soundtrack / Media Music': 'Cinematic / Media',
  "Children's / Spoken / Novelty": 'Children / Novelty / Spoken'
});

export const MUSICAL_FAMILIES = Object.keys(MUSICAL_FAMILY_MAP).map(name => ({
  internalKey: name,
  name,
  type: 'musical-family'
}));

const clean = value => String(value ?? '').trim();
const canonicalFamily = value => {
  const raw = clean(value);
  const exact = LEGACY_FAMILY_ALIASES[raw] || raw;
  return MUSICAL_FAMILY_MAP[exact] || exact || 'Music';
};

const FAMILY_UI = String.raw`(() => {
  if (window.__sonaraMusicalFamiliesV21ExactCategoriesSafe) return;
  window.__sonaraMusicalFamiliesV21ExactCategoriesSafe = true;

  const MAP = ${JSON.stringify({
    'Electronic / Dance': 'Electronic / Dance',
    'Hip-Hop / Rap': 'Hip-Hop / Rap',
    'Pop': 'Pop',
    'Rock': 'Rock',
    'Metal': 'Metal',
    'R&B / Soul / Funk': 'R&B / Soul / Funk',
    'Jazz': 'Jazz',
    'Blues': 'Blues',
    'Reggae / Jamaican': 'Reggae / Jamaican',
    'Latin America': 'Latin America',
    'Africa': 'Africa',
    'Caribbean': 'Caribbean',
    'Middle East / North Africa': 'Middle East / North Africa',
    'South Asia': 'South Asia',
    'East Asia': 'East Asia',
    'Southeast Asia': 'Southeast Asia',
    'Country / Americana': 'Country / Americana',
    'Folk / Traditional Europe': 'Folk / Traditional Europe',
    'Neomelodica Napoletana': 'Neomelodica Napoletana',
    'Classical / Art Music': 'Classical / Art Music',
    'Gospel / Spiritual': 'Gospel / Spiritual',
    'Cinematic / Media': 'Cinematic / Media',
    'Experimental / Avant-Garde': 'Experimental / Avant-Garde',
    'Easy Listening / Lounge': 'Easy Listening / Lounge',
    'Children / Novelty / Spoken': 'Children / Novelty / Spoken'
  })};

  const LEGACY = ${JSON.stringify({
    'Electronic Music': 'Electronic / Dance',
    'Rock / Alternative / Punk': 'Rock',
    'Reggae / Ska / Dancehall': 'Reggae / Jamaican',
    'Latin Music': 'Latin America',
    'African Music': 'Africa',
    'Caribbean Music': 'Caribbean',
    'Middle Eastern / North African Music': 'Middle East / North Africa',
    'South Asian Music': 'South Asia',
    'East Asian Music': 'East Asia',
    'Southeast Asian Music': 'Southeast Asia',
    'European Folk / Traditional Music': 'Folk / Traditional Europe',
    'Neapolitan Popular Music': 'Neomelodica Napoletana',
    'Sacred / Devotional Music': 'Gospel / Spiritual',
    'Soundtrack / Media Music': 'Cinematic / Media',
    "Children's / Spoken / Novelty": 'Children / Novelty / Spoken'
  })};

  const upstreamFetch = window.fetch.bind(window);
  const prompt = () => document.getElementById('sonara-prompt');
  const section = () => prompt()?.closest('section') || null;
  const familySelect = () => section()?.querySelector('select') || null;
  const canonical = value => {
    const raw = String(value || '').trim();
    const exact = LEGACY[raw] || raw;
    return MAP[exact] || exact;
  };

  let relabeling = false;
  function relabel() {
    if (relabeling) return;
    const select = familySelect();
    if (!(select instanceof HTMLSelectElement)) return;
    relabeling = true;
    try {
      Array.from(select.options).forEach(option => {
        const rawValue = String(option.value || '').trim();
        const rawText = String(option.textContent || '').trim();
        const label = canonical(rawValue || rawText);
        if (!label) return;
        if (rawText !== label) option.textContent = label;
        if (option.label !== label) option.label = label;
        if (option.dataset.sonaraFamilyInternalKey !== label) option.dataset.sonaraFamilyInternalKey = label;
        if (option.dataset.sonaraMusicalFamily !== label) option.dataset.sonaraMusicalFamily = label;
      });
      if (select.dataset.sonaraMusicalFamilyTaxonomy !== 'v2.1-exact-categories-safe') {
        select.dataset.sonaraMusicalFamilyTaxonomy = 'v2.1-exact-categories-safe';
      }
      if (select.getAttribute('aria-label') !== 'Genre Category') {
        select.setAttribute('aria-label', 'Genre Category');
      }
    } finally {
      relabeling = false;
    }
  }

  let relabelQueued = false;
  const queueRelabel = () => {
    if (relabelQueued) return;
    relabelQueued = true;
    queueMicrotask(() => {
      relabelQueued = false;
      relabel();
    });
  };

  const observer = new MutationObserver(mutations => {
    if (relabeling) return;
    const relevant = mutations.some(mutation =>
      Array.from(mutation.addedNodes || []).some(node =>
        node instanceof HTMLElement && (node.matches?.('select, option') || node.querySelector?.('select, option'))
      )
    );
    if (relevant) queueRelabel();
  });
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
      const raw = String(familySelect()?.value || body.sonaraMusicalFamilyInternalKey || body.sonaraSelectedFamily || body.genreFamily || body.genre_family || body.sonaraCanonicalMusicalFamily || '').trim();
      const family = canonical(raw);
      body.sonaraCanonicalMusicalFamily = family;
      body.sonaraMusicalFamilyInternalKey = family;
      body.sonaraMusicalFamilyTaxonomyVersion = 'v2.1-exact-categories-safe';
      const headers = new Headers(request.headers);
      headers.delete('content-length');
      headers.set('content-type', 'application/json');
      headers.set('x-sonara-musical-family', family);
      headers.set('x-sonara-musical-family-taxonomy', 'v2.1-exact-categories-safe');
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

  const raw = clean(
    body.sonaraMusicalFamilyInternalKey ||
    body.sonaraSelectedFamily ||
    body.genreFamily ||
    body.genre_family ||
    body.sonaraCanonicalMusicalFamily
  );
  const family = canonicalFamily(raw);
  const next = {
    ...body,
    sonaraCanonicalMusicalFamily: family,
    sonaraMusicalFamilyInternalKey: family,
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
  if (html.includes('sonara-musical-families-v2-1-exact-categories-safe')) return new Response(html, response);
  const injection = `<script id="sonara-musical-families-v2-1-exact-categories-safe">${FAMILY_UI.replace(/<\/script/gi, '<\\/script')}</script>`;
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
        hierarchy: 'Genre Category > Genre > Subgenre > Atmosphere',
        exactCategoryLabels: true,
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
              hierarchy: 'Genre Category > Genre > Subgenre > Atmosphere',
              exactCategoryLabels: true,
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
