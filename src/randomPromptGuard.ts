import { WORLD_MUSIC_GENRES } from './data/worldMusicGenres';

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

function selectedGenreAndSubgenre(): { genre: string; subgenre: string } {
  const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
  const allGenres = WORLD_MUSIC_GENRES.flatMap(group => group.genres);
  const genreNames = new Set(allGenres.map(item => item.name));
  const subgenreNames = new Set(allGenres.flatMap(item => item.subgenres));

  const genreSelect = selects.find(select => genreNames.has(select.value));
  const subgenreSelect = selects.find(select => subgenreNames.has(select.value));

  const genre = genreSelect?.value || 'Music';
  const genreEntry = allGenres.find(item => item.name === genre);
  const fallbackSubgenre = genreEntry?.subgenres?.[0] || genre;
  const subgenre = subgenreSelect?.value || fallbackSubgenre;

  return { genre, subgenre };
}

function buildProfessionalPrompt(): string {
  const { genre, subgenre } = selectedGenreAndSubgenre();
  const detail = randomItem(PROFESSIONAL_DETAILS);

  return [
    `Professional ${subgenre} production within the ${genre} genre`,
    `strictly preserve the authentic musical identity of ${genre} and ${subgenre} without drifting into unrelated genres`,
    detail,
    `the final track must clearly sound like ${subgenre} and remain fully coherent with ${genre}`
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

      setReactTextareaValue(textarea, buildProfessionalPrompt());
      textarea.focus();
    },
    true
  );
}
