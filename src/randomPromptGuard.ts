const RANDOM_PROMPTS = [
  'Professional music production, deep detailed low end, expressive rhythm, immersive stereo space, evolving arrangement, polished professional mix and master',
  'Professional music production, warm musical dynamics, rich harmonic texture, organic movement, cinematic depth, clean transients, professional mastering',
  'Professional music production, hypnotic groove, atmospheric layers, expressive melodic development, powerful dynamics, spacious mix, release-ready master',
  'Professional music production, authentic musical character, modern sound design, detailed percussion, emotional harmonic movement, wide stereo image, premium mix and master',
  'Professional music production, driving rhythm, textured ambience, memorable musical motifs, controlled bass, dynamic transitions, high-end studio production',
  'Professional music production, deep immersive atmosphere, tight drums, warm bass, evolving textures, elegant transitions, balanced dynamics, polished club-ready master',
  'Professional music production, sophisticated groove, punchy transients, rich spatial depth, subtle harmonic movement, detailed sound design, clean professional master'
] as const;

function randomPrompt(): string {
  return RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
}

function setReactTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

export function installRandomPromptGuard() {
  document.addEventListener(
    'click',
    event => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button');
      if (!button || button.textContent?.trim() !== 'RANDOM') return;

      const textarea = document.getElementById('sonara-prompt');
      if (!(textarea instanceof HTMLTextAreaElement)) return;

      event.preventDefault();
      event.stopPropagation();
      setReactTextareaValue(textarea, randomPrompt());
      textarea.focus();
    },
    true
  );
}
