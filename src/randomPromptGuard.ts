const PROFESSIONAL_DETAILS = [
  'authentic instrumentation and performance language, balanced dynamics, clear arrangement, polished studio mix and master',
  'faithful stylistic phrasing, appropriate rhythmic feel, natural musical development, refined professional production',
  'genre-appropriate instrumentation, characteristic groove, expressive arrangement, clean detailed mix and commercial-quality master',
  'authentic musical vocabulary, precise rhythmic feel, tasteful dynamics, coherent arrangement, polished professional mastering',
  'recognizable stylistic identity, appropriate instrumentation, natural transitions, balanced frequency spectrum and high-end studio finish',
  'faithful genre character, expressive performance, controlled dynamics, clear structure, detailed mix and release-ready master'
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
    subgenre: selects[2]?.value || selects[1]?.value || 'Music',
    mood: selects[3]?.value || ''
  };
}

function buildProfessionalPrompt(textarea: HTMLTextAreaElement): string {
  const { family, genre, subgenre, mood } = currentGeneratorSelections(textarea);
  const detail = randomItem(PROFESSIONAL_DETAILS);

  return [
    subgenre,
    genre,
    family,
    mood,
    `professional ${subgenre} production`,
    detail
  ].filter(Boolean).join(', ');
}

function setReactTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function refreshPromptFromSelections() {
  const textarea = document.getElementById('sonara-prompt');
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  setReactTextareaValue(textarea, buildProfessionalPrompt(textarea));
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

  document.addEventListener(
    'change',
    event => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;

      const textarea = document.getElementById('sonara-prompt');
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      const panel = textarea.closest('section');
      if (!panel || !panel.contains(target)) return;

      const selects = Array.from(panel.querySelectorAll('select')) as HTMLSelectElement[];
      const index = selects.indexOf(target);
      if (index < 0 || index > 2) return;

      // Family/genre changes also update dependent selects in React.
      // Wait one frame so the prompt always reads the final genre + subgenre pair.
      requestAnimationFrame(refreshPromptFromSelections);
    },
    true
  );
}
