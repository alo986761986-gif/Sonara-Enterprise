export type VeoSafetyCategory =
  | 'celebrity'
  | 'child'
  | 'video-safety'
  | 'dangerous'
  | 'hate'
  | 'prohibited'
  | 'third-party'
  | 'sexual'
  | 'toxic'
  | 'violence'
  | 'vulgar'
  | 'other';

const SUPPORT_CODE_CATEGORY: Record<string, VeoSafetyCategory> = {
  '29310472': 'celebrity',
  '15236754': 'celebrity',
  '58061214': 'child',
  '17301594': 'child',
  '64151117': 'video-safety',
  '42237218': 'video-safety',
  '62263041': 'dangerous',
  '57734940': 'hate',
  '22137204': 'hate',
  '89371032': 'prohibited',
  '49114662': 'prohibited',
  '63429089': 'prohibited',
  '72817394': 'prohibited',
  '60599140': 'prohibited',
  '35561574': 'third-party',
  '35561575': 'third-party',
  '90789179': 'sexual',
  '43188360': 'sexual',
  '78610348': 'toxic',
  '61493863': 'violence',
  '56562880': 'violence',
  '32635315': 'vulgar',
  '74803281': 'other',
  '29578790': 'other',
  '42876398': 'other'
};

const BASE_NEGATIVE_PROMPT = [
  'recognizable celebrity likeness',
  'real public figure likeness',
  'identifiable real person',
  'minor or child',
  'nudity',
  'sexual content',
  'graphic injury',
  'blood or gore',
  'hate symbols',
  'copyrighted character',
  'brand logo',
  'watermark',
  'subtitles',
  'random text'
].join(', ');

export function extractVeoSupportCodes(message: unknown): string[] {
  const text = String(message || '');
  const found = text.match(/\b\d{8}\b/g) || [];
  return [...new Set(found)];
}

export function veoSafetyCategory(message: unknown): VeoSafetyCategory | null {
  const text = String(message || '');
  for (const code of extractVeoSupportCodes(text)) {
    const category = SUPPORT_CODE_CATEGORY[code];
    if (category) return category;
  }
  if (/celebrity|prominent person|public figure|recognizable real person/i.test(text)) return 'celebrity';
  if (/child safety|minor|child/i.test(text)) return 'child';
  if (/sexual|suggestive|nudity/i.test(text)) return 'sexual';
  if (/violence|violent|gore|blood/i.test(text)) return 'violence';
  if (/dangerous/i.test(text)) return 'dangerous';
  if (/hate/i.test(text)) return 'hate';
  if (/third[- ]party|copyright/i.test(text)) return 'third-party';
  if (/filtered out|usage guidelines|safety filter|raiMediaFiltered/i.test(text)) return 'other';
  return null;
}

export function isVeoSafetyFilterError(message: unknown): boolean {
  return veoSafetyCategory(message) !== null;
}

export function veoNegativePrompt(message: unknown = ''): string {
  const category = veoSafetyCategory(message);
  const extra = category === 'celebrity'
    ? 'celebrity face, famous musician, famous actor, famous athlete, influencer likeness, impersonation, lookalike of a real person'
    : category === 'third-party'
      ? 'copyrighted franchise character, trademarked costume, protected logo, copied movie scene'
      : category === 'violence'
        ? 'graphic violence, wounds, gore, blood, bodily injury'
        : category === 'sexual'
          ? 'nudity, erotic pose, sexualized clothing, sexual activity'
          : '';
  return extra ? `${BASE_NEGATIVE_PROMPT}, ${extra}` : BASE_NEGATIVE_PROMPT;
}

function neutralizeCelebrityReferences(prompt: string, aggressive: boolean) {
  let text = String(prompt || '').replace(/\s+/g, ' ').trim();
  text = text
    .replace(/@[A-Za-z0-9_.-]+/g, 'an original fictional adult performer')
    .replace(/\b(?:celebrity|public figure|famous person|real person|real-life person|living artist|famous singer|famous rapper|famous actor|famous athlete|influencer)\b/gi, 'original fictional adult performer')
    .replace(/\b(?:in the exact style of|in the style of|looks? like|looking like|resembling|likeness of|portrait of|impersonating|impersonation of|played by|starring|featuring)\s+[^,.;\n]{2,80}/gi, 'featuring an original fictional adult performer');

  if (aggressive) {
    text = text
      .replace(/\b(?:[A-Z][a-z]{2,}|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]{2,}|[A-Z]{2,})){1,2}\b/g, 'an original fictional adult performer')
      .replace(/\b\d{1,3}\s+[A-Z][A-Za-z0-9'-]{2,}\b/g, 'an original fictional adult performer');
  }

  return text.slice(0, 3600);
}

export function buildVeoSafetyRetryPrompt(
  originalPrompt: string,
  errorMessage: unknown,
  retryCount: number,
  context?: { scene?: number; clipCount?: number; aspectRatio?: '16:9' | '9:16' }
): string {
  const category = veoSafetyCategory(errorMessage);
  const attempt = Math.max(1, Math.round(Number(retryCount) || 1));
  const scene = Math.max(1, Math.round(Number(context?.scene) || 1));
  const clipCount = Math.max(scene, Math.round(Number(context?.clipCount) || scene));
  const aspectRatio = context?.aspectRatio || '16:9';

  if (category === 'celebrity') {
    if (attempt >= 3) {
      return [
        `Create an original cinematic ${aspectRatio} music-video shot for scene ${scene} of ${clipCount}.`,
        'Use one clearly fictional adult performer aged 25 or older with an original face, original wardrobe and no resemblance to any real or recognizable person.',
        'The performer must not resemble a celebrity, public figure, musician, actor, athlete, influencer or other identifiable individual.',
        'Use premium cinematic lighting, coherent production design, natural anatomy, realistic motion and strong visual continuity.',
        'No real-person likeness, no impersonation, no copyrighted character, no logos, no text, no nudity, no graphic violence and no unsafe content.'
      ].join(' ');
    }

    const neutralized = neutralizeCelebrityReferences(originalPrompt, attempt >= 2);
    return [
      neutralized,
      `Scene ${scene} of ${clipCount}.`,
      'SONARA SAFE IDENTITY REWRITE: preserve only the general action, setting, camera language, lighting, color palette and mood.',
      'Replace every named, famous, public or recognizable person with an original fictional adult performer aged 25 or older.',
      'Create a completely original face and appearance with no celebrity resemblance, impersonation, lookalike or identity-specific facial features.',
      'Keep the result cinematic, policy-compliant and visually coherent with the surrounding scenes.'
    ].join(' ').slice(0, 5000);
  }

  if (attempt >= 3) {
    return [
      `Create a safe original cinematic ${aspectRatio} music-video shot for scene ${scene} of ${clipCount}.`,
      'Use fictional adults only, original characters and original production design.',
      'Focus on atmosphere, lighting, camera movement, environment, performance and musical energy.',
      'Exclude any element that could violate safety, privacy or third-party-content rules. No graphic, sexual, hateful, dangerous or prohibited content.'
    ].join(' ');
  }

  return [
    String(originalPrompt || '').slice(0, 3800),
    `Scene ${scene} of ${clipCount}.`,
    `SONARA SAFE REGENERATION ATTEMPT ${attempt}: if any requested detail is ambiguous or conflicts with Veo safety rules, omit that detail and replace it with a benign original fictional alternative.`,
    'Use fictional adults only and avoid recognizable real-person likenesses, copyrighted characters, logos, graphic violence, sexual content, hateful content or dangerous instructions.',
    'Preserve the safe setting, mood, camera, lighting, palette, motion and continuity.'
  ].join(' ').slice(0, 5000);
}
