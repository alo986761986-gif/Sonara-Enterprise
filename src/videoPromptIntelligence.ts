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

export function buildIntelligentVideoPrompt(currentPrompt: string, context: VideoPromptContext): string {
  const existingIntent = currentPrompt.match(/^CREATOR INTENT — PRESERVE AS AUTHORITATIVE:\s*([\s\S]*?)(?:\n\nSONARA INTELLIGENT VIDEO DIRECTION:|$)/)?.[1];
  const intent = String(existingIntent || currentPrompt).replace(/\s+/g, ' ').trim() || choose(SUBJECTS, context.variant, 7);
  const { variant, aspectRatio, durationSeconds } = context;
  return [
    `CREATOR INTENT — PRESERVE AS AUTHORITATIVE:\n${intent}`,
    `SONARA INTELLIGENT VIDEO DIRECTION:\nTransform the creator intent into an original ${formatDuration(durationSeconds)} music video with ${choose(VISUAL_LANGUAGES, variant, 8)}.`,
    `MUSIC-TO-PICTURE LANGUAGE:\nUse ${choose(MUSIC_DIRECTIONS, variant, 9)}. Synchronize visual energy to musical sections rather than cutting mechanically on every beat: establish atmosphere in the intro, build movement through verses, expand scale on hooks or drops, and reserve the strongest image for the climax.`,
    `CINEMATOGRAPHY:\n${choose(CAMERAS, variant, 10)}. Maintain intentional eyelines, screen direction, lens logic, depth and physically believable camera motion.`,
    `LIGHT / COLOR / DESIGN:\n${choose(LIGHTING, variant, 11)}. Use coherent wardrobe, locations, props, texture and production design with premium realistic detail.`,
    `FORMAT AND CONTINUITY LOCK:\nCompose every shot specifically for ${aspectRatio}. Target ${formatDuration(durationSeconds)}. ${durationSeconds > 8 ? 'Create a clear opening, development, escalation, climax and resolved final image; preserve character identity, wardrobe, geography, lighting logic and color science across every generated scene.' : 'Make the short clip feel complete, legible and memorable from its first frame.'}`,
    'ORIGINALITY AND QUALITY LOCK:\nUse broad cinematic and musical craft knowledge without copying any identifiable existing work. No named artists, copyrighted characters, logos, watermarks, subtitles, random text, malformed hands or faces, duplicate people, temporal flicker, jumpy motion or continuity breaks.'
  ].join('\n\n').slice(0, 5000);
}
