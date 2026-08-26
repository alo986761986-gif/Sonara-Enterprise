import engineV12 from './sonara-engine-v12-electronic-lock.mjs';

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' ')
    .replace(/\//g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function futureGarageVariant(body) {
  if (normalize(body?.subgenre) !== 'future garage') return null;
  const genre = normalize(body?.genre);
  if (genre === 'dubstep') {
    return 'Dubstep Future Garage. authentic post-dubstep future garage, around 130-140 BPM, fragile half-time/2-step hybrid drums, deep dubstep sub bass, ghostly pitched vocal fragments, rain-soaked ambience, soft pads, negative space and intimate nocturnal emotion.';
  }
  if (genre === 'uk garage') {
    return 'UK Garage Future Garage. authentic future garage descended from UK 2-step, skippy shuffled drums, warm deep sub, chopped and pitched R&B vocal ghosts, soft chord haze, rain-textured ambience and emotional late-night London swing.';
  }
  return null;
}

async function withFutureGarageDisambiguation(request) {
  let body;
  try { body = await request.clone().json(); } catch { return request; }
  const signature = futureGarageVariant(body);
  if (!signature) return request;

  const mood = String(body?.mood || '').trim();
  const mode = normalize(body?.vocalMode || body?.vocal_mode || '');
  const vocal = mode === 'instrumental'
    ? 'Instrumental, no vocals.'
    : 'Use sparse, intimate, chopped or breathy vocal phrasing appropriate to future garage.';
  const opening = 'Start immediately with the defining shuffled/half-time groove or sub texture in bar 1; Future Garage identity clear by 8 seconds; no extended intro.';
  const prompt = `${signature} ${mood ? `Mood: ${mood}.` : ''} ${vocal} ${opening}`.replace(/\s+/g, ' ').trim().slice(0, 500);

  const requestedStyleInfluence = Number(body.styleInfluence ?? body.style_influence ?? 50);
  const requestedWeirdness = Number(body.weirdness ?? 50);
  const locked = {
    ...body,
    prompt,
    styleInfluence: Math.max(92, Number.isFinite(requestedStyleInfluence) ? requestedStyleInfluence : 92),
    weirdness: Math.min(60, Number.isFinite(requestedWeirdness) ? requestedWeirdness : 50),
    sonaraGenreLock: 'electronic-v13-taxonomy89-futuregarage2'
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('x-sonara-genre-lock', 'electronic-v13-taxonomy89-futuregarage2');
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(locked),
    redirect: request.redirect
  });
}

async function decorateHealth(request, response) {
  const url = new URL(request.url);
  if (!(url.pathname === '/' || url.pathname === '/api/health' || url.pathname === '/api/engine/ready')) return response;
  if (!response.ok) return response;
  try {
    const data = await response.clone().json();
    return new Response(JSON.stringify({
      ...data,
      electronicTaxonomyLock: 'v13-taxonomy89',
      electronicTaxonomySelections: 89,
      futureGarageVariants: 2
    }), { status: response.status, headers: response.headers });
  } catch {
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const lockedRequest = url.pathname === '/api/engine/generate' && request.method === 'POST'
      ? await withFutureGarageDisambiguation(request)
      : request;
    const response = await engineV12.fetch(lockedRequest, env, ctx);
    return decorateHealth(request, response);
  }
};
