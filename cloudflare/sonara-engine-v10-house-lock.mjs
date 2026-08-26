import engineV9 from './sonara-engine-v9-dual-fast.mjs';

const HOUSE_SIGNATURES = {
  'house': 'Chicago-rooted house, 4/4 four-on-floor kick, clap/snare on 2 and 4, offbeat open hats, shuffled percussion, syncopated rounded bass, soulful piano/organ or sample hook, warm club mix.',
  'classic house': 'late-80s/early-90s classic house, 909/707/808 drum-machine swing, M1-style piano or organ, analog bass, disco/soul vocal or sample fragments, raw sampler-era warmth.',
  'chicago house': 'raw jacking Chicago house, 909/707/808 drums, strong clap, offbeat hats, swung percussion, punchy mono bass, piano/organ vamp, chopped disco/soul samples, warehouse energy.',
  'deep house': 'authentic deep house, warm soft 909-style four-on-floor, rounded deep bass, Rhodes/electric piano, organ or muted chord stabs, jazzy 7th/9th harmony, lightly swung hats, soulful hypnotic late-night mix.',
  'tech house': 'authentic tech house, tight punchy kick, elastic mono bass phrase, crisp clap, pronounced 16th-note shuffle, rolling hats and syncopated percussion, clipped vocal hook, sparse stabs, minimal harmony, dry club mix.',
  'progressive house': 'authentic progressive house, rolling four-on-floor groove, deep bass, evolving pads, delayed plucks and arpeggios, repeating melodic motif, long 16/32-bar development, gradual tension and smooth emotional release.',
  'melodic house': 'authentic melodic house, warm house kick and bass, crisp percussion, emotional chord progression, plucks, arpeggiators, warm pads and expressive melodic synth lead, polished deep mix with clear house groove.',
  'afro house': 'authentic Afro House, grounded four-on-floor pulse, deep bass, interlocking African-rooted polyrhythmic percussion, shakers and hand drums, organic plucks or mallets, deep modal harmony, warm spiritual groove.',
  'tribal house': 'authentic tribal house, punchy four-on-floor kick, rolling bass, dense interlocking congas, toms, bongos and shakers, sparse stabs and drones, percussion-forward hypnotic club arrangement.',
  'soulful house': 'authentic soulful house, warm house groove, Rhodes/piano/Hammond organ, syncopated live-feeling bass, gospel/soul 7th and 9th chords, handclaps, expressive soulful vocal or lead, uplifting organic mix.',
  'funky house': 'authentic funky house, punchy house drums, strong swing, syncopated funk/disco bass, guitar chops, brass or string stabs, piano/organ and rhythmic disco/soul sample hooks, bright energetic club feel.',
  'french house': 'authentic French touch house, chopped disco/funk sample loop, 909-style drums, warm bass, resonant low-pass filtering, saturated sample texture, strong musical sidechain pump, glossy gritty late-90s/2000s character.',
  'filter house': 'authentic filter house, looped disco/funk/chord sample, four-on-floor drums, sample swing, resonant low/high-pass filter automation, staged frequency reveal, pumping dynamics and filter-driven tension-release.',
  'disco house': 'authentic disco house, four-on-floor house drums supporting disco bass, rhythm guitar, strings, brass, piano and handclaps, soulful 7th/9th harmony, celebratory live-feeling syncopation and club-ready mix.',
  'jackin house': 'authentic jackin house, rugged snapping drums, pronounced swing, shuffling hats, elastic bass, chopped funk/jazz/disco/R&B samples, filter stabs and rhythmic vocal snippets, raw Chicago-descended jacking groove.',
  'acid house': 'authentic acid house, TB-303-style resonant sequenced bassline as the main voice, evolving cutoff/resonance/envelope/accent pattern, raw 808/909 house drums, jacking hats, sparse stabs and warehouse hypnosis.',
  'electro house': 'authentic electro house, huge punchy four-on-floor kick, distorted saw/square mid-bass riff, bright aggressive synth hook, layered clap, tight hats, concise build/drop contrast and forward midrange club production.',
  'future house': 'authentic future house, clean 4/4 drums, bouncy pitch-modulated/plucky bass, bright chord stabs, glossy vocal chops, sharp offbeat accents, catchy modern hook and controlled sidechain pump.',
  'bass house': 'authentic bass house, heavy four-on-floor kick, powerful mono sub plus distorted/wavetable mid-bass, syncopated bass call-and-response, crisp hats, clipped vocal chops and dark sparse tonal stabs.',
  'big room house': 'authentic big room house, oversized four-on-floor kick, sparse festival drop rhythm, simple huge lead or supersaw motif, sub reinforcement, snare-roll build, risers and impacts, massive crowd-scale tension-release.',
  'organic house': 'authentic organic house, softer deep four-on-floor pulse, rounded bass, hand percussion, acoustic/plucked instruments, mallets or piano, open modal harmony, warm pads and natural spacious room texture.',
  'latin house': 'authentic Latin house, four-on-floor club kick and bass with clave-aware syncopation, congas/bongos/timbales/cowbell/shakers, tumbao-informed bass or piano, Latin/soul chord stabs and bright rhythmic energy.',
  'minimal house': 'authentic minimal house, dry short kick, compact mono bass, nuanced swing, clicks, rimshots, tiny hats and shakers, micro vocal cuts, sparse chord stabs, negative space and microscopic groove changes.',
  'microhouse': 'authentic microhouse, soft house pulse, sub bass, clicks, pops and tiny percussion edits, sliced micro-vocals, chord grains, shuffled fragments and delicate sample-level mutations with intimate detailed mix.',
  'lo fi house': 'authentic lo-fi house, dusty softened four-on-floor drums, loose swing, warm bass, detuned piano/synth 7th or 9th chords, tape/sampler saturation, vinyl texture, hazy samples and nostalgic late-night groove.',
  'g house': 'authentic G-House, dark four-on-floor groove, deep distorted bass, dry clap and hats, sparse minor-key stabs, rap/spoken vocal chops and swaggering hip-hop attitude while retaining a house pulse.',
  'garage house': 'authentic US garage house, soulful New York/New Jersey four-on-floor swing, warm bass, organ and piano, lively hats, handclaps, gospel/R&B 7th/9th harmony and powerful soulful vocal character.',
  'hard house': 'authentic hard house, fast forceful four-on-floor kick, driving or offbeat bass, rave stabs and hoover-like synths, bright hats, snare-roll builds and relentless high-energy club momentum.',
  'piano house': 'authentic piano house, upfront rhythmic house-piano riff as the main hook, punchy four-on-floor kick, clap, offbeat hats, warm syncopated bass, uplifting gospel/soul-influenced chord progression and bright club mix.'
};

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function isHouseRequest(body) {
  return normalize(body?.genre) === 'house' && normalize(body?.genreFamily || body?.genre_family || 'electronic dance') === 'electronic dance';
}

function vocalTag(body) {
  const mode = normalize(body?.vocalMode || body?.vocal_mode || '');
  if (mode === 'instrumental') return 'Instrumental, no vocals.';
  if (mode === 'male') return 'Natural male lead vocal.';
  if (mode === 'female') return 'Natural female lead vocal.';
  if (mode === 'duet') return 'Distinct male and female duet.';
  return '';
}

function buildHouseCaption(body) {
  const key = normalize(body?.subgenre || 'house');
  const subgenre = String(body?.subgenre || 'House').trim();
  const signature = HOUSE_SIGNATURES[key] || HOUSE_SIGNATURES.house;
  const mood = String(body?.mood || '').trim();
  const voice = vocalTag(body);
  const opening = 'Start immediately: kick or defining groove in bar 1, signature bass/hook established by 8 seconds; no extended intro.';
  const caption = `${subgenre}. ${signature} ${mood ? `Mood: ${mood}.` : ''} ${voice} ${opening}`.replace(/\s+/g, ' ').trim();
  return caption.slice(0, 500);
}

function houseStructureLyrics(body) {
  const lyrics = String(body?.lyrics || '').trim();
  const mode = normalize(body?.vocalMode || body?.vocal_mode || '');
  if (lyrics) return lyrics;
  if (mode !== 'instrumental') return lyrics;
  return '[Intro - 2 bars]\n[Instrumental - main groove]\n[Breakdown]\n[Instrumental - main groove]\n[Outro]';
}

async function withHouseLock(request) {
  let body;
  try {
    body = await request.clone().json();
  } catch {
    return request;
  }
  if (!isHouseRequest(body)) return request;

  const requestedStyleInfluence = Number(body.styleInfluence ?? body.style_influence ?? 50);
  const requestedWeirdness = Number(body.weirdness ?? 50);
  const locked = {
    ...body,
    prompt: buildHouseCaption(body),
    lyrics: houseStructureLyrics(body),
    styleInfluence: Math.max(90, Number.isFinite(requestedStyleInfluence) ? requestedStyleInfluence : 90),
    weirdness: Math.min(65, Number.isFinite(requestedWeirdness) ? requestedWeirdness : 50),
    sonaraGenreLock: 'house-v10-caption500-intro8'
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('x-sonara-genre-lock', 'house-v10-caption500-intro8');
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
      houseGenreLock: 'v10-caption500',
      houseIntroMaxSeconds: 8,
      houseStyleInfluenceFloor: 90,
      houseWeirdnessCeiling: 65
    }), {
      status: response.status,
      headers: response.headers
    });
  } catch {
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const lockedRequest = url.pathname === '/api/engine/generate' && request.method === 'POST'
      ? await withHouseLock(request)
      : request;
    const response = await engineV9.fetch(lockedRequest, env, ctx);
    return decorateHealth(request, response);
  }
};
