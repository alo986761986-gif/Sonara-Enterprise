import runtime, { SonaraJobState } from './sonara-molab-xl-router.mjs';

export { SonaraJobState };

const TAXONOMY_LOCK_ID = 'sonara-musical-dna-v3-edge-authority';
const PROMPT_VERSION = 'sonara-taxonomy-first-prompt-v3-edge';
const MAX_CREATOR_CHARS = 3200;
const MAX_STYLE_TAIL_CHARS = 5200;
const MAX_CANONICAL_PROMPT_CHARS = 9200;
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);

const FRONTEND_TAXONOMY_HOTFIX = String.raw`(() => {
  if (window.__sonaraTaxonomyFrontendV3) return;
  window.__sonaraTaxonomyFrontendV3 = true;

  let explicitCreatorText = '';
  let creatorWasEdited = false;

  const promptEl = () => document.getElementById('sonara-prompt');
  const sectionEl = () => promptEl()?.closest('section') || null;
  const selects = () => sectionEl() ? Array.from(sectionEl().querySelectorAll('select')) : [];
  const valueAt = (index, fallback) => selects()[index]?.value || fallback;
  const bpmInput = () => sectionEl()?.querySelector('input[aria-label="BPM preferiti"]') || null;

  const readContext = () => ({
    family: valueAt(0, 'Electronic / Dance'),
    genre: valueAt(1, 'House'),
    subgenre: valueAt(2, valueAt(1, 'House')),
    atmosphere: valueAt(3, 'Authentic'),
    key: valueAt(4, 'A Minor'),
    duration: Math.max(30, Math.min(480, Math.round(Number(valueAt(5, '30')) || 30))),
    bpm: Math.max(40, Math.min(220, Math.round(Number(bpmInput()?.value || 124))))
  });

  const setTextarea = (textarea, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(textarea, value);
    else textarea.value = value;
    textarea.dataset.sonaraPromptSource = 'taxonomy-first-edge-v3';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const buildPrompt = () => {
    const c = readContext();
    const creator = creatorWasEdited ? String(explicitCreatorText || '').trim().slice(0, 1800) : '';
    const lines = [
      'SONARA MUSICAL DNA — TAXONOMY FIRST — AUTHORITATIVE',
      'FAMILY: ' + c.family,
      'GENRE: ' + c.genre,
      'SUBGENRE: ' + c.subgenre,
      'ATMOSPHERE: ' + c.atmosphere,
      '',
      'HARD PRIORITY: ' + c.family + ' > ' + c.genre + ' > ' + c.subgenre + '. The selected subgenre is non-negotiable and must be immediately recognizable in groove, drums, bass, instrumentation, harmony, melody, arrangement, transitions and production.',
      'ATMOSPHERE LOCK: ' + c.atmosphere + ' changes emotion, energy, tension, space, density and production color only INSIDE ' + c.subgenre + '. It must never replace or weaken the selected genre or subgenre.',
      'TECHNICAL LOCK: exactly ' + c.bpm + ' BPM; key ' + c.key + '; approximately ' + c.duration + ' seconds.',
      creator ? '' : null,
      creator ? 'CREATOR DETAILS — SECONDARY TO THE SELECTED MUSICAL DNA:' : null,
      creator || null,
      creator ? 'If any creator wording conflicts with Family, Genre, Subgenre or Atmosphere, the selected taxonomy wins.' : null,
      '',
      'FINAL CHECK: the result must sound specifically like ' + c.subgenre + ', inside ' + c.genre + ' and ' + c.family + ', with a clearly audible ' + c.atmosphere + ' atmosphere.'
    ].filter(v => v !== null);
    return lines.join('\n').trim();
  };

  const refresh = () => {
    const textarea = promptEl();
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    setTextarea(textarea, buildPrompt());
  };

  document.addEventListener('input', event => {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement && target.id === 'sonara-prompt' && event.isTrusted) {
      creatorWasEdited = true;
      explicitCreatorText = String(target.value || '');
    }
  }, true);

  document.addEventListener('change', event => {
    const target = event.target;
    const section = sectionEl();
    if (!section || !(target instanceof HTMLSelectElement) || !section.contains(target)) return;
    const list = selects();
    const index = list.indexOf(target);
    if (index >= 0 && index <= 5) setTimeout(refresh, 0);
  }, true);

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button');
    if (!(button instanceof HTMLButtonElement)) return;
    const title = String(button.getAttribute('title') || '');
    const label = String(button.getAttribute('aria-label') || '');
    if (title === 'Prompt Intelligente SONARA' || label.includes('Prompt Intelligente SONARA')) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      refresh();
      promptEl()?.focus();
    }
  }, true);

  [0, 120, 500, 1200].forEach(ms => setTimeout(() => {
    const textarea = promptEl();
    if (textarea instanceof HTMLTextAreaElement && !String(textarea.value || '').includes('SONARA MUSICAL DNA — TAXONOMY FIRST — AUTHORITATIVE')) refresh();
  }, ms));
})();`;

function clean(value, fallback = '') {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || fallback;
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function selectedMusicalDna(body = {}) {
  const family = clean(body.sonaraSelectedFamily || body.genreFamily || body.genre_family, 'Music');
  const genre = clean(body.sonaraSelectedGenre || body.genre, 'Music');
  const subgenre = clean(body.sonaraSelectedSubgenre || body.subgenre, genre);
  const atmosphere = clean(body.sonaraSelectedMood || body.mood || body.atmosphere, 'Authentic');
  return { family, genre, subgenre, atmosphere };
}

function originalCreatorBrief(body = {}) {
  return clean(
    body.sonaraOriginalCreatorBrief ||
    body.rawPrompt ||
    body.creatorPrompt ||
    body.creator_prompt ||
    body.musicPrompt ||
    '',
    ''
  ).slice(0, MAX_CREATOR_CHARS);
}

function selectedStyleTail(body = {}) {
  const source = String(body.prompt || '');
  if (!source) return '';

  const marker = 'AUTHORITATIVE MUSICAL IDENTITY:';
  const index = source.indexOf(marker);
  if (index < 0) return '';

  return source
    .slice(index)
    .replace(/CREATOR BRIEF\s+—\s+VERBATIM:[\s\S]*?>>>/gi, '')
    .replace(/Priority rule:[^\n]*/gi, '')
    .replace(/Concrete creator details take precedence over generic defaults[^\n]*/gi, '')
    .trim()
    .slice(0, MAX_STYLE_TAIL_CHARS);
}

function effectiveStyleInfluence(body = {}) {
  const requested = Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100));
  const effective = 88 + Math.round(requested * 0.12);
  return { requested, effective };
}

function technicalLine(body = {}) {
  const bpm = Math.round(clamp(body.bpm ?? body.requestedBpm, 124, 40, 220));
  const key = clean(body.key || body.key_scale, 'A Minor');
  const duration = Math.round(clamp(body.durationSec ?? body.duration, 30, 30, 480));
  const vocalMode = clean(body.vocalMode || body.vocal_mode, body.lyrics ? 'vocal' : 'instrumental');
  return `TECHNICAL LOCK: ${bpm} BPM; key ${key}; duration approximately ${duration} seconds; vocal mode ${vocalMode}. Keep these parameters stable for the whole composition.`;
}

function canonicalTaxonomyPrompt(body = {}) {
  const { family, genre, subgenre, atmosphere } = selectedMusicalDna(body);
  const creator = originalCreatorBrief(body);
  const styleTail = selectedStyleTail(body);

  const sections = [
    `SONARA MUSICAL DNA ${TAXONOMY_LOCK_ID}. THIS TAXONOMY IS THE PRIMARY MUSIC SPECIFICATION.`,
    `PRIMARY IDENTITY: FAMILY = ${family}; GENRE = ${genre}; SUBGENRE = ${subgenre}; ATMOSPHERE = ${atmosphere}.`,
    `HARD STYLE ORDER: ${family} > ${genre} > ${subgenre}. The exact subgenre ${subgenre} is non-negotiable and must be immediately recognizable in groove, drum language, bass behavior, instrumentation, harmony, melody, arrangement, transitions, sound design, mix and mastering character.`,
    `DO NOT substitute ${subgenre} with its parent ${genre}, a neighboring subgenre, generic EDM, generic pop, generic house, generic techno, soundtrack music, cinematic filler or any other default. Do not blend into another genre unless that blend is already part of the selected subgenre's authentic vocabulary.`,
    `ATMOSPHERE LOCK: ${atmosphere} changes emotion, energy, density, brightness/darkness, tension, space and performance character INSIDE ${subgenre}. Atmosphere must never replace or weaken the selected genre/subgenre.`,
    'WEIRDNESS RULE: creativity is allowed only inside the selected musical DNA. STYLE INFLUENCE RULE: the control changes the intensity of authentic subgenre conventions, never the identity of the genre.',
    technicalLine(body),
    creator ? `CREATOR DETAILS — SUBORDINATE TO THE SELECTED MUSICAL DNA: ${creator} Preserve compatible requests for instruments, lyrics, vocals, structure, dynamics and production. If any creator wording conflicts with Family/Genre/Subgenre/Atmosphere, the selected taxonomy above wins.` : '',
    styleTail ? `SONARA CURATED SUBGENRE PROFILE — USE THIS TO REALIZE THE SELECTED STYLE:\n${styleTail}` : '',
    `FINAL CHECK BEFORE RENDERING: the result must sound specifically like ${subgenre}, inside ${genre} and ${family}, with a clearly audible ${atmosphere} atmosphere. If the result could be mistaken for a neighboring genre, revise the musical decisions toward ${subgenre}. Generate finished music audio, not prose.`
  ].filter(Boolean);

  return sections.join('\n\n').slice(0, MAX_CANONICAL_PROMPT_CHARS);
}

export async function lockMusicTaxonomyRequest(request) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || !GENERATE_PATHS.has(url.pathname)) return request;
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return request;

  let body;
  try {
    body = await request.clone().json();
  } catch {
    return request;
  }

  const dna = selectedMusicalDna(body);
  const style = effectiveStyleInfluence(body);
  const creator = originalCreatorBrief(body);
  const canonicalPrompt = canonicalTaxonomyPrompt(body);

  const locked = {
    ...body,
    genreFamily: dna.family,
    genre_family: dna.family,
    genre: dna.genre,
    subgenre: dna.subgenre,
    mood: dna.atmosphere,
    atmosphere: dna.atmosphere,
    sonaraSelectedFamily: dna.family,
    sonaraSelectedGenre: dna.genre,
    sonaraSelectedSubgenre: dna.subgenre,
    sonaraSelectedMood: dna.atmosphere,
    prompt: canonicalPrompt,
    rawPrompt: canonicalPrompt,
    creatorPrompt: '',
    creator_prompt: '',
    musicPrompt: '',
    styleInfluence: style.effective,
    style_influence: style.effective,
    sonaraRequestedStyleInfluence: style.requested,
    sonaraEffectiveStyleInfluence: style.effective,
    sonaraTaxonomyLock: TAXONOMY_LOCK_ID,
    sonaraTaxonomyAuthoritative: true,
    sonaraPromptTaxonomyFirst: true,
    sonaraPromptVersion: PROMPT_VERSION,
    sonaraAtmosphereRole: 'emotional-modifier-inside-subgenre',
    sonaraOriginalCreatorBrief: creator,
    sonaraCreatorStylePriority: false,
    promptGenreAuthoritative: true,
    sonaraRealPrompt: true,
    sonaraRealPromptVersion: PROMPT_VERSION
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-musical-dna-lock', TAXONOMY_LOCK_ID);
  headers.set('x-sonara-prompt-version', PROMPT_VERSION);
  headers.set('x-sonara-family', dna.family);
  headers.set('x-sonara-genre', dna.genre);
  headers.set('x-sonara-subgenre', dna.subgenre);
  headers.set('x-sonara-atmosphere', dna.atmosphere);

  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(locked),
    redirect: request.redirect
  });
}

async function injectFrontendTaxonomyHotfix(request, response) {
  if (request.method === 'HEAD') return response;
  const url = new URL(request.url);
  if (!['sonaraenterprise.com', 'www.sonaraenterprise.com'].includes(url.hostname)) return response;
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html')) return response;

  try {
    const html = await response.text();
    if (html.includes('__sonaraTaxonomyFrontendV3')) {
      return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    const script = `<script id="sonara-taxonomy-frontend-v3">${FRONTEND_TAXONOMY_HOTFIX}</script>`;
    const output = html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : `${html}${script}`;
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('cache-control', 'no-store, max-age=0');
    headers.set('x-sonara-taxonomy-frontend', 'v3-edge');
    return new Response(output, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

async function decorateHealth(request, response) {
  const url = new URL(request.url);
  if (!response.ok || !['/api/health', '/api/engine/ready', '/api/molab/ready'].includes(url.pathname)) return response;
  try {
    const data = await response.clone().json();
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json; charset=UTF-8');
    headers.set('x-sonara-musical-dna-lock', TAXONOMY_LOCK_ID);
    headers.set('x-sonara-prompt-version', PROMPT_VERSION);
    return new Response(JSON.stringify({
      ...data,
      musicalDnaLock: TAXONOMY_LOCK_ID,
      promptVersion: PROMPT_VERSION,
      actualModelPromptTaxonomyFirst: true,
      creatorPromptCannotOverrideTaxonomy: true,
      familyAuthoritative: true,
      genreAuthoritative: true,
      subgenreAuthoritative: true,
      atmosphereScopedToSubgenre: true,
      billingGenerateTaxonomyFirst: true,
      frontendTaxonomyHotfix: 'v3-edge',
      weirdnessCannotChangeGenre: true,
      styleInfluenceCannotChangeGenre: true,
      styleInfluenceFidelityFloor: 88
    }), { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    const lockedRequest = await lockMusicTaxonomyRequest(request);
    let response = await runtime.fetch(lockedRequest, env, ctx);
    response = await injectFrontendTaxonomyHotfix(request, response);
    return decorateHealth(request, response);
  }
};
