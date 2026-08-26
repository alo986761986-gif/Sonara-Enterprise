import engineV10 from './sonara-engine-v10-house-lock.mjs';

const TECHNO_SIGNATURES = {
  'detroit techno': 'authentic Detroit techno, futuristic machine funk, punchy 909 kick, syncopated percussion, metallic chords and stabs, elastic bass sequence, soulful but mechanical synth motifs, disciplined groove and spacious industrial city atmosphere.',
  'minimal techno': 'authentic minimal techno, dry compact kick, restrained mono bass pulse, microscopic percussion, clicks, rimshots and short hats, tiny filtered stabs, negative space, subtle loop mutations and hypnotic functional club tension.',
  'dub techno': 'authentic dub techno, deep restrained four-on-floor pulse, sub bass, chord stabs drenched in tape delay and reverb, filtered echoes, hiss and spacious ambience, slow modulation, foggy depth and hypnotic repetition.',
  'acid techno': 'authentic acid techno, forceful techno kick, TB-303-style resonant sequenced bassline, aggressive cutoff/resonance/envelope/accent movement, driving hats and percussion, raw warehouse pressure and relentless acid modulation.',
  'industrial techno': 'authentic industrial techno, hard distorted kick, metallic percussion, machine impacts, noise textures, grinding drones, cold atonal stabs, sparse harmony, brutal repetitive warehouse mechanics and controlled saturation.',
  'hard techno': 'authentic hard techno, very forceful fast four-on-floor kick, rumble or distorted low end, pounding percussion, rave or industrial stabs, high-pressure hats, short tension builds and relentless physical club momentum.',
  'peak time techno': 'authentic peak-time techno, driving four-on-floor kick and rumble, rolling bass, energetic percussion, bold repeating synth riff, tension risers, snare builds and decisive high-impact drops built for maximum main-room pressure.',
  'hypnotic techno': 'authentic hypnotic techno, steady deep kick, rolling low end, layered polyrhythmic percussion, subtle evolving loops, dark drones, restrained tonal motifs, gradual micro-variation and immersive long-form repetition.',
  'melodic techno': 'authentic melodic techno, powerful techno kick and low-end drive, emotional minor-key progression, arpeggiators, evolving pads, cinematic synth lead, controlled tension-release and a dark polished club mix without losing techno pulse.',
  'ambient techno': 'authentic ambient techno, restrained soft techno pulse, spacious sub bass, atmospheric pads, granular textures, distant percussion, slowly evolving synth layers, minimal melodic fragments and wide immersive spatial depth.',
  'schranz': 'authentic Schranz, very fast hard techno drive, compressed pounding kick, hammering looped percussion, clipped industrial samples, aggressive repetitive edits, minimal harmony and nonstop high-density pressure.',
  'birmingham techno': 'authentic Birmingham techno, austere hard machine rhythm, dry punchy kick, metallic percussion, stripped repetitive patterns, cold industrial textures, sparse atonal stabs and disciplined uncompromising warehouse minimalism.',
  'raw techno': 'authentic raw techno, rough unpolished drum-machine groove, punchy kick, dirty rolling low end, dry hats and claps, raw stabs, saturated samples and direct warehouse energy with minimal polish.',
  'deep techno': 'authentic deep techno, weighty but restrained kick, submerged bass, dark layered percussion, low drones, sparse chord or tonal fragments, long hypnotic evolution and immersive underground depth.'
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

function isTechnoRequest(body) {
  return normalize(body?.genre) === 'techno' && normalize(body?.genreFamily || body?.genre_family || 'electronic dance') === 'electronic dance';
}

function vocalTag(body) {
  const mode = normalize(body?.vocalMode || body?.vocal_mode || '');
  if (mode === 'instrumental') return 'Instrumental, no vocals.';
  if (mode === 'male') return 'Natural male lead vocal with concise techno phrasing.';
  if (mode === 'female') return 'Natural female lead vocal with concise techno phrasing.';
  if (mode === 'duet') return 'Distinct male and female duet using concise techno phrases.';
  return '';
}

function buildTechnoCaption(body) {
  const key = normalize(body?.subgenre || 'detroit techno');
  const subgenre = String(body?.subgenre || 'Detroit Techno').trim();
  const signature = TECHNO_SIGNATURES[key] || TECHNO_SIGNATURES['detroit techno'];
  const mood = String(body?.mood || '').trim();
  const voice = vocalTag(body);
  const opening = 'Start immediately: kick, pulse or defining machine groove in bar 1; signature rhythmic identity established by 8 seconds; no extended intro.';
  return `${subgenre}. ${signature} ${mood ? `Mood: ${mood}.` : ''} ${voice} ${opening}`.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function technoStructureLyrics(body) {
  const lyrics = String(body?.lyrics || '').trim();
  const mode = normalize(body?.vocalMode || body?.vocal_mode || '');
  if (lyrics) return lyrics;
  if (mode !== 'instrumental') return lyrics;
  return '[Intro - 2 bars]\n[Instrumental - defining techno groove]\n[Development]\n[Breakdown]\n[Instrumental - main techno groove]\n[Outro]';
}

async function withTechnoLock(request) {
  let body;
  try {
    body = await request.clone().json();
  } catch {
    return request;
  }
  if (!isTechnoRequest(body)) return request;

  const requestedStyleInfluence = Number(body.styleInfluence ?? body.style_influence ?? 50);
  const requestedWeirdness = Number(body.weirdness ?? 50);
  const locked = {
    ...body,
    prompt: buildTechnoCaption(body),
    lyrics: technoStructureLyrics(body),
    styleInfluence: Math.max(92, Number.isFinite(requestedStyleInfluence) ? requestedStyleInfluence : 92),
    weirdness: Math.min(60, Number.isFinite(requestedWeirdness) ? requestedWeirdness : 50),
    sonaraGenreLock: 'techno-v11-caption500-intro8'
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('x-sonara-genre-lock', 'techno-v11-caption500-intro8');
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
      technoGenreLock: 'v11-caption500',
      technoIntroMaxSeconds: 8,
      technoStyleInfluenceFloor: 92,
      technoWeirdnessCeiling: 60,
      technoSubgenreProfiles: Object.keys(TECHNO_SIGNATURES).length
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
      ? await withTechnoLock(request)
      : request;
    const response = await engineV10.fetch(lockedRequest, env, ctx);
    return decorateHealth(request, response);
  }
};
