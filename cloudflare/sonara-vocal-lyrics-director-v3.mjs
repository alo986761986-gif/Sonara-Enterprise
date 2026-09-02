const VERSION = 'sonara-vocal-lyrics-director-v3';
const TARGET_MIN = 6;
const TARGET_MAX = 10;

const clean = value => String(value ?? '').replace(/\u0000/g, '').trim();
const normalizeNewlines = value => String(value ?? '').replace(/\r\n?/g, '\n');

const SECTION_HINTS = {
  intro: 'instrumental or sparse vocal pickup, intimate, natural breath',
  verse: 'intimate, close, conversational, controlled dynamics, natural breath',
  'pre-chorus': 'rising tension, connected legato, increasing emotional energy',
  prechorus: 'rising tension, connected legato, increasing emotional energy',
  chorus: 'open, confident, memorable, stronger projection, tasteful doubles and harmonies',
  hook: 'clear hook diction, memorable phrasing, confident projection',
  refrain: 'clear hook diction, memorable phrasing, confident projection',
  bridge: 'contrasting color, expressive dynamics, human phrasing, controlled vibrato',
  outro: 'relaxed release, natural decrescendo, intentional final phrase',
  instrumental: 'no lead vocal'
};

function stripDiacritics(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeLyricToken(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9à-öø-ÿ'’-]+/gi, '')
    .replace(/['’-]+/g, '')
    .trim();
}

export function lyricWords(value) {
  return normalizeNewlines(value)
    .replace(/\[[^\]]+\]/g, ' ')
    .split(/\s+/)
    .map(normalizeLyricToken)
    .filter(Boolean);
}

function sectionKey(tag) {
  const normalized = stripDiacritics(tag).toLowerCase().replace(/[^a-z0-9 -]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (/pre\s*-?\s*chorus/.test(normalized)) return 'pre-chorus';
  for (const key of ['intro', 'verse', 'chorus', 'hook', 'refrain', 'bridge', 'outro', 'instrumental']) {
    if (normalized.includes(key)) return key;
  }
  return '';
}

function annotateTag(tag) {
  const raw = clean(tag).replace(/^\[|\]$/g, '').trim();
  const key = sectionKey(raw);
  if (!key) return `[${raw}]`;
  if (/\s[-—:]\s/.test(raw)) return `[${raw}]`;
  return `[${raw} - ${SECTION_HINTS[key]}]`;
}

function defaultTaggedLyrics(raw) {
  const blocks = raw.split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean);
  if (!blocks.length) return raw;
  if (blocks.length === 1) return `${annotateTag('[Verse 1]')}\n${blocks[0]}`;
  const labels = ['Verse 1', 'Chorus', 'Verse 2', 'Chorus', 'Bridge', 'Final Chorus', 'Outro'];
  return blocks.map((block, index) => `${annotateTag(`[${labels[Math.min(index, labels.length - 1)]}]`)}\n${block}`).join('\n\n');
}

function splitLongLine(line) {
  const raw = clean(line);
  if (!raw || /^\[[^\]]+\]$/.test(raw)) return [line];
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length < 11) return [line];
  const punctuation = [];
  for (let i = 0; i < words.length - 1; i += 1) {
    if (/[,;:!?]$/.test(words[i])) punctuation.push(i + 1);
  }
  const target = Math.round(words.length / 2);
  let cut = punctuation.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
  if (!cut || cut < 3 || words.length - cut < 3) cut = target;
  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
}

function performanceLyricsFrom(original) {
  const raw = normalizeNewlines(original).trim();
  if (!raw) return '';
  const hasSectionTag = /\[(?:intro|verse|pre[- ]?chorus|chorus|hook|refrain|bridge|outro|instrumental)[^\]]*\]/i.test(raw);
  const tagged = hasSectionTag
    ? raw.replace(/\[([^\]]+)\]/g, match => annotateTag(match))
    : defaultTaggedLyrics(raw);
  return tagged
    .split('\n')
    .flatMap(splitLongLine)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function syllablesItalian(word) {
  let w = stripDiacritics(normalizeLyricToken(word));
  if (!w) return 0;
  w = w.replace(/qu/g, 'q').replace(/gu(?=[aeiou])/g, 'g');
  const groups = w.match(/[aeiouy]+/g) || [];
  return Math.max(1, groups.length);
}

function syllablesEnglish(word) {
  let w = normalizeLyricToken(word);
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = stripDiacritics(w).replace(/(?:e|es|ed)$/i, match => match === 'e' ? '' : match);
  const groups = w.match(/[aeiouy]+/gi) || [];
  return Math.max(1, groups.length);
}

function syllableCountLine(line, language) {
  const words = line.split(/\s+/).map(normalizeLyricToken).filter(Boolean);
  const counter = language === 'en' ? syllablesEnglish : syllablesItalian;
  return words.reduce((total, word) => total + counter(word), 0);
}

export function detectVocalLanguageV3(lyrics, explicit = '') {
  const chosen = clean(explicit).toLowerCase().replace('_', '-');
  if (chosen && !['auto', 'unknown', 'none'].includes(chosen)) return chosen.split('-')[0];
  const text = ` ${stripDiacritics(String(lyrics || '').toLowerCase())} `;
  if (!text.trim()) return 'unknown';

  const nap = [' nun ', ' cchiu ', ' pecché ', ' peche ', ' mo ', ' stu ', ' sta ', ' core ', ' ammore ', ' aggio ', ' comm ', ' comme ', ' sulo ', ' guagl'];
  if (nap.filter(token => text.includes(token)).length >= 2) return 'it';

  const scores = {
    it: [' che ', ' non ', ' per ', ' con ', ' sono ', ' amore ', ' cuore ', ' questa ', ' della ', ' nella ', ' io ', ' tu '],
    es: [' que ', ' para ', ' con ', ' amor ', ' corazon ', ' esta ', ' una ', ' por ', ' quiero ', ' yo '],
    fr: [' que ', ' pour ', ' avec ', ' amour ', ' coeur ', ' dans ', ' une ', ' je ', ' toi ', ' mon '],
    de: [' und ', ' ich ', ' nicht ', ' mit ', ' liebe ', ' mein ', ' eine ', ' fur ', ' du '],
    en: [' the ', ' and ', ' with ', ' love ', ' you ', ' i ', ' my ', ' in ', ' tonight ', ' heart ', ' me ']
  };
  let best = 'en';
  let bestScore = -1;
  for (const [language, tokens] of Object.entries(scores)) {
    const score = tokens.reduce((sum, token) => sum + (text.includes(token) ? 1 : 0), 0);
    if (score > bestScore) { best = language; bestScore = score; }
  }
  return best;
}

function pronunciationGuide(language, lyrics) {
  const plain = stripDiacritics(String(lyrics || '').toLowerCase());
  const neapolitan = language === 'it' && /\b(nun|cchiu|pecche|mo|stu|ammore|aggio|comme|sulo|guagl)/i.test(plain);
  if (neapolitan) {
    return 'Neapolitan/Italian pronunciation lock: preserve the written dialect, elisions and apostrophes; use pure Italian vowel shapes, clear doubled consonants, natural Neapolitan stress and open/closed vowel color; never anglicize words or normalize the dialect into standard Italian.';
  }
  if (language === 'it') return 'Italian pronunciation lock: pure vowels, clear doubled consonants, natural lexical stress, clean elisions and apostrophes, no English diphthong coloring.';
  if (language === 'en') return 'English pronunciation lock: natural connected speech, reduced unstressed vowels, clear consonants, no syllable swallowing on lyric-critical words.';
  if (language === 'es') return 'Spanish pronunciation lock: stable pure vowels, natural syllable timing, clear consonants and lexical stress; avoid English vowel coloring.';
  if (language === 'fr') return 'French pronunciation lock: natural liaison when appropriate, stable nasal vowels, clear phrase-final diction and no English vowel coloring.';
  if (language === 'de') return 'German pronunciation lock: precise consonant articulation, natural vowel length and lexical stress without exaggerated diction.';
  return 'Pronunciation lock: preserve the supplied language, words, accent and natural connected-speech behavior. Never invent, translate or replace lyric words.';
}

function performanceDirection(language, body = {}) {
  const gender = clean(body.voiceGender || body.voice_gender || body.gender);
  const requested = clean(body.vocalStyle || body.vocal_style);
  return [
    requested,
    gender,
    'stable singer identity from first phrase to last',
    'natural breath placement at phrase boundaries',
    'human micro-timing and micro-dynamics',
    'controlled vibrato mainly on sustained notes',
    'clear consonants without harsh sibilance',
    'stable formants across register changes',
    'lead vocal centered and intelligible above the instrumental',
    `language=${language}`
  ].filter(Boolean).join(', ');
}

function prosodyReport(performanceLyrics, language) {
  const lines = performanceLyrics.split('\n');
  const reports = [];
  let section = '';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    const tag = line.match(/^\[([^\]]+)\]$/);
    if (tag) { section = tag[1]; continue; }
    const syllables = syllableCountLine(line, language);
    reports.push({
      line: index + 1,
      section,
      syllables,
      target: `${TARGET_MIN}-${TARGET_MAX}`,
      status: syllables < 4 ? 'short' : syllables > 12 ? 'long' : syllables >= TARGET_MIN && syllables <= TARGET_MAX ? 'ideal' : 'acceptable'
    });
  }
  const ideal = reports.filter(item => item.status === 'ideal').length;
  const acceptable = reports.filter(item => ['ideal', 'acceptable'].includes(item.status)).length;
  return {
    targetSyllablesPerLine: [TARGET_MIN, TARGET_MAX],
    lines: reports,
    idealRatio: reports.length ? Number((ideal / reports.length).toFixed(3)) : 1,
    acceptableRatio: reports.length ? Number((acceptable / reports.length).toFixed(3)) : 1,
    longLineCount: reports.filter(item => item.status === 'long').length,
    shortLineCount: reports.filter(item => item.status === 'short').length
  };
}

export function prepareVocalLyricsV3(body = {}) {
  const originalLyrics = normalizeNewlines(body.lyrics || body.text || '').trim();
  const mode = clean(body.vocalMode || body.vocal_mode || '').toLowerCase();
  const instrumental = !originalLyrics || /instrumental|no vocals|none|off/.test(mode);
  if (instrumental) {
    return {
      version: VERSION,
      enabled: false,
      originalLyrics,
      performanceLyrics: originalLyrics,
      language: 'unknown',
      pronunciationGuide: '',
      performanceDirection: '',
      prosody: { targetSyllablesPerLine: [TARGET_MIN, TARGET_MAX], lines: [], idealRatio: 1, acceptableRatio: 1, longLineCount: 0, shortLineCount: 0 }
    };
  }

  const explicitLanguage = body.vocalLanguage || body.vocal_language || body.language || '';
  const language = detectVocalLanguageV3(originalLyrics, explicitLanguage);
  const performanceLyrics = performanceLyricsFrom(originalLyrics);
  const originalWords = lyricWords(originalLyrics);
  const performanceWords = lyricWords(performanceLyrics);
  if (originalWords.join('\u0001') !== performanceWords.join('\u0001')) {
    throw new Error('SONARA Vocal Lyrics V3 refused a performance rewrite because lyric words changed.');
  }

  return {
    version: VERSION,
    enabled: true,
    originalLyrics,
    performanceLyrics,
    language,
    pronunciationGuide: pronunciationGuide(language, originalLyrics),
    performanceDirection: performanceDirection(language, body),
    prosody: prosodyReport(performanceLyrics, language),
    wordCount: originalWords.length,
    wordsPreserved: true
  };
}

export function buildVocalLyricsV3Body(body = {}) {
  const prepared = prepareVocalLyricsV3(body);
  if (!prepared.enabled) return { ...body, sonaraVocalLyricsV3: VERSION, sonaraVocalLyricsEnabled: false };

  const combinedVocalStyle = [
    clean(body.vocalStyle || body.vocal_style),
    prepared.performanceDirection,
    prepared.pronunciationGuide,
    'LYRICS LOCK: sing every supplied lyric word in order; do not translate, paraphrase, invent or omit words. Preserve section order and intentional repetitions.'
  ].filter(Boolean).join('. ');

  return {
    ...body,
    lyrics: prepared.performanceLyrics,
    language: prepared.language,
    vocalLanguage: prepared.language,
    vocal_language: prepared.language,
    vocalStyle: combinedVocalStyle,
    vocal_style: combinedVocalStyle,
    sonaraOriginalLyrics: prepared.originalLyrics,
    sonaraLyricsDisplay: prepared.originalLyrics,
    sonaraPerformanceLyrics: prepared.performanceLyrics,
    sonaraLyricsLock: true,
    sonaraVocalIdentityLock: true,
    sonaraPronunciationLock: true,
    sonaraLyricsVerificationRequired: true,
    sonaraVocalLyricsV3: VERSION,
    sonaraVocalLyricsEnabled: true,
    sonaraProsodyProfile: prepared.prosody,
    sonaraPronunciationGuide: prepared.pronunciationGuide,
    sonaraVocalPerformanceDirection: prepared.performanceDirection
  };
}

export const VOCAL_LYRICS_DIRECTOR_V3 = VERSION;
