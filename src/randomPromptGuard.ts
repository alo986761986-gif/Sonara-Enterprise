const GROOVE_DETAILS = [
  'a deeply defined groove with authentic rhythmic phrasing, precise drum programming, natural swing and strong forward motion',
  'a sophisticated rhythmic foundation with detailed percussion, controlled syncopation, expressive accents and a groove faithful to the selected style',
  'a powerful but musical rhythmic architecture, with tight timing, organic movement, nuanced percussion layers and a clearly recognizable stylistic pulse',
  'a refined groove with dynamic rhythmic development, characteristic accents, tasteful fills and natural variation throughout the arrangement'
] as const;

const ARRANGEMENT_DETAILS = [
  'a professional arrangement with a focused intro, gradual development, memorable main section, dynamic breakdown, strong climax and satisfying outro',
  'an evolving arrangement with clear musical storytelling, tension and release, tasteful transitions, contrast between sections and a polished final progression',
  'a release-ready song structure with coherent section development, controlled energy changes, impactful transitions and a strong musical payoff',
  'a sophisticated structure with layered development, strategic drops and pauses, smooth transitions, evolving motifs and a convincing final climax'
] as const;

const SOUND_DETAILS = [
  'rich genre-appropriate instrumentation, layered textures, expressive melodic details, controlled low end and a distinctive professional sonic identity',
  'carefully selected instruments and timbres that belong naturally to the chosen subgenre, with depth, warmth, clarity and modern sound design',
  'detailed sound design, authentic genre-specific timbres, musical bass movement, expressive harmonic layers and a wide immersive stereo image',
  'a premium sonic palette with characteristic instrumentation, subtle atmospheric layers, memorable musical motifs and detailed frequency separation'
] as const;

const MIX_DETAILS = [
  'a clean high-end studio mix with punchy transients, controlled bass, clear midrange, open highs, balanced dynamics and a polished release-ready master',
  'professional mixing and mastering with strong separation, deep but controlled low frequencies, natural dynamics, wide stereo depth and commercial loudness',
  'a precise modern mix with detailed transient control, balanced frequency spectrum, strong mono compatibility, spacious imaging and a premium final master',
  'a polished professional finish with clarity, depth, punch, controlled dynamics, musical saturation, smooth high frequencies and a competitive master'
] as const;

const ENERGY_DETAILS = [
  'maintain a coherent emotional arc and consistent stylistic identity from the first bar to the final section',
  'let the energy evolve naturally while preserving the exact character of the selected genre and subgenre throughout the track',
  'create contrast and movement without leaving the selected stylistic language, keeping the musical identity unmistakable from start to finish',
  'develop intensity progressively with expressive details and controlled dynamics while remaining completely faithful to the selected musical style'
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

function familyProductionLanguage(family: string): string {
  const value = family.toLowerCase();

  if (value.includes('electronic') || value.includes('dance')) {
    return 'Use club-ready drum impact, a disciplined kick-and-bass relationship, detailed percussion, evolving synth textures and precise spatial effects appropriate to the style.';
  }
  if (value.includes('hip-hop') || value.includes('rap')) {
    return 'Use authoritative drums, a strong bass foundation, expressive rhythmic pockets, tasteful sampling or instrumentation and enough space for a convincing vocal or lead presence.';
  }
  if (value.includes('rock') || value.includes('metal')) {
    return 'Use convincing live-band energy, expressive guitars or genre-correct amplified instrumentation, powerful drums, dynamic performance detail and natural section-to-section intensity.';
  }
  if (value.includes('jazz')) {
    return 'Use authentic ensemble interplay, expressive dynamics, sophisticated harmonic movement, human timing, detailed acoustic tone and believable instrumental conversation.';
  }
  if (value.includes('blues')) {
    return 'Use expressive phrasing, authentic blues harmony, human performance dynamics, warm organic instrumentation and emotionally convincing call-and-response movement.';
  }
  if (value.includes('r&b') || value.includes('soul') || value.includes('funk')) {
    return 'Use a warm pocket, expressive bass movement, rich chords, tasteful rhythmic syncopation, soulful instrumentation and smooth but detailed production.';
  }
  if (value.includes('reggae') || value.includes('jamaican')) {
    return 'Use authentic offbeat rhythmic language, deep bass, spacious groove, genre-correct percussion and instrumentation, with natural dub-style depth where appropriate.';
  }
  if (value.includes('latin') || value.includes('caribbean')) {
    return 'Use authentic regional percussion, danceable rhythmic interplay, expressive melodic instrumentation, strong groove hierarchy and culturally coherent arrangement language.';
  }
  if (value.includes('africa')) {
    return 'Use layered polyrhythmic movement, authentic percussion language, interlocking musical parts, expressive bass and regionally coherent instrumental textures.';
  }
  if (value.includes('classical') || value.includes('orchestral')) {
    return 'Use believable acoustic orchestration, expressive dynamics, natural articulation, coherent harmonic development, realistic instrumental balance and cinematic depth where appropriate.';
  }

  return 'Use instrumentation, rhythm, harmony, performance language and production choices that are unmistakably authentic to the selected musical family and subgenre.';
}

function buildProfessionalRandomPrompt(textarea: HTMLTextAreaElement): string {
  const { family, genre, subgenre, mood } = currentGeneratorSelections(textarea);

  return [
    `Create a professional ${subgenre} track inside the ${genre} genre and ${family} musical family.`,
    mood ? `The emotional direction is ${mood}.` : '',
    `The musical identity must remain unmistakably ${subgenre} from beginning to end, using the authentic rhythmic language, instrumentation, harmony, groove and production vocabulary of ${subgenre}.`,
    familyProductionLanguage(family),
    randomItem(GROOVE_DETAILS) + '.',
    randomItem(SOUND_DETAILS) + '.',
    randomItem(ARRANGEMENT_DETAILS) + '.',
    randomItem(ENERGY_DETAILS) + '.',
    randomItem(MIX_DETAILS) + '.',
    `Avoid unrelated genre influences or stylistic drift; every musical choice must reinforce ${genre} / ${subgenre}.`
  ].filter(Boolean).join(' ');
}

function buildSelectionPrompt(textarea: HTMLTextAreaElement): string {
  const { family, genre, subgenre, mood } = currentGeneratorSelections(textarea);
  return [
    `Professional ${subgenre} production`,
    `${genre} genre`,
    `${family} musical family`,
    mood ? `${mood} mood` : '',
    `authentic ${subgenre} groove, instrumentation, harmony and sound palette`,
    'professional arrangement, detailed mix and polished master'
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
  setReactTextareaValue(textarea, buildSelectionPrompt(textarea));
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

      setReactTextareaValue(textarea, buildProfessionalRandomPrompt(textarea));
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

      requestAnimationFrame(refreshPromptFromSelections);
    },
    true
  );
}
