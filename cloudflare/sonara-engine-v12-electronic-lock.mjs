import engineV11 from './sonara-engine-v11-house-techno-lock.mjs';

const ELECTRONIC_SIGNATURES = {
  // Trance (13)
  'classic trance': 'classic trance, 138-style four-on-floor drive, 909 drums, rolling bass, supersaw chords, bright arpeggios, emotional lead melody and long euphoric breakdown-release.',
  'progressive trance': 'progressive trance, deep rolling kick and bass, restrained arpeggios, evolving pads, subtle plucks, long-form tension, gradual layering and smooth melodic payoff.',
  'uplifting trance': 'uplifting trance, energetic four-on-floor kick, driving bass, huge emotional breakdown, airy pads, piano or pluck motif, soaring supersaw lead and euphoric climax.',
  'vocal trance': 'vocal trance, driving trance rhythm, clear emotional lead vocal, wide chords, melodic arpeggios, large breakdown and anthemic vocal chorus over a powerful trance drop.',
  'psytrance': 'psytrance, tight kick and rolling offbeat/16th bass, psychedelic acid sequences, syncopated percussion, evolving FX, hypnotic motifs and relentless trance momentum.',
  'goa trance': 'Goa trance, rolling psychedelic bass, layered 303-style acid lines, eastern/modal arpeggios, cosmic leads, dense sequencing and long kaleidoscopic development.',
  'full on psytrance': 'full-on psytrance, punchy kick, fast rolling bass, bright aggressive leads, acid accents, rapid fills, high-energy builds and sharp psychedelic drops.',
  'dark psytrance': 'dark psytrance, fast kick and rolling bass, ominous drones, dissonant psychedelic textures, alien FX, dense night-time percussion and threatening hypnotic motion.',
  'forest psytrance': 'forest psytrance, rolling bass, organic tribal percussion, wet woodland textures, strange creature-like synths, dark psychedelic micro-edits and immersive nocturnal atmosphere.',
  'tech trance': 'tech trance, hard techno-informed kick, driving bass, sharp trance stabs, acid lines, metallic percussion, concise breakdown and forceful peak-time trance drop.',
  'hard trance': 'hard trance, fast hard kick, driving bass, rave stabs, hoover-like synths, bright arpeggios, snare-roll builds and aggressive euphoric lead release.',
  'dream trance': 'dream trance, soft trance pulse, dreamy piano, warm pads, gentle arpeggios, nostalgic lead melody and floating emotional atmosphere.',
  'balearic trance': 'Balearic trance, warm four-on-floor rhythm, sunlit guitars or plucks, airy pads, open major/modal harmony, oceanic ambience and expansive uplifting melody.',

  // Drum & Bass (11)
  'liquid drum bass': 'liquid drum and bass, fast clean breakbeats, warm sub bass, soulful chords, Rhodes or pads, gentle vocal character and fluid emotional rolling groove.',
  jungle: 'jungle, chopped Amen breaks, rapid break edits, deep sub bass, ragga/rave sample energy, syncopated percussion and raw 1990s warehouse momentum.',
  neurofunk: 'neurofunk, precise fast drum programming, heavy modulated reese/neuro bass, dark sci-fi textures, tight fills, aggressive low-mid movement and futuristic pressure.',
  'jump up': 'jump-up drum and bass, punchy fast drums, bouncy call-and-response bass riffs, playful wobble movement, clipped vocal hooks and direct high-energy dancefloor groove.',
  techstep: 'techstep, cold tight breakbeats, dark reese bass, metallic sci-fi ambience, sparse atonal stabs, controlled tension and dystopian rolling momentum.',
  darkstep: 'darkstep, aggressive breakbeats, distorted reese/sub bass, industrial noise, dark drones, harsh fills and relentless menacing drum-and-bass pressure.',
  drumfunk: 'drumfunk, highly detailed chopped breakbeats, ghost notes, intricate snare edits, organic drum texture, restrained bass and rhythmic micro-variation as the main focus.',
  'atmospheric dnb': 'atmospheric drum and bass, light fast breaks, deep sub, wide pads, ambient textures, gentle melodic fragments and spacious cinematic rolling depth.',
  'dancefloor dnb': 'dancefloor drum and bass, polished fast drums, powerful sub and mid-bass, bright melodic hook, huge build, vocal or synth anthem and festival-scale drop.',
  'minimal dnb': 'minimal drum and bass, stripped fast drums, deep sub bass, sparse clicks and percussion, negative space, tiny tonal fragments and restrained hypnotic movement.',
  'ragga jungle': 'ragga jungle, chopped Amen breaks, heavy jungle sub, dancehall/ragga vocal phrases, dub sirens, energetic edits and raw sound-system rave character.',

  // Dubstep (9)
  'uk dubstep': 'authentic UK dubstep, around 140 BPM half-time feel, enormous clean sub bass, sparse swung drums, dark atmospheres, minimal midrange, dub space and London sound-system weight.',
  'deep dubstep': 'deep dubstep, low sub-focused bass, half-time sparse drums, restrained percussion, dark pads, dub echoes and meditative spacious pressure.',
  brostep: 'brostep, huge half-time drums, aggressive growl and talking mid-bass sound design, bright synth layers, dramatic builds and high-impact bass drops.',
  riddim: 'riddim dubstep, repetitive square/wonk bass patterns, minimal half-time drums, syncopated bass gaps, clipped vocal chops and hypnotic heavy repetition.',
  'melodic dubstep': 'melodic dubstep, emotional chords, airy vocal chops, cinematic pads, half-time drums, powerful sub and melodic bass drop with clear harmonic resolution.',
  'future garage': 'future garage, fragile 2-step rhythm, deep sub bass, pitched/chopped vocals, rain-like ambience, soft pads and intimate nocturnal atmosphere.',
  'post dubstep': 'post-dubstep, deconstructed bass rhythm, sparse syncopated drums, sub bass, electronic soul chords, textural vocals and experimental spacious production.',
  chillstep: 'chillstep, soft half-time drums, warm sub bass, dreamy pads, gentle plucks, emotional vocal textures and relaxed melodic bass movement.',
  deathstep: 'deathstep, brutal half-time drums, extreme distorted bass growls, metallic impacts, horror ambience, aggressive fills and punishing high-density drops.',

  // UK Garage (7)
  '2 step garage': '2-step UK garage, syncopated kick pattern, snare on displaced beats, shuffled hats, warm sub/bassline, chopped R&B vocals and lively London swing.',
  'speed garage': 'speed garage, fast 4x4 and 2-step hybrid drums, reese bass, pitched vocals, skippy hats, organ/chord stabs and high-energy UK club swing.',
  bassline: 'UK bassline, bouncy oversized bass riff, tight 4x4/garage drums, bright vocal chops, snappy percussion and direct Sheffield-style club energy.',
  'future garage': 'future garage, loose 2-step drums, deep sub, pitched ghostly vocals, ambient pads, rain-soaked texture and emotional late-night space.',
  'uk funky': 'UK funky, syncopated house/garage rhythm, Afro-Latin percussion, rolling bass, clipped vocal hooks and warm percussive club groove.',
  niche: 'Niche bassline, fast 4x4 garage drums, bouncy bassline, bright organ/synth stabs, vocal garage hooks and energetic Sheffield club character.',
  '4x4 garage': '4x4 garage, four-on-floor kick with strong garage shuffle, swinging hats, warm UK bassline, chopped vocals and bright organ/chord stabs.',

  // Breakbeat (7)
  breaks: 'modern breaks, punchy broken beat drums, syncopated funk bass, crisp snares, electronic stabs and club-focused broken-groove momentum.',
  'big beat': 'big beat, huge sampled breakbeats, rock/funk samples, distorted bass, bold synth riffs, cinematic impacts and oversized late-90s energy.',
  'nu skool breaks': 'nu skool breaks, heavy precise broken drums, acid or reese bass, futuristic synth effects, tight edits and dark progressive club pressure.',
  'florida breaks': 'Florida breaks, electro-influenced broken drums, Miami-style bass, bright rave synths, playful samples and energetic sunlit club feel.',
  'electro breaks': 'electro breaks, robotic broken beat, 808 bass, syncopated electro percussion, vocoder fragments and futuristic machine-funk groove.',
  'progressive breaks': 'progressive breaks, deep broken rhythm, evolving pads, rolling bass, long melodic development and gradual tension-release.',
  'broken beat': 'broken beat, jazz/funk-informed syncopation, complex off-grid drums, warm bass, soulful keys and loose sophisticated rhythmic feel.',

  // Hard Dance (10)
  hardstyle: 'hardstyle, powerful reverse-bass or modern punch kick, offbeat bass motion, rave stabs, supersaw anthem lead and large tension-climax structure.',
  rawstyle: 'rawstyle, heavily distorted raw kicks, screeches, dark stabs, aggressive fills, sparse melody and uncompromising high-pressure drive.',
  'euphoric hardstyle': 'euphoric hardstyle, clean powerful kicks, emotional vocal or piano theme, huge supersaw melody, uplifting breakdown and festival climax.',
  hardcore: 'hardcore, very fast hard distorted kicks, rave stabs, bright/aggressive synths, rapid fills and relentless high-energy momentum.',
  gabber: 'gabber, fast distorted kick as dominant element, simple rave stabs, shouted samples, abrasive percussion and raw Dutch hardcore energy.',
  frenchcore: 'Frenchcore, very fast elastic distorted kicks, offbeat bass feel, manic melodic motifs, rave samples and relentless high-speed pressure.',
  'uptempo hardcore': 'uptempo hardcore, extremely fast aggressive kicks, piep/zaag-style kick timbres, short brutal fills, sparse riffs and nonstop pressure.',
  'happy hardcore': 'happy hardcore, very fast breakbeat/4x4 energy, euphoric piano, bright synths, cheerful vocal hooks and uplifting rave melody.',
  'hard dance': 'hard dance, forceful fast four-on-floor kick, rave bassline, bright lead hook, snare builds and direct main-room impact.',
  makina: 'makina, very fast four-on-floor drive, bouncing bass, bright rave melodies, rapid arpeggios and high-energy Spanish rave character.',

  // Electro (6)
  electro: 'electro, syncopated 808 drum-machine beat, robotic bassline, sharp claps, futuristic synth stabs, vocoder details and machine-funk groove.',
  'electro funk': 'electro-funk, 808 beat, funky synth bass, vocoder/talkbox textures, bright synth chords and breakdance-ready groove.',
  electroclash: 'electroclash, dry drum machines, cold analog synth bass, simple synth riffs, detached vocal attitude and electro-punk club edge.',
  'miami bass': 'Miami bass, booming 808 sub, sharp claps, fast electro rhythm, party chants and bright minimal synth hooks.',
  freestyle: 'freestyle, Latin-influenced drum-machine syncopation, romantic synth chords, bright bassline and emotional 1980s dance vocal character.',
  'nu electro': 'nu electro, precise modern 808/electro rhythm, modular bass movement, futuristic textures, crisp syncopation and polished machine-funk production.',

  // Ambient Electronic (9)
  ambient: 'ambient electronic, no mandatory beat, long evolving pads, soft drones, delicate harmonic overtones, wide reverb and slow immersive development.',
  'dark ambient': 'dark ambient, low drones, ominous textures, distant metallic noise, deep reverb, minimal harmony and cinematic tension without a dominant beat.',
  drone: 'drone music, sustained tones, slowly shifting harmonics, minimal events, deep resonance and near-static long-form transformation.',
  'space ambient': 'space ambient, cosmic pads, huge reverbs, slow synth swells, distant tonal signals and weightless orbital atmosphere.',
  chillout: 'chillout, relaxed downtempo beat, warm bass, soft pads, gentle melody and spacious sunset atmosphere.',
  downtempo: 'downtempo electronic, slow broken or straight groove, soft bass, organic percussion, warm keys and detailed relaxed production.',
  psybient: 'psybient, slow psychedelic percussion, deep bass, cosmic pads, ethnic/organic textures, trippy effects and meditative journey.',
  illbient: 'illbient, dark urban ambient collage, dub bass, abstract beats, field recordings, noise textures and uneasy city atmosphere.',
  'new age electronic': 'new age electronic, luminous pads, delicate arpeggios, soft bells, spacious harmony and serene contemplative atmosphere.',

  // IDM / Experimental Electronic (10)
  idm: 'IDM, complex programmed beats, irregular accents, detailed digital percussion, unusual synth timbres, oblique melody and cerebral rhythmic variation.',
  glitch: 'glitch, rhythmic digital errors, stutters, clicks, buffer edits, tiny fragments and deliberately broken electronic texture.',
  'glitch hop': 'glitch hop, broken hip-hop groove, swung drums, heavy glitch bass, chopped edits, digital funk and playful syncopation.',
  braindance: 'braindance, intricate drum programming, melodic acid lines, playful synths, abrupt edits and eccentric intelligent dance energy.',
  microsound: 'microsound, grains, clicks, tiny pulses, microscopic edits, sparse tonal particles and extremely detailed quiet texture.',
  'deconstructed club': 'deconstructed club, fragmented asymmetric club rhythms, huge isolated impacts, radical negative space, distorted samples and unstable structure.',
  wonky: 'wonky, crooked off-grid swing, unstable synth chords, lopsided bass, playful dissonance and deliberately skewed groove.',
  vaporwave: 'vaporwave, slowed nostalgic samples, detuned digital texture, lush reverb, soft drums and hazy retro-consumer ambience.',
  mallsoft: 'mallsoft, distant muzak-like samples, huge empty indoor reverb, soft low-end, blurred nostalgia and abandoned shopping-mall atmosphere.',
  'future funk': 'future funk, chopped disco/J-pop samples, bright sidechain pump, funky bass, glossy drums and fast nostalgic dance energy.',

  // Synthwave (7)
  synthwave: 'synthwave, 1980s drum-machine groove, gated snare, pulsing synth bass, analog arpeggios, cinematic lead and neon retro-futurist atmosphere.',
  retrowave: 'retrowave, nostalgic analog synth chords, drum machines, warm bass, VHS-like texture and romantic metropolitan night mood.',
  outrun: 'outrun, fast driving synth bass, energetic electronic drums, bright arpeggios, heroic lead melody and neon-highway momentum.',
  darksynth: 'darksynth, distorted analog bass, aggressive synth riffs, hard electronic drums, horror textures and menacing retro-futurist atmosphere.',
  dreamwave: 'dreamwave, soft analog drums, lush pads, gentle synth bass, dreamy lead melody and bright nostalgic haze.',
  cyberpunk: 'cyberpunk synthwave, industrial electronic drums, distorted synth bass, neon-noir textures, aggressive arpeggios and dystopian futuristic atmosphere.',
  spacewave: 'spacewave, cosmic analog pads, pulsing arpeggios, retro electronic drums, starry lead motifs and expansive retro-futurist journey.'
};

const SUPPORTED_GENRES = new Set([
  'trance', 'drum bass', 'dubstep', 'uk garage', 'breakbeat', 'hard dance',
  'electro', 'ambient electronic', 'idm experimental electronic', 'synthwave'
]);

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

function isSupportedElectronic(body) {
  const family = normalize(body?.genreFamily || body?.genre_family || 'electronic dance');
  return family === 'electronic dance' && SUPPORTED_GENRES.has(normalize(body?.genre));
}

function vocalTag(body) {
  const mode = normalize(body?.vocalMode || body?.vocal_mode || '');
  if (mode === 'instrumental') return 'Instrumental, no vocals.';
  if (mode === 'male') return 'Natural male vocal phrasing appropriate to this electronic subgenre.';
  if (mode === 'female') return 'Natural female vocal phrasing appropriate to this electronic subgenre.';
  if (mode === 'duet') return 'Distinct male and female duet phrasing appropriate to this electronic subgenre.';
  return '';
}

function buildCaption(body) {
  const subgenre = String(body?.subgenre || '').trim();
  const signature = ELECTRONIC_SIGNATURES[normalize(subgenre)] || `${subgenre}, authentic electronic production faithful to the selected subgenre.`;
  const mood = String(body?.mood || '').trim();
  const voice = vocalTag(body);
  const opening = 'Start immediately: defining rhythm, bass or signature texture in bar 1; subgenre identity clearly established by 8 seconds; no extended intro.';
  return `${subgenre}. ${signature} ${mood ? `Mood: ${mood}.` : ''} ${voice} ${opening}`.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function structureLyrics(body) {
  const lyrics = String(body?.lyrics || '').trim();
  const mode = normalize(body?.vocalMode || body?.vocal_mode || '');
  if (lyrics) return lyrics;
  if (mode !== 'instrumental') return lyrics;
  return '[Intro - 2 bars]\n[Instrumental - defining subgenre groove]\n[Development]\n[Breakdown]\n[Instrumental - main groove]\n[Outro]';
}

async function withElectronicLock(request) {
  let body;
  try { body = await request.clone().json(); } catch { return request; }
  if (!isSupportedElectronic(body)) return request;

  const requestedStyleInfluence = Number(body.styleInfluence ?? body.style_influence ?? 50);
  const requestedWeirdness = Number(body.weirdness ?? 50);
  const locked = {
    ...body,
    prompt: buildCaption(body),
    lyrics: structureLyrics(body),
    styleInfluence: Math.max(92, Number.isFinite(requestedStyleInfluence) ? requestedStyleInfluence : 92),
    weirdness: Math.min(60, Number.isFinite(requestedWeirdness) ? requestedWeirdness : 50),
    sonaraGenreLock: 'electronic-v12-caption500-intro8'
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('x-sonara-genre-lock', 'electronic-v12-caption500-intro8');
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
      electronicGenreLock: 'v12-caption500',
      electronicIntroMaxSeconds: 8,
      electronicStyleInfluenceFloor: 92,
      electronicWeirdnessCeiling: 60,
      electronicLockedGenres: 10,
      electronicSubgenreProfiles: Object.keys(ELECTRONIC_SIGNATURES).length
    }), { status: response.status, headers: response.headers });
  } catch {
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const lockedRequest = url.pathname === '/api/engine/generate' && request.method === 'POST'
      ? await withElectronicLock(request)
      : request;
    const response = await engineV11.fetch(lockedRequest, env, ctx);
    return decorateHealth(request, response);
  }
};
