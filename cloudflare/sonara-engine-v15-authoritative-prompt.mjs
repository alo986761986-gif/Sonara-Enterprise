import engineV9 from './sonara-engine-v9-dual-fast.mjs';

const LOCK_ID = 'v15-authoritative-ui-taxonomy-v5';
const TEMPO_LOCK_ID = 'v15-authoritative-bpm-v5-ui';
const PROMPT_INTELLIGENCE_ID = 'sonara-prompt-intelligence-v2';
const COHERENCE_CRITIC_ID = 'sonara-musical-coherence-critic-v1';
const MAX_PROMPT_CHARS = 1800;
const MAX_CREATOR_BRIEF_CHARS = 620;
const BPM_MIN = 40;
const BPM_MAX = 220;

function clean(value, fallback = '') {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function parseBpm(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, numeric)));
  const match = String(value ?? '').match(/\b(\d{2,3})\s*(?:bpm)?\b/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, parsed))) : null;
}

function extractPromptBpm(value) {
  const prompt = String(value ?? '').trim();
  if (!prompt) return null;
  const explicit = prompt.match(/\b(?:at|a|@|tempo[:\s]*)?\s*(\d{2,3})\s*bpm\b/i)
    || prompt.match(/\bbpm\s*[:=]?\s*(\d{2,3})\b/i);
  return explicit ? parseBpm(explicit[1]) : null;
}

function resolveBpm(body = {}) {
  const candidates = [
    body?.bpm,
    body?.requestedBpm,
    body?.requested_bpm,
    body?.targetBpm,
    body?.target_bpm,
    body?.preferredBpm,
    body?.preferred_bpm,
    body?.tempo
  ];
  for (const candidate of candidates) {
    const bpm = parseBpm(candidate);
    if (bpm !== null) return bpm;
  }

  const creatorPrompt = body?.rawPrompt || body?.creatorPrompt || body?.creator_prompt || body?.musicPrompt || '';
  return extractPromptBpm(creatorPrompt) ?? extractPromptBpm(body?.prompt);
}

function tempoProfile(bpm, body = {}) {
  const styleText = clean(`${body?.rawPrompt || ''} ${body?.creatorPrompt || ''} ${body?.prompt || ''} ${body?.genre || ''} ${body?.subgenre || ''}`).toLowerCase();
  const halfTimeExplicit = /\bhalf[- ]?time\b|\btempo dimezzato\b|\bmetà tempo\b/i.test(styleText);
  const fastBassMusic = /\bjungle\b|\bdrum\s*(?:&|and)\s*bass\b|\bdnb\b|\bbreakcore\b|\bhardcore\b/i.test(styleText);

  if (bpm >= 180) return { id: 'extreme-fast', label: 'extremely-fast', instruction: `full-time ${bpm} BPM motion${halfTimeExplicit ? '; half-time accents only as an effect' : '; never reinterpret as half-time'}` };
  if (bpm >= 160) return { id: 'very-fast', label: 'very-fast', instruction: `${bpm} BPM must feel genuinely full-time${fastBassMusic ? ' with rapid breakbeat/percussion motion' : ''}` };
  if (bpm >= 145) return { id: 'fast', label: 'fast', instruction: `audibly fast full-time groove at ${bpm} BPM` };
  if (bpm >= 130) return { id: 'uptempo', label: 'uptempo', instruction: `energetic full-time pulse at ${bpm} BPM` };
  if (bpm >= 110) return { id: 'mid-fast', label: 'mid-fast', instruction: `steady forward-moving groove at ${bpm} BPM` };
  if (bpm >= 90) return { id: 'medium', label: 'medium', instruction: `groove and phrasing anchored to ${bpm} BPM` };
  if (bpm >= 70) return { id: 'relaxed', label: 'relaxed', instruction: `slower ${bpm} BPM pulse with genre-authentic subdivision` };
  return { id: 'slow', label: 'slow', instruction: `genuinely slow pulse at ${bpm} BPM` };
}

function extractCreatorBrief(body = {}) {
  const direct = clean(body?.rawPrompt || body?.creatorPrompt || body?.creator_prompt || body?.musicPrompt, '');
  if (direct) return direct.slice(0, MAX_CREATOR_BRIEF_CHARS);

  const prompt = String(body?.prompt || '').trim();
  const match = prompt.match(/CREATOR BRIEF[^:]*:\s*<<<\s*([\s\S]*?)\s*>>>/i);
  if (match?.[1]) return clean(match[1]).slice(0, MAX_CREATOR_BRIEF_CHARS);
  return clean(prompt).slice(0, MAX_CREATOR_BRIEF_CHARS);
}

function normalizedStyle(body = {}) {
  return clean(`${body?.genreFamily || body?.genre_family || ''} ${body?.genre || ''} ${body?.subgenre || ''}`).toLowerCase();
}

function musicalDNA(body = {}) {
  const style = normalizedStyle(body);

  if (/deep house/.test(style)) return {
    harmony: 'minor/modal harmony, warm Rhodes/extended chords, restrained memorable motif, long harmonic breathing',
    groove: 'rounded club kick, deep controlled sub bass, lightly shuffled hats, subtle syncopation, hypnotic pocket',
    sound: 'warm analog bass, Rhodes, soft plucks, nocturnal pads, dub-space details, tasteful vocal chops',
    arrangement: 'DJ-friendly atmospheric intro > groove reveal > restrained lift > emotional breakdown > deeper main return > clean outro',
    avoid: 'EDM supersaw drops, festival build-ups, harsh distorted bass, cheesy bright melodies, overcrowding'
  };
  if (/tech house/.test(style)) return {
    harmony: 'minimal harmonic movement, sparse stabs, tension from rhythm and timbre rather than dense chords',
    groove: 'tight punchy kick, elastic mono bass phrase, pronounced 16th-note shuffle, rolling hats, syncopated percussion',
    sound: 'dry club drums, short stabs, filtered hooks, percussive vocal fragments, controlled FX',
    arrangement: 'DJ intro > bass/groove lock > hook tease > compact breakdown > peak groove > variation > DJ outro',
    avoid: 'lush cinematic pads, long pop chord progressions, trance supersaws, weak low-end, overlong breakdowns'
  };
  if (/afro house/.test(style)) return {
    harmony: 'deep modal harmony, soulful chord colors, organic melodic call-and-response',
    groove: 'interlocking polyrhythms, shakers, hand drums, grounded kick, rolling organic percussion and deep bass',
    sound: 'organic mallets, hand percussion, warm pads, earthy textures, subtle vocal chants/chops when appropriate',
    arrangement: 'organic percussion opening > bass foundation > layered rhythmic growth > spiritual breakdown > full polyrhythmic return > outro',
    avoid: 'generic EDM drops, rigid quantization, aggressive festival leads, synthetic percussion overload'
  };
  if (/drum.*bass|dnb|jungle/.test(style)) return {
    harmony: 'focused minor/modal palette with concise motifs and atmospheric tension',
    groove: 'rapid breakbeat language, full-time percussion, rolling sub bass, strong forward momentum',
    sound: 'clean sub, chopped breaks, atmospheric pads, controlled Reese/texture layers where authentic',
    arrangement: 'tension intro > breakbeat reveal > bass drop > contrast section > evolved second drop > concise outro',
    avoid: 'accidental half-time pacing, slow house groove, muddy sub layering, random genre drift'
  };
  if (/trap/.test(style)) return {
    harmony: 'dark concise minor-key motif, strong tonal center, spacious harmonic rhythm',
    groove: 'weighty kick/808 relationship, crisp snare, expressive hi-hat subdivisions and controlled syncopation',
    sound: 'deep 808, sharp drums, sparse keys/bells/pads, selective atmospheric ear candy',
    arrangement: 'short identity intro > verse pocket > hook lift > contrast/break > evolved hook > outro',
    avoid: 'four-on-the-floor house groove, uncontrolled 808 mud, excessive melodic clutter'
  };
  if (/hip.?hop|rap/.test(style)) return {
    harmony: 'strong loop identity, soulful/minor tonal focus, enough space for vocal phrasing',
    groove: 'human pocket, punchy kick/snare relationship, expressive hats and bass movement',
    sound: 'sample/keys texture, focused bass, character drums, restrained ear candy',
    arrangement: 'intro > verse pocket > hook lift > second verse variation > final hook > outro',
    avoid: 'overproduced EDM transitions, crowded midrange, rhythm that fights the vocal pocket'
  };

  return {
    harmony: 'genre-authentic tonal center, coherent progression/motif, controlled tension and release',
    groove: 'genre-authentic kick, bass, percussion, swing and syncopation with a clear pocket',
    sound: 'cohesive professional instrument palette with deliberate timbral hierarchy and evolving detail',
    arrangement: 'clear intro > development > main statement > contrast/breakdown > evolved return > resolved outro, adapted to the selected genre',
    avoid: 'random genre changes, abrupt transitions, muddy low end, harsh clipping, overcrowded arrangement, generic preset stacking'
  };
}

function creativeProfile(weirdness, styleInfluence, subgenre) {
  const weird = weirdness >= 80
    ? 'high experimentation: unusual textures, fills and harmonic/rhythmic variations are welcome, but remain inside the selected DNA'
    : weirdness >= 50
      ? 'moderate creativity: introduce tasteful variations and evolving details without destabilizing genre identity'
      : 'conservative creativity: prioritize familiar, polished genre conventions and predictable musical coherence';

  const style = styleInfluence >= 80
    ? `strict fidelity: ${subgenre} conventions must dominate instrumentation, groove, harmony and arrangement`
    : styleInfluence >= 50
      ? `strong fidelity: keep ${subgenre} unmistakable while allowing tasteful personal variation`
      : `light fidelity: preserve the core ${subgenre} identity while allowing broader interpretation`;

  return `${style}; ${weird}`;
}

function vocalProfile(body = {}) {
  const mode = clean(body?.vocalMode || body?.vocal_mode || body?.mode, 'auto').toLowerCase();
  const gender = clean(body?.voiceGender || body?.voice_gender || body?.gender, '');
  const style = clean(body?.vocalStyle || body?.vocal_style, '');
  const language = clean(body?.language, '');

  if (/instrumental|no vocals|none|off/.test(mode)) return 'VOCALS: instrumental; no lead vocal, only non-lyrical texture if genre-authentic.';
  const descriptors = [gender, style, language].filter(Boolean).join(', ');
  return `VOCALS: ${descriptors || 'genre-authentic'}; natural phrasing, controlled presence, emotionally credible delivery, no unnecessary continuous singing.`;
}

function mixProfile() {
  return 'MIX/MASTER: tight controlled sub, kick/bass separation, clean low-mids, defined transients, wide atmospheres with centered low end, musical sidechain where appropriate, dynamic club-ready loudness, no clipping.';
}

function coherenceCritic(body, dna, bpm, creatorBrief) {
  const selected = clean(body?.subgenre || body?.genre, 'Music');
  const bpmRule = bpm === null ? '' : `Structured ${bpm} BPM overrides any conflicting tempo in free text.`;
  const conflictHint = creatorBrief && /\b(bpm|house|techno|trap|jungle|drum|bass|rock|jazz|pop|reggae|afro|trance|hardcore)\b/i.test(creatorBrief)
    ? 'If the brief names a conflicting genre, reinterpret only its compatible sonic qualities; never switch taxonomy.'
    : '';
  return `CRITIC: before rendering, reject contradictions, impossible combinations and genre drift. ${selected} identity, selected key, duration and structured controls win. ${bpmRule} ${conflictHint} Preserve musical causality: harmony, groove, sound palette and arrangement must reinforce each other. Avoid ${dna.avoid}.`;
}

function authoritativePrompt(body) {
  const family = clean(body?.genreFamily || body?.genre_family, 'Music');
  const genre = clean(body?.genre, 'Music');
  const subgenre = clean(body?.subgenre, genre);
  const mood = clean(body?.mood, 'Authentic');
  const key = clean(body?.key || body?.key_scale, 'as selected');
  const duration = Math.round(clamp(body?.durationSec ?? body?.duration, 30, 30, 480));
  const weirdness = Math.round(clamp(body?.weirdness, 50, 0, 100));
  const styleInfluence = Math.round(clamp(body?.styleInfluence ?? body?.style_influence, 50, 0, 100));
  const bpm = resolveBpm(body);
  const creatorBrief = extractCreatorBrief(body);
  const tempo = bpm === null ? 'TEMPO: infer a genre-authentic stable tempo.' : `TEMPO: ${bpm} BPM exact; ${tempoProfile(bpm, body).instruction}.`;
  const dna = musicalDNA({ ...body, genreFamily: family, genre, subgenre });

  const compact = [
    `SONARA MUSIC DIRECTOR. STYLE LOCK: ${family} > ${genre} > ${subgenre}. Mood: ${mood}. UI taxonomy overrides conflicting free text; no neighboring-genre drift.`,
    tempo,
    `KEY/LENGTH: ${key}; about ${duration}s.`,
    `HARMONY: ${dna.harmony}.`,
    `GROOVE: ${dna.groove}.`,
    `SOUND: ${dna.sound}.`,
    `ARRANGEMENT: ${dna.arrangement}.`,
    vocalProfile(body),
    `CREATIVE CONTROLS: style ${styleInfluence}/100, weirdness ${weirdness}/100; ${creativeProfile(weirdness, styleInfluence, subgenre)}.`,
    mixProfile(),
    coherenceCritic(body, dna, bpm, creatorBrief),
    creatorBrief ? `CREATOR BRIEF INSIDE ALL LOCKS: ${creatorBrief}` : ''
  ].filter(Boolean).join(' ');

  return compact.slice(0, MAX_PROMPT_CHARS);
}

export async function rewriteGenerationRequest(request) {
  let body;
  try {
    body = await request.clone().json();
  } catch {
    return request;
  }

  const genre = clean(body?.genre, 'Music');
  const subgenre = clean(body?.subgenre, genre);
  const genreFamily = clean(body?.genreFamily || body?.genre_family, 'Music');
  const mood = clean(body?.mood, 'Authentic');
  const weirdness = Math.round(clamp(body?.weirdness, 50, 0, 100));
  const styleInfluence = Math.round(clamp(body?.styleInfluence ?? body?.style_influence, 50, 0, 100));
  const bpm = resolveBpm(body);
  const profile = bpm === null ? null : tempoProfile(bpm, body);

  const locked = {
    ...body,
    genreFamily,
    genre,
    subgenre,
    mood,
    ...(bpm === null ? {} : {
      bpm,
      requestedBpm: bpm,
      targetBpm: bpm,
      preferredBpm: bpm,
      bpmLock: true,
      promptBpmAuthoritative: false,
      sonaraTempoClass: profile.label,
      sonaraPerceptualTempoLock: true
    }),
    prompt: authoritativePrompt({ ...body, genreFamily, genre, subgenre, mood, ...(bpm === null ? {} : { bpm, requestedBpm: bpm }) }),
    weirdness,
    styleInfluence,
    sonaraGenreLock: LOCK_ID,
    sonaraTempoLock: bpm === null ? undefined : TEMPO_LOCK_ID,
    sonaraPromptIntelligence: PROMPT_INTELLIGENCE_ID,
    sonaraCoherenceCritic: COHERENCE_CRITIC_ID,
    sonaraCreatorStylePriority: false,
    sonaraUiTaxonomyAuthoritative: true,
    sonaraAtmosphereAuthoritative: true,
    sonaraProfessionalPromptPreserved: true,
    sonaraCreativeControlsPreserved: true,
    sonaraHarmonyIntelligence: true,
    sonaraGrooveIntelligence: true,
    sonaraSoundDesignIntelligence: true,
    sonaraArrangementIntelligence: true,
    sonaraVocalIntelligence: true,
    sonaraMixMasterIntelligence: true,
    sonaraNegativePromptIntelligence: true,
    sonaraDitCaptionOptimized: true
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('x-sonara-genre-lock', LOCK_ID);
  headers.set('x-sonara-ui-taxonomy', 'authoritative');
  headers.set('x-sonara-atmosphere-lock', mood);
  headers.set('x-sonara-prompt-intelligence', PROMPT_INTELLIGENCE_ID);
  headers.set('x-sonara-coherence-critic', COHERENCE_CRITIC_ID);
  if (bpm !== null) {
    headers.set('x-sonara-bpm-lock', `exact-${bpm}`);
    headers.set('x-sonara-tempo-class', profile.label);
  }

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
      universalGenreLock: LOCK_ID,
      authoritativePromptLock: LOCK_ID,
      authoritativeTempoLock: TEMPO_LOCK_ID,
      promptIntelligence: PROMPT_INTELLIGENCE_ID,
      coherenceCritic: COHERENCE_CRITIC_ID,
      bpmRange: `${BPM_MIN}-${BPM_MAX}`,
      promptGenrePriority: false,
      promptBpmPriority: false,
      uiTaxonomyAuthoritative: true,
      selectedFamilyAuthoritative: true,
      selectedGenreAuthoritative: true,
      selectedSubgenreAuthoritative: true,
      selectedAtmosphereAuthoritative: true,
      perceptualTempoProfile: true,
      noAutomaticHalfTime: true,
      harmonyIntelligence: true,
      grooveIntelligence: true,
      soundDesignIntelligence: true,
      arrangementIntelligence: true,
      vocalIntelligence: true,
      mixMasterIntelligence: true,
      negativePromptIntelligence: true,
      creativeControlsSemantic: true,
      professionalPromptPreserved: true,
      creativeControlsPreserved: true,
      creatorPromptStyleAuthoritative: false,
      legacyCaption500Bypassed: true
    }), { status: response.status, headers: response.headers });
  } catch {
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const lockedRequest = url.pathname === '/api/engine/generate' && request.method === 'POST'
      ? await rewriteGenerationRequest(request)
      : request;
    const response = await engineV9.fetch(lockedRequest, env, ctx);
    return decorateHealth(request, response);
  }
};