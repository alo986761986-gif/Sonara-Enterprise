import runtime, { SonaraJobState } from './sonara-molab-xl-router.mjs';
import { getMusicStyleProfile, getMusicTaxonomyAudit } from '../src/musicStyleIntelligence.ts';

export { SonaraJobState };

const TAXONOMY_LOCK_ID = 'sonara-musical-dna-v4-clean-realism';
const PROMPT_VERSION = 'sonara-clean-ui-hidden-dna-v4';
const REALISM_VERSION = 'sonara-human-realism-v1';
const MAX_CREATOR_CHARS = 2400;
const MAX_CANONICAL_PROMPT_CHARS = 9800;
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const BPM_MIN = 40;
const BPM_MAX = 220;

const FRONTEND_TAXONOMY_HOTFIX = String.raw`(() => {
  if (window.__sonaraTaxonomyFrontendV4) return;
  window.__sonaraTaxonomyFrontendV4 = true;

  let explicitCreatorText = '';
  let creatorWasEdited = false;
  const upstreamFetch = window.fetch.bind(window);

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
    bpm: Math.max(40, Math.min(220, Math.round(Number(bpmInput()?.value || 124))))
  });

  const compactStyleLine = () => {
    const c = readContext();
    return c.subgenre + ', ' + c.atmosphere + ', realistic studio sound, ' + c.bpm + ' BPM';
  };

  const buildPrompt = smart => {
    const c = readContext();
    const creator = creatorWasEdited ? String(explicitCreatorText || '').trim().slice(0, 1800) : '';
    if (creator) return creator + '\n' + compactStyleLine();
    if (smart) return c.subgenre + ', ' + c.atmosphere + ', authentic groove, realistic instruments, natural human performance, ' + c.bpm + ' BPM';
    return compactStyleLine();
  };

  const setTextarea = (textarea, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(textarea, value);
    else textarea.value = value;
    textarea.dataset.sonaraPromptSource = 'clean-suno-edge-v4';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const refresh = smart => {
    const textarea = promptEl();
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    setTextarea(textarea, buildPrompt(Boolean(smart)));
  };

  document.addEventListener('input', event => {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement && target.id === 'sonara-prompt' && event.isTrusted) {
      creatorWasEdited = true;
      explicitCreatorText = String(target.value || '').trim();
      return;
    }
    if (target === bpmInput() && event.isTrusted) {
      [0, 50, 160].forEach(ms => setTimeout(() => refresh(false), ms));
    }
  }, true);

  document.addEventListener('change', event => {
    const target = event.target;
    const section = sectionEl();
    if (!section) return;
    if (target === bpmInput()) {
      [0, 50, 160].forEach(ms => setTimeout(() => refresh(false), ms));
      return;
    }
    if (!(target instanceof HTMLSelectElement) || !section.contains(target)) return;
    const index = selects().indexOf(target);
    if (index >= 0 && index <= 3) {
      [0, 50, 160].forEach(ms => setTimeout(() => refresh(false), ms));
    }
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
      creatorWasEdited = false;
      explicitCreatorText = '';
      refresh(true);
      promptEl()?.focus();
    }
  }, true);

  window.fetch = async (input, init) => {
    let req;
    try { req = input instanceof Request ? input : new Request(input, init); }
    catch { return upstreamFetch(input, init); }

    let url;
    try { url = new URL(req.url, location.origin); }
    catch { return upstreamFetch(input, init); }

    const isGenerate = req.method.toUpperCase() === 'POST' && (url.pathname === '/api/billing/generate' || url.pathname === '/api/engine/generate');
    const isJson = String(req.headers.get('content-type') || '').toLowerCase().includes('application/json');
    if (!isGenerate || !isJson) return upstreamFetch(input, init);

    try {
      const body = await req.clone().json();
      const c = readContext();
      const creator = creatorWasEdited ? String(explicitCreatorText || '').trim().slice(0, 1800) : '';
      const headers = new Headers(req.headers);

      body.genreFamily = c.family;
      body.genre_family = c.family;
      body.genre = c.genre;
      body.subgenre = c.subgenre;
      body.mood = c.atmosphere;
      body.atmosphere = c.atmosphere;
      body.sonaraSelectedFamily = c.family;
      body.sonaraSelectedGenre = c.genre;
      body.sonaraSelectedSubgenre = c.subgenre;
      body.sonaraSelectedMood = c.atmosphere;
      body.bpm = c.bpm;
      body.requestedBpm = c.bpm;
      body.targetBpm = c.bpm;
      body.preferredBpm = c.bpm;
      body.promptBpmAuthoritative = true;
      body.bpmLock = true;
      body.sonaraExactRequestedBpm = c.bpm;
      body.sonaraCleanPromptV4 = true;
      body.sonaraOriginalCreatorBrief = creator;
      body.rawPrompt = creator;
      body.creatorPrompt = '';
      body.creator_prompt = '';
      body.musicPrompt = '';
      body.sonaraVisiblePrompt = buildPrompt(false);

      headers.delete('content-length');
      headers.set('content-type', 'application/json');
      headers.set('x-sonara-clean-prompt', 'v4');
      headers.set('x-sonara-requested-bpm', String(c.bpm));
      headers.set('x-sonara-taxonomy-ui', c.family + ' > ' + c.genre + ' > ' + c.subgenre);

      return upstreamFetch(new Request(req.url, {
        method: req.method,
        headers,
        body: JSON.stringify(body),
        credentials: req.credentials,
        cache: 'no-store',
        redirect: req.redirect
      }));
    } catch {
      return upstreamFetch(input, init);
    }
  };

  [0, 120, 500, 1200].forEach(ms => setTimeout(() => refresh(false), ms));
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

function parseBpm(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(clamp(number, 124, BPM_MIN, BPM_MAX)) : null;
}

function exactRequestedBpm(body = {}) {
  const candidates = [
    body.sonaraExactRequestedBpm,
    body.requestedBpm,
    body.requested_bpm,
    body.targetBpm,
    body.target_bpm,
    body.preferredBpm,
    body.preferred_bpm,
    body.bpm,
    body.tempo
  ];
  for (const candidate of candidates) {
    const bpm = parseBpm(candidate);
    if (bpm !== null) return bpm;
  }
  return 124;
}

function selectedMusicalDna(body = {}) {
  const family = clean(body.sonaraSelectedFamily || body.genreFamily || body.genre_family, 'Music');
  const genre = clean(body.sonaraSelectedGenre || body.genre, 'Music');
  const subgenre = clean(body.sonaraSelectedSubgenre || body.subgenre, genre);
  const atmosphere = clean(body.sonaraSelectedMood || body.mood || body.atmosphere, 'Authentic');
  return { family, genre, subgenre, atmosphere };
}

function originalCreatorBrief(body = {}) {
  if (body.sonaraCleanPromptV4 === true) {
    return clean(body.sonaraOriginalCreatorBrief, '').slice(0, MAX_CREATOR_CHARS);
  }
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

function effectiveStyleInfluence(body = {}) {
  const requested = Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100));
  const effective = 90 + Math.round(requested * 0.10);
  return { requested, effective };
}

function technicalLine(body = {}) {
  const bpm = exactRequestedBpm(body);
  const key = clean(body.key || body.key_scale, 'A Minor');
  const duration = Math.round(clamp(body.durationSec ?? body.duration, 30, 30, 480));
  const vocalMode = clean(body.vocalMode || body.vocal_mode, body.lyrics ? 'vocal' : 'instrumental');
  return `EXACT PERFORMANCE LOCK: ${bpm} BPM is the master clock and quarter-note grid for the entire render; key ${key}; duration approximately ${duration} seconds; vocal mode ${vocalMode}. Never halve, double, normalize or drift the requested BPM.`;
}

function realismLines(body = {}) {
  const hasLyrics = Boolean(String(body.lyrics || '').trim());
  const vocalMode = clean(body.vocalMode || body.vocal_mode, hasLyrics ? 'vocal' : 'instrumental').toLowerCase();
  const instrumental = /instrumental|no vocals|senza voce/.test(vocalMode) && !hasLyrics;
  const instrument = 'INSTRUMENT REALISM: every instrument must behave like a believable performance. Use instrument-specific articulation, attack, release, resonance, velocity/dynamic variation, micro-timing, phrasing and room/depth cues. Acoustic and electromechanical instruments must not sound like flat MIDI or repeated samples. Synthesizers must show believable oscillator/envelope/filter/modulation behavior, tasteful saturation and evolving timbre appropriate to the selected style. Avoid plastic transients, identical repeated hits, fake orchestral attacks and sterile copy-paste loops.';
  const vocal = instrumental
    ? 'VOCAL MODE: instrumental. Do not invent sung, spoken or accidental lead vocals.'
    : 'HUMAN VOCAL REALISM: maintain one stable singer identity and natural formants from first phrase to last. Use intelligible consonants, believable vowels, breathing between phrases, micro-pitch movement, natural vibrato only where musical, human timing, dynamic expression and consistent accent/language. Avoid metallic, robotic, phasey, over-tuned or synthetic voice artifacts; avoid unexplained singer/timbre changes. Doubles and harmonies may support the lead but must not replace it.';
  return [instrument, vocal];
}

function canonicalTaxonomyPrompt(body = {}) {
  const { family, genre, subgenre, atmosphere } = selectedMusicalDna(body);
  const creator = originalCreatorBrief(body);
  const profile = getMusicStyleProfile(family, genre, subgenre);
  const audit = getMusicTaxonomyAudit(family, genre, subgenre);
  const [instrumentRealism, vocalRealism] = realismLines(body);

  const sections = [
    `SONARA MUSICAL DNA ${TAXONOMY_LOCK_ID}. THIS HIDDEN BACKEND CONTRACT IS AUTHORITATIVE; THE SHORT UI PROMPT IS ONLY A CLEAN CREATOR VIEW.`,
    `PRIMARY IDENTITY: FAMILY = ${family}; GENRE = ${genre}; SUBGENRE = ${subgenre}; ATMOSPHERE = ${atmosphere}.`,
    `HARD STYLE ORDER: ${family} > ${genre} > ${subgenre}. The exact subgenre ${subgenre} is non-negotiable and must be immediately recognizable in groove, drum language, bass behavior, instrumentation, harmony, melody, arrangement, transitions, sound design, mix and mastering character.`,
    `AUTHENTIC STYLE IDENTITY: ${profile.identity}`,
    `AUTHENTIC INSTRUMENTATION: ${profile.instrumentation}`,
    `RHYTHM/GROOVE DNA: ${profile.rhythm}`,
    `HARMONY/MUSICAL LANGUAGE: ${profile.harmony}`,
    `ARRANGEMENT DNA: ${profile.arrangement}`,
    `PRODUCTION DNA: ${profile.production}`,
    `ANTI-DRIFT: ${profile.avoid}`,
    `STYLE AUDIT: ${audit.fingerprint}; specificity ${audit.specificityScore}/100; exactProfile=${audit.exactProfile}.`,
    `ATMOSPHERE LOCK: ${atmosphere} changes emotion, energy, density, brightness/darkness, tension, space and performance character INSIDE ${subgenre}. Atmosphere must never replace or weaken the selected genre/subgenre.`,
    instrumentRealism,
    vocalRealism,
    'WEIRDNESS RULE: creativity is allowed only inside the selected musical DNA. STYLE INFLUENCE RULE: it changes the intensity of authentic subgenre conventions, never permission to leave the taxonomy.',
    technicalLine(body),
    creator ? `CREATOR DETAILS — PRESERVE WHEN COMPATIBLE WITH THE SELECTED DNA: ${creator} If any wording conflicts with Family/Genre/Subgenre/Atmosphere or exact BPM, the selected controls above win.` : '',
    `FINAL QUALITY CHECK: the result must sound specifically like ${subgenre}, inside ${genre} and ${family}, at exactly ${exactRequestedBpm(body)} BPM, with a clearly audible ${atmosphere} atmosphere, believable instruments and human-realistic vocals when vocals are requested. Generate finished studio audio, not prose.`
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
  const bpm = exactRequestedBpm(body);
  const canonicalPrompt = canonicalTaxonomyPrompt({ ...body, bpm, requestedBpm: bpm });

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
    bpm,
    requestedBpm: bpm,
    requested_bpm: bpm,
    targetBpm: bpm,
    target_bpm: bpm,
    preferredBpm: bpm,
    preferred_bpm: bpm,
    bpmLock: true,
    promptBpmAuthoritative: true,
    sonaraExactRequestedBpm: bpm,
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
    sonaraRealismVersion: REALISM_VERSION,
    sonaraInstrumentRealism: true,
    sonaraVocalRealism: true,
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
  headers.set('x-sonara-realism', REALISM_VERSION);
  headers.set('x-sonara-requested-bpm', String(bpm));
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
    if (html.includes('__sonaraTaxonomyFrontendV4')) {
      return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    const script = `<script id="sonara-taxonomy-frontend-v4">${FRONTEND_TAXONOMY_HOTFIX}</script>`;
    const output = html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : `${html}${script}`;
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('cache-control', 'no-store, max-age=0');
    headers.set('x-sonara-taxonomy-frontend', 'v4-clean-suno');
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
    headers.set('x-sonara-realism', REALISM_VERSION);
    return new Response(JSON.stringify({
      ...data,
      musicalDnaLock: TAXONOMY_LOCK_ID,
      promptVersion: PROMPT_VERSION,
      frontendPromptMode: 'clean-suno-style',
      hiddenBackendDna: true,
      backendCuratedStyleProfile: true,
      actualModelPromptTaxonomyFirst: true,
      creatorPromptCannotOverrideTaxonomy: true,
      familyAuthoritative: true,
      genreAuthoritative: true,
      subgenreAuthoritative: true,
      atmosphereScopedToSubgenre: true,
      billingGenerateTaxonomyFirst: true,
      frontendTaxonomyHotfix: 'v4-clean-suno',
      realismVersion: REALISM_VERSION,
      instrumentPerformanceRealism: true,
      humanVocalRealism: true,
      exactBpmMetadataLock: true,
      bpmRange: `${BPM_MIN}-${BPM_MAX}`,
      weirdnessCannotChangeGenre: true,
      styleInfluenceCannotChangeGenre: true,
      styleInfluenceFidelityFloor: 90
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
