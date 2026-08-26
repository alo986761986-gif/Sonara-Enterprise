import { GoogleGenAI } from '@google/genai';
import {
  buildProfessionalLyricsFallback,
  buildProfessionalLyricsInstruction,
  type ProfessionalLyricsInput
} from '../src/professionalLyrics';

export const config = { api: { bodyParser: true } };

const MAX_BODY_CHARS = 24_000;
const MAX_OUTPUT_CHARS = 4_100;

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

async function generateWithGemini(input: ProfessionalLyricsInput): Promise<string | null> {
  const apiKey = clean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '', 512);
  if (!apiKey || input.vocalMode === 'instrumental') return null;

  const ai = new GoogleGenAI({ apiKey });
  const instruction = buildProfessionalLyricsInstruction(input);
  const response = await ai.models.generateContent({
    model: String(process.env.SONARA_LYRICS_MODEL || 'gemini-2.5-flash').trim(),
    contents: instruction,
    config: {
      temperature: 1.05,
      topP: 0.95,
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

    if (input.vocalMode === 'instrumental') {
      return json(res, 200, { lyrics: '', source: 'instrumental', quality: 'professional-v2' });
    }

    let lyrics: string | null = null;
    let source = 'professional-fallback-v2';
    try {
      lyrics = await generateWithGemini(input);
      if (lyrics) source = 'gemini-professional-v2';
    } catch (error) {
      console.warn('[SONARA][Lyrics] Gemini generation unavailable, using professional fallback.', error instanceof Error ? error.message : String(error));
    }

    if (!lyrics) lyrics = buildProfessionalLyricsFallback(input);
    lyrics = sanitizeLyrics(lyrics);
    return json(res, 200, {
      lyrics,
      source,
      quality: 'professional-v2',
      taxonomy: `${input.genreFamily} > ${input.genre} > ${input.subgenre}`,
      atmosphere: input.mood,
      durationSec: input.durationSec,
      bpm: input.bpm
    });
  } catch (error) {
    return json(res, 400, { error: 'LYRICS_GENERATION_FAILED', message: error instanceof Error ? error.message : 'Unable to generate lyrics.' });
  }
}
