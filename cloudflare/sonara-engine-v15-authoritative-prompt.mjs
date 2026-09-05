import engineV9 from './sonara-engine-v9-dual-fast.mjs';

const LOCK_ID = 'v15-authoritative-ui-taxonomy-v5';
const TEMPO_LOCK_ID = 'v15-authoritative-bpm-v5-ui';
const PROMPT_INTELLIGENCE_ID = 'sonara-prompt-intelligence-v2';
const COHERENCE_CRITIC_ID = 'sonara-musical-coherence-critic-v1';
const RICH_ARRANGEMENT_ID = 'sonara-rich-arrangement-v13';
const MAX_PROMPT_CHARS = 3600;
const MAX_CREATOR_BRIEF_CHARS = 900;
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


    function richProductionDNA(body = {}) {
      const style = normalizedStyle(body);
      const acoustic = /jazz|blues|classical|orchestral|folk|country|acoustic|bluegrass/.test(style);
      const peak = acoustic ? '7-11' : '9-14';
      const density = `at peak sections use about ${peak} complementary musical/production roles when authentic: core drums, secondary percussion/groove detail, bass, harmony, support harmony, hook/lead, counter-response, atmosphere/room, fills/ornaments and transition/FX. Thin intros, verses and breakdowns intentionally, then rebuild; do not run every layer continuously.`;
    
      if (/deep house|tech house|house|garage|afro house|amapiano|progressive house|melodic house/.test(style)) return {
    instruments: 'layered club drums, secondary percussion, authoritative bass, chord/stab or Rhodes layer, supporting pad/pluck, hook motif, counter-response, atmosphere and section fills chosen for the exact house subgenre',
    effects: 'filter sweeps, reverse cymbals/claps, noise or organic risers, impacts, downlifters, delay throws, reverb tails, micro-fills and automation that announce or connect sections',
    performance: 'stable club pulse with evolving hats/percussion, bass articulation, note lengths, filter/envelope movement and re-performed fills instead of copy-paste loops',
    density
      };
      if (/techno|hardgroove|minimal techno/.test(style)) return {
    instruments: 'physical kick, rumble/sub, layered hats, claps/rims/toms, syncopated percussion, hypnotic stab or sequence, textural synth layer, restrained hook and atmosphere',
    effects: 'rumble tails, reverse percussion, metallic impacts, noise sweeps, delay-feedback moments, modulation, automation and industrial ambience only when genre-authentic',
    performance: 'keep the pulse relentless but evolve accents, ghost hits, modulation, fills and texture every phrase so the groove never becomes a static loop',
    density
      };
      if (/trance|psytrance/.test(style)) return {
    instruments: 'driving kick/bass lock, layered hats/percussion, arpeggio or rhythmic synth, pads, supporting plucks, lead motif, counterline and atmospheric layers',
    effects: 'uplifters, reverse crashes, filtered risers, impacts, gated/long reverb tails, delay throws, downlifters and automation sweeps shaped around sections',
    performance: 'preserve energetic pulse while arps, filters, accents and layered motifs evolve toward deliberate tension-and-release peaks',
    density
      };
      if (/drum.*bass|dnb|jungle|breakbeat/.test(style)) return {
    instruments: 'layered/chopped breaks, kick/snare reinforcement, ghost percussion, sub or Reese bass as appropriate, atmospheric pad, concise motif, counter texture and fills',
    effects: 'break edits, reverse hits, filtered noise, impacts, bass automation, short delays, reverb throws and transition edits without masking the breakbeat',
    performance: 'vary break edits, ghost notes, accents and bass articulation while keeping full-time momentum and a coherent main groove',
    density
      };
      if (/trap|drill|hip.?hop|rap|boom bap|freestyle/.test(style)) return {
    instruments: 'character kick/snare, detailed hats/percussion, 808 or focused bass, sample/keys/chord bed, main motif, supporting texture, counter accents and selective fills with clear space for vocals',
    effects: 'reverse samples, vinyl/tape texture when authentic, drops, impacts, filtered transitions, delay/reverb throws, beat cuts and ear-candy accents between phrases',
    performance: 'humanize pocket, hat subdivisions, ghost notes, 808 articulation and sample phrasing; repeat hooks with small fills/accents rather than identical bars',
    density
      };
      if (/r&b|rnb|neo soul|soul|funk|disco/.test(style)) return {
    instruments: 'live-feeling drums/percussion, melodic bass, Rhodes/piano or guitar chords, supporting harmony, hook instrument, counterline, tasteful strings/brass/synth support and room detail where authentic',
    effects: 'plate/room reverb, tape or analog saturation character, delay throws, filtered transitions, reverse swells and subtle ear candy that supports groove',
    performance: 'use pocket, ghost notes, syncopation, expressive note lengths, chord voicing changes and section-specific fills with believable ensemble interaction',
    density
      };
      if (/pop|synthpop|electropop/.test(style)) return {
    instruments: 'punchy drums, bass, primary chord layer, secondary harmonic support, signature hook, counter-melody, pads/textures, vocal-support layers and section fills',
    effects: 'reverse swells, risers, impacts, downlifters, delays, reverbs, filtered transitions, ear-candy one-shots and automation placed around hooks and section changes',
    performance: 'keep hooks immediately recognizable but vary drum fills, bass articulation, support layers and transitions across verses, choruses and bridge',
    density
      };
      if (/metal|hard rock|punk/.test(style)) return {
    instruments: 'multi-mic-feeling acoustic drums, electric bass, double-tracked rhythm guitars, lead/texture guitar, room/amp character and only genre-authentic supporting layers',
    effects: 'amp/room ambience, feedback, cymbal swells, pick slides, tom fills, short delays/reverbs and performance-led transitions instead of EDM risers',
    performance: 'preserve human drum dynamics, pick attack, fret/amp variation, realistic guitar articulation and non-identical repeated sections',
    density
      };
      if (/rock|indie|alternative|grunge/.test(style)) return {
    instruments: 'realistic drum kit, electric bass, rhythm guitar layers, lead/texture guitar, optional keys/organ and room/amp depth appropriate to the era',
    effects: 'room and amp tails, feedback, cymbal swells, reverse guitar or tape texture when authentic, short delays/reverbs and natural fills into section changes',
    performance: 'use believable drummer/bassist/guitarist interaction, dynamic strums, note-length variation, fills and section-dependent intensity rather than rigid quantization',
    density
      };
      if (/jazz|bebop|swing|fusion/.test(style)) return {
    instruments: 'acoustic drum kit with ride/brush detail, upright/electric bass as appropriate, piano/Rhodes or guitar comping, lead horn/voice, optional horn responses and natural room',
    effects: 'mostly natural room, plate/room reverb and subtle tape/console character; transitions should come from fills, turnarounds, pickups and ensemble cues rather than synthetic FX',
    performance: 'human swing, velocity nuance, articulation, comping variation, call-and-response and genuine ensemble interaction; never clone repeated phrases',
    density
      };
      if (/blues/.test(style)) return {
    instruments: 'human drum kit, bass, expressive electric/acoustic guitar, piano/organ, optional harmonica or horn support and natural room',
    effects: 'amp spring/room reverb, tremolo, tasteful slap/tape delay, slide noises and performance fills instead of electronic transition effects',
    performance: 'expressive bends, vibrato, shuffle/swing pocket, dynamic comping and spontaneous fills with believable live interaction',
    density
      };
      if (/reggae|dub|dancehall/.test(style)) return {
    instruments: 'deep bass, one-drop/steppers/dancehall drums as requested, skank guitar/keys, bubble organ, percussion, melodic accents and spacious dub-compatible layers',
    effects: 'dub delay throws, spring/plate reverb, filter/mute drops, tape feedback, percussion echoes and dramatic space used rhythmically',
    performance: 'keep bass/drum pocket authoritative while skanks, percussion and dub sends breathe and vary across sections',
    density
      };
      if (/reggaeton|dembow|latin trap|salsa|bachata|merengue|cumbia|latin/.test(style)) return {
    instruments: 'genre-correct core rhythm, bass, percussion family, chord instrument, lead/hook instrument, counter-response, fills and authentic acoustic/electronic supporting colors',
    effects: 'reverse percussion, fills, impacts, vocal/instrument delay throws, reverbs and transition swells that support the Latin rhythmic language without EDM overproduction',
    performance: 'preserve clave/dembow or requested rhythmic identity, interlocking percussion, natural accents and call-and-response with evolving fills',
    density
      };
      if (/classical|orchestral|cinematic|score/.test(style)) return {
    instruments: 'orchestrated strings by register, woodwinds, brass, tuned/untuned percussion and selective piano/choir/synth layers only when the requested palette calls for them',
    effects: 'natural hall/room, orchestral swells, cymbal rolls, impacts, low booms and transition tails integrated as part of the score rather than pasted-on SFX',
    performance: 'use expressive dynamics, articulation changes, phrase breathing, realistic register/voicing and evolving orchestration instead of static sustained layers',
    density
      };
      if (/country|folk|bluegrass|acoustic|americana/.test(style)) return {
    instruments: 'human drums/percussion when appropriate, acoustic bass, acoustic/electric guitar, mandolin/banjo/fiddle/piano or pedal steel only as genre-authentic supporting voices',
    effects: 'natural room, plate, tape/slap character and performance transitions such as pickups, stops, fills and swells rather than synthetic EDM FX',
    performance: 'realistic picking/strumming, fret and bow articulation, human timing, dynamic ensemble changes and re-performed repeated sections',
    density
      };
      if (/ambient|downtempo|chill|lo.?fi/.test(style)) return {
    instruments: 'soft drums or percussion when appropriate, warm bass, keys/chords, pad bed, motif, counter texture, field/room layer and evolving tonal details',
    effects: 'long reverbs, tape echo, filtered noise/field texture, reverse tails, granular or modulation detail and slow automation with clear musical purpose',
    performance: 'favor subtle evolution, breathing envelopes, texture changes and organic micro-variation so minimalism never becomes empty or static',
    density
      };
      return {
    instruments: 'genre-authentic core drums, secondary rhythm detail, bass, harmony, supporting harmony, hook/lead, counter-response, atmosphere, fills/ornaments and transition layers chosen only when musically appropriate',
    effects: 'genre-authentic transition FX, reverbs, delays, impacts, swells, reverse elements, automation and ear candy used to connect sections rather than create random noise',
    performance: 'vary dynamics, articulation, accents, fills, note lengths, ambience and automation so repeated sections feel produced and performed rather than cloned',
    density
      };
    }
    
function creativeProfile(weirdness, styleInfluence, subgenre) {
  const weird = weirdness >= 80
    ? 'high experimentation inside the selected DNA'
    : weirdness >= 50
      ? 'tasteful variation without genre drift'
      : 'conservative, familiar genre conventions';

  const style = styleInfluence >= 80
    ? `strict ${subgenre} fidelity`
    : styleInfluence >= 50
      ? `strong ${subgenre} fidelity with controlled variation`
      : `core ${subgenre} identity with broader interpretation`;

  return `${style}; ${weird}`;
}

function vocalProfile(body = {}) {
  const mode = clean(body?.vocalMode || body?.vocal_mode || body?.mode, 'auto').toLowerCase();
  const gender = clean(body?.voiceGender || body?.voice_gender || body?.gender, '');
  const style = clean(body?.vocalStyle || body?.vocal_style, '');
  const language = clean(body?.language, '');

  if (/instrumental|no vocals|none|off/.test(mode)) return 'VOCALS: instrumental; no lead vocal, only non-lyrical texture if genre-authentic.';
  const descriptors = [gender, style, language].filter(Boolean).join(', ');
  return `VOCALS: ${descriptors || 'genre-authentic'}; natural phrasing, credible delivery, no unnecessary continuous singing.`;
}

function mixProfile() {
  return 'MIX/MASTER: controlled sub, kick/bass separation, clean low-mids, defined transients, wide atmospheres, centered low end, musical sidechain, dynamic club-ready loudness, no clipping.';
}

function coherenceCritic(body, dna, bpm, creatorBrief) {
  const selected = clean(body?.subgenre || body?.genre, 'Music');
  const bpmRule = bpm === null ? '' : `Structured ${bpm} BPM overrides any conflicting tempo in free text.`;
  const conflictHint = creatorBrief && /\b(bpm|house|techno|trap|jungle|drum|bass|rock|jazz|pop|reggae|afro|trance|hardcore)\b/i.test(creatorBrief)
    ? 'If the brief names a conflicting genre, keep only compatible sonic qualities; never switch taxonomy.'
    : '';
  return `CRITIC: reject contradictions, genre drift and demo-like sparsity. ${selected}, key, duration and structured controls win. ${bpmRule} ${conflictHint} Harmony, groove, instrumentation, density, effects and arrangement must reinforce each other. Avoid ${dna.avoid}.`;
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
  const rich = richProductionDNA({ ...body, genreFamily: family, genre, subgenre });

  const compact = [
    `SONARA MUSIC DIRECTOR. STYLE LOCK: ${family} > ${genre} > ${subgenre}. Mood: ${mood}. UI taxonomy overrides conflicting free text; no neighboring-genre drift.`,
    tempo,
    `KEY/LENGTH: ${key}; about ${duration}s.`,
    creatorBrief ? `CREATOR BRIEF INSIDE ALL LOCKS: ${creatorBrief}` : '',
    `HARMONY: ${dna.harmony}.`,
    `GROOVE: ${dna.groove}.`,
    `SOUND: ${dna.sound}.`,
    `INSTRUMENTATION: ${rich.instruments}.`,
    `DENSITY: ${rich.density}.`,
    `ARRANGEMENT: ${dna.arrangement}.`,
    `FX/SOUND DESIGN: ${rich.effects}. Effects must announce, connect or resolve sections; never become random noise or replace musical content.`,
    `PERFORMANCE: ${rich.performance}.`,
    vocalProfile(body),
    `CREATIVE CONTROLS: style ${styleInfluence}/100, weirdness ${weirdness}/100; ${creativeProfile(weirdness, styleInfluence, subgenre)}.`,
    mixProfile(),
    coherenceCritic(body, dna, bpm, creatorBrief)
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
    sonaraRichArrangement: RICH_ARRANGEMENT_ID,
    sonaraCreatorStylePriority: false,
    sonaraUiTaxonomyAuthoritative: true,
    sonaraAtmosphereAuthoritative: true,
    sonaraProfessionalPromptPreserved: true,
    sonaraCreativeControlsPreserved: true,
    sonaraHarmonyIntelligence: true,
    sonaraGrooveIntelligence: true,
    sonaraSoundDesignIntelligence: true,
    sonaraArrangementIntelligence: true,
    sonaraFullInstrumentation: true,
    sonaraSectionDensityIntelligence: true,
    sonaraSoundEffectsIntelligence: true,
    sonaraHumanPerformanceIntelligence: true,
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
  headers.set('x-sonara-rich-arrangement', RICH_ARRANGEMENT_ID);
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
      richArrangement: RICH_ARRANGEMENT_ID,
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
      fullInstrumentation: true,
      sectionDensityIntelligence: true,
      soundEffectsIntelligence: true,
      humanPerformanceIntelligence: true,
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