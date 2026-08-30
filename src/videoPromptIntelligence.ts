export type VideoPromptContext = {
  aspectRatio: '16:9' | '9:16';
  durationSeconds: number;
  variant: number;
};

const SUBJECTS = [
  'a magnetic vocalist performing on a rain-soaked rooftop above a luminous city',
  'a lone dancer moving through monumental brutalist architecture at blue hour',
  'an underground electronic duo performing inside a vast abandoned power station',
  'a surreal night drive through a futuristic Mediterranean metropolis',
  'a live band performing in a desert landscape as a storm forms on the horizon',
  'a fashion-forward protagonist crossing dreamlike rooms that transform with the music',
  'a crowd gathering for a secret sunrise performance beside the sea',
  'an intimate singer-songwriter performance inside a cinematic vintage apartment'
];

const MUSIC_DIRECTIONS = [
  'deep house at 122 BPM with a hypnotic pulse, warm sub bass and nocturnal emotion',
  'cinematic electronic music with slow tension, huge spatial drums and a cathartic climax',
  'dark melodic techno at 126 BPM with mechanical rhythm and evolving synth arpeggios',
  'modern R&B with restrained percussion, intimate vocals and luxurious negative space',
  'old-school hip-hop with dusty drums, soulful sampling energy and confident performance',
  'afro house with organic percussion, polyrhythmic movement and radiant communal energy',
  'alternative pop with emotional verses, explosive hooks and bold visual transitions',
  'ambient orchestral music with suspended harmony, tactile detail and gradual transformation'
];

const CAMERAS = [
  'controlled anamorphic wides, slow dolly-ins, motivated handheld close-ups and one memorable orbit shot',
  'precise Steadicam choreography, low-angle tracking, macro inserts and elegant crane reveals',
  'intimate shoulder-mounted coverage contrasted with symmetrical locked-off tableaux and aerial transitions',
  'fluid gimbal movement, long-lens compression, rhythmic whip transitions and expressive close-up portraiture',
  'slow push-ins, lateral tracking through foreground layers, overhead geometry and natural parallax'
];

const LIGHTING = [
  'deep cobalt shadows, controlled magenta practicals, wet reflections and soft volumetric haze',
  'golden-hour backlight, textured skin tones, long shadows and restrained filmic halation',
  'high-contrast monochrome lighting with sharp silhouettes, silver highlights and atmospheric smoke',
  'warm tungsten interiors against cool moonlit exteriors with realistic motivated light sources',
  'saturated sodium-vapor color, cyan accents, glossy reflections and dramatic pools of darkness'
];

const VISUAL_LANGUAGES = [
  'premium narrative music-video realism with tactile production design and subtle surreal transitions',
  'editorial fashion cinema blended with emotionally grounded performance and architectural composition',
  'large-scale concert energy combined with intimate documentary detail and poetic visual metaphors',
  'neo-noir visual storytelling with restrained futurism, realistic textures and sophisticated color separation',
  'dreamlike magical realism anchored by believable faces, physical environments and cinematic continuity'
];

function choose<T>(items: T[], variant: number, offset: number): T {
  return items[Math.abs((variant * 17) + offset * 11) % items.length];
}

function formatDuration(seconds: number) {
  return seconds >= 60 ? `${seconds / 60} minute${seconds === 60 ? '' : 's'}` : `${seconds} seconds`;
}

export function buildRandomVideoPrompt(context: VideoPromptContext): string {
  const { variant, aspectRatio, durationSeconds } = context;
  return [
    `Create an original ${formatDuration(durationSeconds)} cinematic music video about ${choose(SUBJECTS, variant, 1)}.`,
    `Music direction: ${choose(MUSIC_DIRECTIONS, variant, 2)}.`,
    `Visual language: ${choose(VISUAL_LANGUAGES, variant, 3)}.`,
    `Camera grammar: ${choose(CAMERAS, variant, 4)}.`,
    `Lighting and color: ${choose(LIGHTING, variant, 5)}.`,
    `Edit movement, performance and transitions to the musical phrasing, drum accents and emotional arc. Compose natively for ${aspectRatio}.`,
    durationSeconds > 8
      ? 'Develop a coherent beginning, progression, climax and final image across all scenes. Preserve the same characters, wardrobe, locations, color science and screen direction throughout.'
      : 'Deliver one complete visual idea with an immediate hook, clear development and a strong final frame.',
    'Use original characters and production design. Do not imitate, reproduce or reference a specific living artist, film, music video, trademarked character or copyrighted scene. No text, subtitles, logos, watermarks, malformed anatomy, flicker or continuity errors.'
  ].join('\n\n');
}

function extractCreatorIntent(currentPrompt: string) {
  const text = String(currentPrompt || '').trim();
  const existingIntent = text.match(/^(?:CREATOR CONTENT LOCK|CREATOR INTENT — PRESERVE AS AUTHORITATIVE):\s*([\s\S]*?)(?:\n\n(?:ABSOLUTE FIDELITY LOCK|SONARA INTELLIGENT VIDEO DIRECTION):|$)/)?.[1];
  return String(existingIntent || text).replace(/\s+/g, ' ').trim();
}

export function buildIntelligentVideoPrompt(currentPrompt: string, context: VideoPromptContext): string {
  const intent = extractCreatorIntent(currentPrompt) || choose(SUBJECTS, context.variant, 7);
  const { aspectRatio, durationSeconds } = context;

  return [
    `CREATOR CONTENT LOCK:\n${intent}`,
    'ABSOLUTE FIDELITY LOCK:\nThe creator content above is the single source of truth. Preserve exactly the requested subject, people, objects, animals, vehicles, location, action, story, era, weather, clothing, visual style, camera request, lighting request, colors, mood, music genre, BPM and any other explicit detail. Do not replace, remove or invent content that changes the creator request. If any enhancement conflicts with the creator request, the creator request always wins.',
    'SONARA INTELLIGENT ENHANCEMENT:\nImprove only technical execution: coherent composition, realistic textures, stable identity and anatomy, physically believable motion, clean temporal consistency, professional depth, intentional focus and premium production detail. Infer the visual treatment from the creator request instead of imposing an unrelated preset.',
    'CAMERA / LIGHT / COLOR:\nRespect every camera, lens, movement, lighting and color instruction already present in the creator request. When those details are not specified, use restrained professional cinematic choices that support the requested scene without changing its content or aesthetic identity.',
    'MUSIC / RHYTHM LOCK:\nIf the creator specifies music, genre, BPM, tempo, instruments, vocals, mood or an uploaded audio reference, preserve those instructions exactly. Do not invent a different music genre or BPM. Synchronize motion and editing to the requested musical energy only when relevant.',
    `FORMAT / CONTINUITY LOCK:\nCompose natively for ${aspectRatio} and target ${formatDuration(durationSeconds)}. ${durationSeconds > 8 ? 'Across every scene, continue the same requested event while preserving subject identity, wardrobe, location, props, geography, lighting logic, visual style and color science. New shots may change framing or moment in time, but must not introduce a different concept.' : 'Make the requested scene complete and visually clear while staying faithful to the creator content from first frame to last.'}`,
    'QUALITY LOCK:\nNo random text, logos, watermarks, malformed hands or faces, duplicate people, temporal flicker, accidental morphing, jumpy motion or continuity breaks.'
  ].join('\n\n').slice(0, 5000);
}
