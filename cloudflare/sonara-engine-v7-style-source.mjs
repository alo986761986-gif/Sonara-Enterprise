import engineV6 from './sonara-engine-v6-final.mjs';

function exactGenre(value) {
  const text = String(value || '').trim();
  if (!text) return 'Music';
  return text.split('·')[0]?.trim() || text;
}

function clean(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function buildCanonicalCaption(body) {
  const family = clean(body.genreFamily, 'Music');
  const genre = exactGenre(body.genre);
  const subgenre = clean(body.subgenre, genre);
  const mood = clean(body.mood);

  return [
    subgenre,
    genre,
    family,
    mood,
    `authentic ${subgenre} style`,
    `characteristic ${subgenre} rhythm and groove`,
    `genre-appropriate instrumentation and sound palette`,
    `clear professional arrangement`,
    `polished studio production and mastering`
  ].filter(Boolean).join(', ');
}

async function rewriteGenerationRequest(request) {
  const body = await request.clone().json();
  const originalKey = clean(body.key || body.key_scale);
  const genre = exactGenre(body.genre);
  const subgenre = clean(body.subgenre, genre);
  const family = clean(body.genreFamily, 'Music');

  const locked = {
    ...body,
    genreFamily: family,
    genre,
    subgenre,
    // The free-text prompt is intentionally replaced. Old/random genre words
    // must never be able to override the explicit selectors.
    prompt: buildCanonicalCaption({ ...body, genreFamily: family, genre, subgenre }),
    // Keep key out of the caption while preserving it as a dedicated engine parameter.
    key: '',
    key_scale: originalKey
  };

  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');

  return new Request(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(locked)
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/engine/generate' && request.method === 'POST') {
      try {
        const rewritten = await rewriteGenerationRequest(request);
        return engineV6.fetch(rewritten, env, ctx);
      } catch {
        return engineV6.fetch(request, env, ctx);
      }
    }

    const response = await engineV6.fetch(request, env, ctx);
    if (url.pathname === '/api/health' && response.ok) {
      try {
        const data = await response.clone().json();
        return new Response(JSON.stringify({
          ...data,
          service: 'sonara-production-engine-v7',
          styleControl: 'selector-source-lock-v8',
          promptPolicy: 'canonical-selected-style-only'
        }), {
          status: response.status,
          headers: response.headers
        });
      } catch {}
    }
    return response;
  }
};
