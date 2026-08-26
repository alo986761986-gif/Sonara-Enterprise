import {
  buildProfessionalLyricsFallback,
  buildProfessionalLyricsInstruction,
  type ProfessionalLyricsInput
} from '../src/professionalLyrics';

export const config = { api: { bodyParser: true } };

const MAX_BODY_CHARS = 24_000;
const MAX_OUTPUT_CHARS = 4_100;

const SMART_CONCEPTS = [
  'a decisive night when the protagonist finally chooses a new direction and cannot return to the old life',
  'an unresolved relationship told through one concrete place and one object that keeps returning with a different meaning',
  'a comeback after being underestimated, focused on earned confidence rather than empty boasting',
  'two people meeting again after years and realizing that memory and reality no longer match',
  'a private confession that starts guarded and becomes emotionally direct by the final section',
  'leaving a familiar city before dawn, carrying only what matters and facing an uncertain future',
  'a celebration after a difficult period, where joy feels deserved because the earlier struggle remains visible',
  'a conflict between ambition and loyalty, with the narrator forced to choose what kind of person to become',
  'a late-night drive in which changing streets mirror a changing emotional decision',
  'a spiritual search that moves from doubt to a grounded sense of connection without becoming preachy',
  'the exact moment a friendship becomes love, told through small physical details instead of declarations',
  'recovering from loss without pretending the past disappeared, ending with acceptance rather than a perfect resolution',
  'a tense confrontation where neither person says the central truth until the bridge or final section',
  'returning to a childhood place and noticing what changed, what remained, and what the narrator now understands differently',
  'a restless night before an important decision, with increasing urgency and a clear emotional release at the end',
  'a communal moment where individual voices gradually become one shared statement or response',
  'a forbidden attraction where restraint, distance and timing create more tension than explicit description',
  'a self-reinvention story built around work, repetition and small victories instead of sudden transformation',
  'a mysterious message, object or encounter that gradually changes the narrator’s interpretation of the night',
  'a peaceful reset after burnout, focused on ordinary sensory details and learning to slow down without guilt'
] as const;

function clean(value: unknown, max = 160): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(Math.max(min, Math.min(max, parsed))) : fallback;
}

function json(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}

function inputFromBody(body: Record<string, any>): ProfessionalLyricsInput {
  const vocalMode = ['male', 'female', 'duet', 'instrumental'].includes(String(body.vocalMode))
    ? body.vocalMode
    : 'male';
  return {
    language: clean(body.language, 24) || 'en',
    languageName: clean(body.languageName, 80) || 'English',
    genreFamily: clean(body.genreFamily, 120) || 'Pop',
    genre: clean(body.genre, 120) || 'Pop',
    subgenre: clean(body.subgenre, 120) || clean(body.genre, 120) || 'Pop',
    mood: clean(body.mood, 80) || 'Authentic',
    vocalMode,
    variant: integer(body.variant, Date.now() % 100000, 0, Number.MAX_SAFE_INTEGER),
    durationSec: integer(body.durationSec, 180, 30, 480),
    bpm: integer(body.bpm, 120, 40, 220),
    title: clean(body.title, 160)
  };
}

function sanitizeLyrics(value: unknown): string {
  let text = String(value ?? '')
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .replace(/^\s*(?:title|titolo)\s*:\s*[^\n]+\n+/i, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length > MAX_OUTPUT_CHARS) {
    const clipped = text.slice(0, MAX_OUTPUT_CHARS);
    const boundary = clipped.lastIndexOf('\n');
    text = clipped.slice(0, boundary > 3600 ? boundary : MAX_OUTPUT_CHARS).trim();
  }
  return text;
}

function qualityLooksValid(text: string, input: ProfessionalLyricsInput): boolean {
  if (input.vocalMode === 'instrumental') return text === '';
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const lyricLines = lines.filter(line => !/^\[.+\]$/.test(line));
  const sectionCount = lines.filter(line => /^\[.+\]$/.test(line)).length;
  const minLines = Number(input.durationSec || 180) >= 240 ? 24 : 16;
  if (lyricLines.length < minLines || sectionCount < 3 || text.length < 420) return false;
  const normalized = lyricLines.map(line => line.toLocaleLowerCase()).filter(line => line.length > 8);
  const uniqueRatio = new Set(normalized).size / Math.max(1, normalized.length);
  return uniqueRatio >= 0.68;
}

function smartConceptFor(input: ProfessionalLyricsInput): string {
  const seed = `${input.genreFamily}|${input.genre}|${input.subgenre}|${input.mood}|${input.variant}`;
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return SMART_CONCEPTS[(hash >>> 0) % SMART_CONCEPTS.length];
}

async function generateWithGemini(input: ProfessionalLyricsInput, creativeConcept = ''): Promise<string | null> {
  const apiKey = clean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '', 512);
  if (!apiKey || input.vocalMode === 'instrumental') return null;

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const baseInstruction = buildProfessionalLyricsInstruction(input);
  const instruction = creativeConcept
    ? `${baseInstruction}\n\nINTELLIGENT RANDOM CONCEPT: ${creativeConcept}. Use this as the narrative engine of the song, interpreted through the selected genre, subgenre and atmosphere. Do not quote or explain this instruction; transform it into original lyrics.`
    : baseInstruction;
  const response = await ai.models.generateContent({
    model: String(process.env.SONARA_LYRICS_MODEL || 'gemini-2.5-flash').trim(),
    contents: instruction,
    config: {
      temperature: creativeConcept ? 1.18 : 1.05,
      topP: creativeConcept ? 0.97 : 0.95,
      maxOutputTokens: 1900,
      responseMimeType: 'text/plain'
    }
  });
  const text = sanitizeLyrics(response.text || '');
  return qualityLooksValid(text, input) ? text : null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    if (raw.length > MAX_BODY_CHARS) return json(res, 413, { error: 'REQUEST_TOO_LARGE' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const input = inputFromBody(body);
    const smartRandom = body.smartRandom === true;
    const creativeConcept = smartRandom ? smartConceptFor(input) : '';

    if (input.vocalMode === 'instrumental') {
      return json(res, 200, { lyrics: '', source: 'instrumental', quality: 'professional-v2' });
    }

    let lyrics: string | null = null;
    let source = smartRandom ? 'professional-smart-fallback-v2' : 'professional-fallback-v2';
    try {
      lyrics = await generateWithGemini(input, creativeConcept);
      if (lyrics) source = smartRandom ? 'gemini-intelligent-random-v2' : 'gemini-professional-v2';
    } catch (error) {
      console.warn('[SONARA][Lyrics] Gemini generation unavailable, using professional fallback.', error instanceof Error ? error.message : String(error));
    }

    if (!lyrics) lyrics = buildProfessionalLyricsFallback(input);
    lyrics = sanitizeLyrics(lyrics);
    return json(res, 200, {
      lyrics,
      source,
      quality: smartRandom ? 'intelligent-random-v2' : 'professional-v2',
      taxonomy: `${input.genreFamily} > ${input.genre} > ${input.subgenre}`,
      atmosphere: input.mood,
      durationSec: input.durationSec,
      bpm: input.bpm,
      smartRandom,
      ...(smartRandom ? { creativeConcept } : {})
    });
  } catch (error) {
    return json(res, 400, { error: 'LYRICS_GENERATION_FAILED', message: error instanceof Error ? error.message : 'Unable to generate lyrics.' });
  }
}
