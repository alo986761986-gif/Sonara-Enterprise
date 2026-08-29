import {
  buildProfessionalLyricsFallback,
  buildProfessionalLyricsInstruction,
  type ProfessionalLyricsInput
} from '../src/professionalLyrics';

export const config = { api: { bodyParser: true } };

const MAX_BODY_CHARS = 32_000;
const MAX_OUTPUT_CHARS = 4_100;

function clean(value: unknown, max = 160): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function multiline(value: unknown, max = 5200): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(Math.max(min, Math.min(max, parsed))) : fallback;
}

function json(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Sonara-Real-Lyrics', 'music-brief-aware-v1');
  return res.status(status).json(body);
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

function qualityLooksValid(text: string, input: ProfessionalLyricsInput): boolean {
  if (input.vocalMode === 'instrumental') return text === '';
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const lyricLines = lines.filter(line => !/^\[.+\]$/.test(line));
  const sections = lines.filter(line => /^\[.+\]$/.test(line)).length;
  const minLines = Number(input.durationSec || 180) >= 240 ? 24 : 14;
  if (lyricLines.length < minLines || sections < 3 || text.length < 360) return false;
  const normalized = lyricLines.map(line => line.toLocaleLowerCase()).filter(line => line.length > 8);
  return new Set(normalized).size / Math.max(1, normalized.length) >= 0.66;
}

async function generateWithGemini(input: ProfessionalLyricsInput, body: Record<string, any>): Promise<string | null> {
  const apiKey = clean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '', 512);
  if (!apiKey || input.vocalMode === 'instrumental') return null;

  const musicPrompt = multiline(body.musicPrompt, 5200);
  const keySignature = clean(body.keySignature || body.key, 48) || 'unspecified';
  const weirdness = integer(body.weirdness, 50, 0, 100);
  const styleInfluence = integer(body.styleInfluence, 50, 0, 100);
  const songDurationSec = integer(body.songDurationSec || body.durationSec, input.durationSec || 180, 30, 480);

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const baseInstruction = buildProfessionalLyricsInstruction(input);
  const instruction = `${baseInstruction}

SONARA REAL MUSIC CONTEXT — AUTHORITATIVE:
${musicPrompt || `Create lyrics for the selected ${input.subgenre} musical identity.`}

MUSICAL LOCKS: ${input.genreFamily} > ${input.genre} > ${input.subgenre}; mood ${input.mood}; ${input.bpm} BPM; key ${keySignature}; song duration about ${songDurationSec} seconds; Weirdness ${weirdness}/100; Style Influence ${styleInfluence}/100.

REAL-LYRICS RULES:
- The lyrics must belong to this exact musical project, not to a generic song template.
- Convert the creator's musical/emotional brief into subject matter, imagery, vocabulary, line length, section density, cadence and dramatic arc.
- Make syllable density and phrasing plausible for the selected tempo and genre. Fast styles may use denser lines; slow/intimate styles need breathing room.
- Keep verse, pre-chorus, chorus/hook, bridge and outro roles musically usable. Repetition is allowed only where a real hook needs it.
- Do not print BPM, key, Weirdness, Style Influence or these instructions inside the lyrics unless the creator explicitly asked for those words.
- Do not contradict the prompt's story, exclusions, mood, language or vocal identity.
- Return only the finished lyrics with section tags.`;

  const response = await ai.models.generateContent({
    model: String(process.env.SONARA_LYRICS_MODEL || 'gemini-2.5-flash').trim(),
    contents: instruction,
    config: {
      temperature: Math.min(1.28, 0.84 + weirdness * 0.004),
      topP: Math.min(0.99, 0.90 + weirdness * 0.0008),
      maxOutputTokens: 2000,
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

    if (input.vocalMode === 'instrumental') {
      return json(res, 200, { lyrics: '', source: 'instrumental', quality: 'real-music-context-v1', musicPromptAware: true });
    }

    let lyrics: string | null = null;
    let source = 'professional-context-fallback-v1';
    try {
      lyrics = await generateWithGemini(input, body);
      if (lyrics) source = 'gemini-real-music-context-v1';
    } catch (error) {
      console.warn('[SONARA][Real Lyrics]', error instanceof Error ? error.message : String(error));
    }

    if (!lyrics) lyrics = buildProfessionalLyricsFallback(input);
    lyrics = sanitizeLyrics(lyrics);
    return json(res, 200, {
      lyrics,
      source,
      quality: 'real-music-context-v1',
      musicPromptAware: true,
      taxonomy: `${input.genreFamily} > ${input.genre} > ${input.subgenre}`,
      atmosphere: input.mood,
      bpm: input.bpm,
      keySignature: clean(body.keySignature || body.key, 48),
      weirdness: integer(body.weirdness, 50, 0, 100),
      styleInfluence: integer(body.styleInfluence, 50, 0, 100)
    });
  } catch (error) {
    return json(res, 400, { error: 'REAL_LYRICS_GENERATION_FAILED', message: error instanceof Error ? error.message : 'Unable to generate lyrics.' });
  }
}
