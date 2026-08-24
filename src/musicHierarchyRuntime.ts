import { WORLD_MUSIC_GENRES } from './data/worldMusicGenres';

const FAMILY_ATMOSPHERES: Record<string, string[]> = {
  'Electronic / Dance': ['Deep', 'Hypnotic', 'Club', 'Driving', 'Euphoric', 'Dark', 'Underground', 'Groovy', 'Atmospheric', 'Melodic', 'Minimal', 'Futuristic', 'Warm', 'Peak-Time', 'Dreamy'],
  'Hip-Hop / Rap': ['Gritty', 'Street', 'Confident', 'Dark', 'Aggressive', 'Raw', 'Soulful', 'Laid-Back', 'Introspective', 'Melancholic', 'Cinematic', 'Triumphant', 'Nostalgic', 'Menacing'],
  'Pop': ['Uplifting', 'Bright', 'Romantic', 'Emotional', 'Energetic', 'Dreamy', 'Nostalgic', 'Bittersweet', 'Glamorous', 'Playful', 'Anthemic', 'Sunny', 'Intimate'],
  'Rock': ['Raw', 'Rebellious', 'Energetic', 'Anthemic', 'Gritty', 'Driving', 'Melancholic', 'Emotional', 'Psychedelic', 'Dark', 'Vintage', 'Epic', 'Atmospheric'],
  'Metal': ['Aggressive', 'Crushing', 'Dark', 'Epic', 'Ominous', 'Atmospheric', 'Technical', 'Melodic', 'Apocalyptic', 'Heroic', 'Ritualistic', 'Relentless'],
  'R&B / Soul / Funk': ['Soulful', 'Sensual', 'Warm', 'Intimate', 'Smooth', 'Romantic', 'Groovy', 'Late-Night', 'Emotional', 'Luxurious', 'Funky', 'Silky'],
  'Jazz': ['Sophisticated', 'Swinging', 'Intimate', 'Smoky', 'Cool', 'Playful', 'Improvisational', 'Elegant', 'Nocturnal', 'Energetic', 'Spiritual', 'Relaxed'],
  'Blues': ['Soulful', 'Raw', 'Melancholic', 'Gritty', 'Smoky', 'Intimate', 'Earthy', 'Wistful', 'Driving', 'Warm', 'Late-Night'],
  'Reggae / Jamaican': ['Laid-Back', 'Sunny', 'Spiritual', 'Deep', 'Dubwise', 'Conscious', 'Warm', 'Uplifting', 'Roots', 'Dancefloor', 'Smoky'],
  'Latin America': ['Passionate', 'Festive', 'Romantic', 'Energetic', 'Sensual', 'Tropical', 'Dramatic', 'Street', 'Celebratory', 'Warm', 'Dancefloor'],
  'Africa': ['Percussive', 'Earthy', 'Energetic', 'Spiritual', 'Hypnotic', 'Celebratory', 'Deep', 'Warm', 'Communal', 'Organic', 'Dancefloor'],
  'Caribbean': ['Tropical', 'Festive', 'Sunny', 'Romantic', 'Energetic', 'Carnival', 'Relaxed', 'Dancefloor', 'Warm', 'Joyful'],
  'Middle East / North Africa': ['Mystical', 'Dramatic', 'Desert', 'Spiritual', 'Romantic', 'Hypnotic', 'Celebratory', 'Melancholic', 'Majestic', 'Ritualistic'],
  'South Asia': ['Devotional', 'Cinematic', 'Romantic', 'Festive', 'Mystical', 'Rhythmic', 'Emotional', 'Classical', 'Energetic', 'Meditative', 'Majestic'],
  'East Asia': ['Elegant', 'Bright', 'Nostalgic', 'Cinematic', 'Futuristic', 'Dramatic', 'Energetic', 'Melancholic', 'Traditional', 'Dreamy', 'Playful'],
  'Southeast Asia': ['Festive', 'Tropical', 'Traditional', 'Romantic', 'Meditative', 'Bright', 'Rhythmic', 'Ceremonial', 'Warm', 'Joyful'],
  'Country / Americana': ['Rustic', 'Warm', 'Heartfelt', 'Road-Trip', 'Melancholic', 'Storytelling', 'Honky-Tonk', 'Southern', 'Nostalgic', 'Intimate', 'Uplifting'],
  'Folk / Traditional Europe': ['Rustic', 'Traditional', 'Pastoral', 'Mystical', 'Festive', 'Melancholic', 'Acoustic', 'Ancestral', 'Intimate', 'Ceremonial', 'Earthy'],
  'Classical / Art Music': ['Majestic', 'Romantic', 'Dramatic', 'Serene', 'Sacred', 'Tense', 'Elegant', 'Heroic', 'Melancholic', 'Meditative', 'Grand', 'Delicate'],
  'Gospel / Spiritual': ['Spiritual', 'Uplifting', 'Reverent', 'Triumphant', 'Hopeful', 'Soulful', 'Worshipful', 'Joyful', 'Powerful', 'Peaceful'],
  'Cinematic / Media': ['Epic', 'Suspenseful', 'Dark', 'Emotional', 'Heroic', 'Romantic', 'Horror', 'Futuristic', 'Fantasy', 'Tense', 'Atmospheric', 'Mysterious'],
  'Experimental / Avant-Garde': ['Abstract', 'Dissonant', 'Textural', 'Minimal', 'Chaotic', 'Eerie', 'Futuristic', 'Avant-Garde', 'Meditative', 'Unsettling', 'Industrial'],
  'Easy Listening / Lounge': ['Relaxed', 'Elegant', 'Smooth', 'Cozy', 'Romantic', 'Sophisticated', 'Sunny', 'Nostalgic', 'Warm', 'Late-Night'],
  'Children / Novelty / Spoken': ['Playful', 'Cheerful', 'Gentle', 'Educational', 'Whimsical', 'Funny', 'Storytelling', 'Lullaby', 'Dramatic', 'Bright']
};

type AtmosphereRule = { terms: string[]; values: string[] };

const SPECIFIC_RULES: AtmosphereRule[] = [
  { terms: ['deep house'], values: ['Deep', 'Warm', 'Hypnotic', 'Soulful', 'Late-Night', 'Underground', 'Atmospheric'] },
  { terms: ['tech house'], values: ['Groovy', 'Driving', 'Club', 'Minimal', 'Punchy', 'Underground', 'Late-Night'] },
  { terms: ['afro house'], values: ['Organic', 'Tribal', 'Hypnotic', 'Spiritual', 'Percussive', 'Sunset', 'Deep'] },
  { terms: ['tribal house'], values: ['Tribal', 'Percussive', 'Hypnotic', 'Ritualistic', 'Driving', 'Underground'] },
  { terms: ['progressive house'], values: ['Progressive', 'Emotional', 'Euphoric', 'Atmospheric', 'Driving', 'Cinematic'] },
  { terms: ['melodic house', 'melodic techno'], values: ['Melodic', 'Emotional', 'Deep', 'Cinematic', 'Hypnotic', 'Euphoric'] },
  { terms: ['hard techno', 'schranz'], values: ['Industrial', 'Aggressive', 'Peak-Time', 'Dark', 'Relentless', 'Raw'] },
  { terms: ['dub techno'], values: ['Deep', 'Dubwise', 'Hypnotic', 'Minimal', 'Atmospheric', 'Nocturnal'] },
  { terms: ['uplifting trance'], values: ['Euphoric', 'Emotional', 'Anthemic', 'Celestial', 'Uplifting', 'Energetic'] },
  { terms: ['psytrance', 'goa trance'], values: ['Psychedelic', 'Hypnotic', 'Driving', 'Cosmic', 'Tribal', 'Intense'] },
  { terms: ['liquid drum & bass'], values: ['Liquid', 'Emotional', 'Atmospheric', 'Soulful', 'Dreamy', 'Rolling'] },
  { terms: ['neurofunk'], values: ['Dark', 'Futuristic', 'Aggressive', 'Technical', 'Industrial', 'Relentless'] },
  { terms: ['boom bap', 'golden age hip-hop'], values: ['Gritty', 'Dusty', 'Raw', 'Head-Nod', 'Street', 'Nostalgic'] },
  { terms: ['drill'], values: ['Dark', 'Menacing', 'Street', 'Aggressive', 'Cold', 'Tense'] },
  { terms: ['trap'], values: ['Dark', 'Confident', 'Atmospheric', 'Aggressive', 'Melodic', 'Street', 'Luxurious'] },
  { terms: ['lo-fi hip-hop'], values: ['Lo-Fi', 'Warm', 'Nostalgic', 'Relaxed', 'Dreamy', 'Dusty', 'Intimate'] },
  { terms: ['g-funk'], values: ['Funky', 'Sunny', 'Laid-Back', 'West-Coast', 'Smooth', 'Street'] },
  { terms: ['dream pop'], values: ['Dreamy', 'Ethereal', 'Romantic', 'Nostalgic', 'Soft', 'Atmospheric'] },
  { terms: ['dark pop'], values: ['Dark', 'Seductive', 'Cinematic', 'Melancholic', 'Mysterious', 'Dramatic'] },
  { terms: ['punk'], values: ['Rebellious', 'Raw', 'Fast', 'Aggressive', 'Energetic', 'Urgent'] },
  { terms: ['shoegaze'], values: ['Dreamy', 'Wall-of-Sound', 'Ethereal', 'Melancholic', 'Noisy', 'Atmospheric'] },
  { terms: ['black metal'], values: ['Cold', 'Dark', 'Atmospheric', 'Ritualistic', 'Raw', 'Epic'] },
  { terms: ['death metal'], values: ['Brutal', 'Aggressive', 'Dark', 'Technical', 'Crushing', 'Relentless'] },
  { terms: ['doom metal'], values: ['Doomed', 'Heavy', 'Slow', 'Dark', 'Funereal', 'Atmospheric'] },
  { terms: ['neo soul'], values: ['Soulful', 'Warm', 'Intimate', 'Groovy', 'Silky', 'Late-Night'] },
  { terms: ['funk'], values: ['Funky', 'Groovy', 'Energetic', 'Playful', 'Dancefloor', 'Warm'] },
  { terms: ['bebop'], values: ['Fast', 'Sophisticated', 'Energetic', 'Improvisational', 'Angular', 'Swinging'] },
  { terms: ['cool jazz'], values: ['Cool', 'Relaxed', 'Elegant', 'Smoky', 'Intimate', 'Nocturnal'] },
  { terms: ['free jazz'], values: ['Free', 'Abstract', 'Intense', 'Avant-Garde', 'Chaotic', 'Exploratory'] },
  { terms: ['delta blues'], values: ['Raw', 'Earthy', 'Acoustic', 'Intimate', 'Melancholic', 'Rural'] },
  { terms: ['chicago blues'], values: ['Electric', 'Smoky', 'Gritty', 'Driving', 'Soulful', 'Urban'] },
  { terms: ['dub'], values: ['Deep', 'Dubwise', 'Spacious', 'Psychedelic', 'Bass-Heavy', 'Smoky'] },
  { terms: ['roots reggae'], values: ['Roots', 'Spiritual', 'Conscious', 'Warm', 'Laid-Back', 'Earthy'] },
  { terms: ['reggaeton'], values: ['Dancefloor', 'Sensual', 'Street', 'Energetic', 'Tropical', 'Confident'] },
  { terms: ['salsa'], values: ['Festive', 'Passionate', 'Energetic', 'Dancefloor', 'Celebratory', 'Romantic'] },
  { terms: ['bossa nova'], values: ['Intimate', 'Elegant', 'Warm', 'Relaxed', 'Romantic', 'Sunny'] },
  { terms: ['tango'], values: ['Dramatic', 'Passionate', 'Romantic', 'Dark', 'Elegant', 'Tense'] },
  { terms: ['afrobeat', 'afrobeats'], values: ['Groovy', 'Celebratory', 'Warm', 'Percussive', 'Sunny', 'Dancefloor'] },
  { terms: ['amapiano'], values: ['Deep', 'Groovy', 'Percussive', 'Late-Night', 'Hypnotic', 'Dancefloor'] },
  { terms: ['gqom'], values: ['Dark', 'Percussive', 'Raw', 'Hypnotic', 'Minimal', 'Club'] },
  { terms: ['qawwali', 'bhajan', 'kirtan', 'nasheed'], values: ['Devotional', 'Spiritual', 'Reverent', 'Transcendent', 'Communal', 'Meditative'] },
  { terms: ['city pop'], values: ['Nostalgic', 'Bright', 'Urban', 'Smooth', 'Romantic', 'Night-Drive'] },
  { terms: ['k-pop', 'j-pop'], values: ['Bright', 'Energetic', 'Polished', 'Playful', 'Dramatic', 'Uplifting'] },
  { terms: ['bluegrass'], values: ['Rustic', 'Fast', 'Acoustic', 'Joyful', 'Earthy', 'Appalachian'] },
  { terms: ['outlaw country'], values: ['Rebellious', 'Dusty', 'Road-Trip', 'Gritty', 'Storytelling', 'Warm'] },
  { terms: ['baroque'], values: ['Elegant', 'Ornate', 'Majestic', 'Sacred', 'Dramatic', 'Refined'] },
  { terms: ['romantic'], values: ['Romantic', 'Emotional', 'Grand', 'Passionate', 'Dramatic', 'Lyrical'] },
  { terms: ['horror score'], values: ['Horror', 'Tense', 'Ominous', 'Eerie', 'Dark', 'Suspenseful'] },
  { terms: ['epic orchestral', 'trailer music'], values: ['Epic', 'Heroic', 'Massive', 'Dramatic', 'Triumphant', 'Cinematic'] },
  { terms: ['ambient'], values: ['Atmospheric', 'Meditative', 'Deep', 'Ethereal', 'Spacious', 'Dreamy'] },
  { terms: ['noise', 'power electronics'], values: ['Harsh', 'Chaotic', 'Industrial', 'Dissonant', 'Extreme', 'Unsettling'] },
  { terms: ['lullaby'], values: ['Gentle', 'Peaceful', 'Tender', 'Dreamy', 'Soft', 'Soothing'] }
];

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function getPreciseAtmospheres(family: string, genre: string, subgenre: string): string[] {
  const haystack = `${genre} ${subgenre}`.toLowerCase();
  const specific = SPECIFIC_RULES
    .filter(rule => rule.terms.some(term => haystack.includes(term)))
    .flatMap(rule => rule.values);
  const familyValues = FAMILY_ATMOSPHERES[family] || ['Authentic', 'Emotional', 'Energetic', 'Atmospheric', 'Warm', 'Dark', 'Uplifting', 'Intimate'];
  return unique([...specific, ...familyValues]).slice(0, 18);
}

function generatorControls() {
  const textarea = document.getElementById('sonara-prompt');
  const panel = textarea?.closest('section');
  if (!(textarea instanceof HTMLTextAreaElement) || !panel) return null;
  const selects = Array.from(panel.querySelectorAll('select')) as HTMLSelectElement[];
  if (selects.length < 4) return null;
  return { textarea, panel, family: selects[0], genre: selects[1], subgenre: selects[2], atmosphere: selects[3] };
}

function sameOptions(select: HTMLSelectElement, values: string[]) {
  return select.options.length === values.length && values.every((value, index) => select.options[index]?.value === value);
}

function replaceOptions(select: HTMLSelectElement, values: string[], preferred?: string) {
  const next = values.length ? values : ['Music'];
  const chosen = preferred && next.includes(preferred) ? preferred : next[0];
  if (!sameOptions(select, next)) {
    select.replaceChildren(...next.map(value => new Option(value, value)));
  }
  if (select.value !== chosen) select.value = chosen;
  return chosen;
}

let syncing = false;
function syncHierarchy(dispatchChanges = true) {
  if (syncing) return;
  const controls = generatorControls();
  if (!controls) return;
  syncing = true;
  try {
    const familyEntry = WORLD_MUSIC_GENRES.find(group => group.family === controls.family.value) || WORLD_MUSIC_GENRES[0];
    const genreValues = familyEntry.genres.map(item => item.name);
    const oldGenre = controls.genre.value;
    const genreValue = replaceOptions(controls.genre, genreValues, oldGenre);
    const genreEntry = familyEntry.genres.find(item => item.name === genreValue) || familyEntry.genres[0];
    const subgenreValues = genreEntry.subgenres.length ? genreEntry.subgenres : [genreEntry.name];
    const oldSubgenre = controls.subgenre.value;
    const subgenreValue = replaceOptions(controls.subgenre, subgenreValues, oldSubgenre);
    const atmosphereValues = getPreciseAtmospheres(familyEntry.family, genreEntry.name, subgenreValue);
    const oldAtmosphere = controls.atmosphere.value;
    const atmosphereValue = replaceOptions(controls.atmosphere, atmosphereValues, oldAtmosphere);

    if (dispatchChanges) {
      if (oldGenre !== genreValue) controls.genre.dispatchEvent(new Event('change', { bubbles: true }));
      if (oldSubgenre !== subgenreValue) controls.subgenre.dispatchEvent(new Event('change', { bubbles: true }));
      if (oldAtmosphere !== atmosphereValue) controls.atmosphere.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } finally {
    syncing = false;
  }
}

const GROOVES = [
  'authentic groove architecture with precise rhythmic phrasing, detailed percussion and natural movement',
  'genre-correct rhythmic foundation with expressive accents, tasteful fills and a strong musical pocket',
  'deeply defined pulse with characteristic syncopation, dynamic percussion layers and convincing human movement',
  'professional rhythmic language with controlled swing, clear accents, musical variation and a recognizable stylistic pulse'
];
const ARRANGEMENTS = [
  'a complete arrangement with focused intro, gradual development, main section, breakdown, climax and satisfying outro',
  'an evolving song structure with clear storytelling, tension and release, contrast between sections and polished transitions',
  'a release-ready structure with coherent development, strategic energy changes, memorable motifs and a strong final payoff',
  'a sophisticated arrangement with layered progression, tasteful drops and pauses, smooth transitions and a convincing climax'
];
const PRODUCTION = [
  'premium sound design, clean transient definition, controlled low end, detailed midrange, spacious stereo depth and a polished professional master',
  'high-end studio production with strong separation, musical dynamics, precise frequency balance, dimensional imaging and commercial mastering',
  'detailed sonic texture, controlled dynamics, clear instrument separation, immersive depth and a competitive release-ready master',
  'professional mixing with punch, warmth, clarity, natural dynamics, wide but stable imaging and refined mastering'
];

function randomItem<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

function familyLanguage(family: string) {
  const value = family.toLowerCase();
  if (value.includes('electronic') || value.includes('dance')) return 'Use genre-correct drums, disciplined kick-and-bass interaction, detailed percussion, appropriate synth or sampled textures and club-ready spatial processing.';
  if (value.includes('hip-hop') || value.includes('rap')) return 'Use authoritative drums, a convincing bass foundation, authentic rhythmic pocket, tasteful sampling or instrumentation and production space suitable for the selected rap style.';
  if (value.includes('rock') || value.includes('metal')) return 'Use believable live-band energy, genre-correct guitars or amplified instrumentation, powerful drums, natural dynamics and authentic performance intensity.';
  if (value.includes('jazz')) return 'Use believable ensemble interplay, human timing, sophisticated harmony, expressive dynamics, authentic acoustic tone and real instrumental conversation.';
  if (value.includes('blues')) return 'Use authentic blues phrasing, expressive call-and-response, human dynamics, warm organic instruments and genre-correct harmonic movement.';
  if (value.includes('latin') || value.includes('caribbean')) return 'Use authentic regional percussion, danceable rhythmic interaction, appropriate melodic instruments and culturally coherent arrangement language.';
  if (value.includes('africa')) return 'Use authentic percussion language, layered rhythmic interaction, expressive bass movement and regionally coherent instrumental textures.';
  if (value.includes('classical')) return 'Use believable acoustic orchestration, expressive articulation, realistic ensemble balance, coherent harmonic development and natural dynamics.';
  if (value.includes('cinematic')) return 'Use purposeful orchestration and sound design, clear dramatic arc, controlled tension and release, dimensional depth and scene-ready dynamics.';
  return 'Use instrumentation, rhythm, harmony, performance language and production choices that are authentic to the selected musical family.';
}

function richPrompt() {
  syncHierarchy(false);
  const controls = generatorControls();
  if (!controls) return '';
  const family = controls.family.value;
  const genre = controls.genre.value;
  const subgenre = controls.subgenre.value;
  const atmosphere = controls.atmosphere.value;
  return [
    `Create a professional ${subgenre} track within the ${genre} genre and ${family} musical family.`,
    `Atmosphere: ${atmosphere}.`,
    `Keep the musical identity unmistakably ${subgenre} from the first bar to the last.`,
    familyLanguage(family),
    `${randomItem(GROOVES)}.`,
    `Use instruments, timbres, harmony and melodic language that are characteristic of ${subgenre}, not generic substitutes.`,
    `${randomItem(ARRANGEMENTS)}.`,
    `Let the energy and dynamics evolve naturally while preserving the selected atmosphere ${atmosphere}.`,
    `${randomItem(PRODUCTION)}.`,
    `Do not drift into unrelated genres or subgenres; every musical choice must reinforce ${genre} / ${subgenre}.`
  ].join(' ');
}

function setTextarea(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

let scheduled = false;
function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scheduled = false;
      syncHierarchy(true);
    });
  });
}

export function installMusicHierarchyRuntime() {
  document.addEventListener('change', event => {
    const controls = generatorControls();
    const target = event.target;
    if (!controls || !(target instanceof HTMLSelectElement)) return;
    if (target === controls.family || target === controls.genre || target === controls.subgenre) scheduleSync();
  }, true);

  document.addEventListener('click', event => {
    const button = (event.target as HTMLElement | null)?.closest('button');
    if (!button || button.textContent?.trim().toUpperCase() !== 'RANDOM') return;
    const controls = generatorControls();
    if (!controls) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    syncHierarchy(true);
    setTextarea(controls.textarea, richPrompt());
    controls.textarea.focus();
  }, true);

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, window.location.href);
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (url.pathname === '/api/engine/generate' && method === 'POST') {
        syncHierarchy(false);
        const controls = generatorControls();
        let bodyText = typeof init?.body === 'string' ? init.body : '';
        if (!bodyText && input instanceof Request) bodyText = await input.clone().text();
        if (controls && bodyText) {
          const payload = JSON.parse(bodyText) as Record<string, unknown>;
          const exact = {
            ...payload,
            genreFamily: controls.family.value,
            genre: controls.genre.value,
            subgenre: controls.subgenre.value,
            mood: controls.atmosphere.value,
            prompt: controls.textarea.value.trim()
          };
          return nativeFetch(rawUrl, {
            ...(init || {}),
            method: 'POST',
            headers: init?.headers || (input instanceof Request ? input.headers : undefined),
            body: JSON.stringify(exact)
          });
        }
      }
    } catch {}
    return nativeFetch(input, init);
  };

  const observer = new MutationObserver(() => scheduleSync());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', scheduleSync, { once: true });
  scheduleSync();
}
