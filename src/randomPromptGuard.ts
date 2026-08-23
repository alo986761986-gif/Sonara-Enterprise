const PROFESSIONAL_DETAILS = [
  'authentic genre-specific groove, precise rhythmic language, deep controlled low end, detailed percussion, expressive musical development, polished professional mix and master',
  'faithful genre aesthetics, sophisticated arrangement, strong musical identity, clean transients, rich harmonic depth, immersive stereo image, release-ready mastering',
  'genre-correct drum programming, characteristic bass movement, refined sound design, evolving arrangement, balanced dynamics, premium studio production',
  'authentic rhythmic patterns, distinctive genre instrumentation, tasteful melodic development, controlled sub frequencies, spacious mix, high-end professional master',
  'strict stylistic coherence, detailed groove architecture, expressive textures, natural transitions, powerful but clean dynamics, modern professional production',
  'recognizable genre identity, refined percussion, musical bass foundation, atmospheric depth, memorable motifs, precise mix balance, commercial-quality master',
  'professional arrangement with clear intro, development, breakdown and climax, authentic genre vocabulary, detailed sound design, clean low end and polished master'
] as const;

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function currentGeneratorSelections(textarea: HTMLTextAreaElement) {
  const generatorPanel = textarea.closest('section');
  const selects = generatorPanel
    ? Array.from(generatorPanel.querySelectorAll('select')) as HTMLSelectElement[]
    : [];

  return {
    family: selects[0]?.value || 'Music',
    genre: selects[1]?.value || 'Music',
    subgenre: selects[2]?.value || selects[1]?.value || 'Music'
  };
}

function buildProfessionalPrompt(textarea: HTMLTextAreaElement): string {
  const { family, genre, subgenre } = currentGeneratorSelections(textarea);
  const detail = randomItem(PROFESSIONAL_DETAILS);

  return [
    `Professional ${subgenre} production`,
    `music family: ${family}`,
    `main genre: ${genre}`,
    `subgenre: ${subgenre}`,
    `strictly follow the authentic conventions, rhythm, instrumentation, groove and sound palette of ${subgenre} within ${genre}`,
    `do not drift into unrelated genres or subgenres`,
    detail,
    `the finished track must be immediately recognizable as professional ${subgenre}`
  ].join(', ');
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
      event.stopImmediatePropagation();

      setReactTextareaValue(textarea, buildProfessionalPrompt(textarea));
      textarea.focus();
    },
    true
  );
}
