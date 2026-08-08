import fs from 'fs';
import path from 'path';
import { PROFESSIONAL_EQ_PRESETS } from './ParametricEqService';
import {
  EmberToolDefinition,
  EmberToolExecutionContext,
  EmberToolResult
} from '../types/ember';

const EMPTY_OBJECT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
  required: []
};

const MUSIC_DNA_PATH = path.join(process.cwd(), 'data', 'music_brain_db.json');
const MAX_DNA_RESULTS = 5;

interface MusicDnaRecord {
  id?: string;
  prompt?: string;
  genre?: string;
  subgenre?: string;
  bpm?: number;
  keySignature?: string;
  instruments?: string[];
  chords?: string[];
  scores?: { overallScore?: number };
  isBenchmark?: boolean;
}

const tools: EmberToolDefinition[] = [
  {
    type: 'function',
    name: 'get_music_brain_context',
    description: 'Read-only Music Brain context. It may be unavailable when a safe read-only lookup is not supported.',
    strict: true,
    parameters: EMPTY_OBJECT_SCHEMA
  },
  {
    type: 'function',
    name: 'get_music_dna',
    description: 'Read up to five relevant Music DNA records. This tool only returns concise musical metadata.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 200 },
        genre: { type: 'string', minLength: 1, maxLength: 80 }
      },
      additionalProperties: false,
      required: ['query', 'genre']
    }
  },
  {
    type: 'function',
    name: 'get_generation_status',
    description: 'Read the current Studio generation status only when job ownership is verifiable. It never accepts a job ID argument.',
    strict: true,
    parameters: EMPTY_OBJECT_SCHEMA
  },
  {
    type: 'function',
    name: 'get_eq_presets',
    description: 'Read available Sonara EQ preset metadata. This tool does not apply presets or process audio.',
    strict: true,
    parameters: EMPTY_OBJECT_SCHEMA
  },
  {
    type: 'function',
    name: 'inspect_current_track',
    description: 'Inspects current Studio metadata/context only; it does not analyze raw audio.',
    strict: true,
    parameters: EMPTY_OBJECT_SCHEMA
  }
];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const safeString = (value: unknown, maximum: number): string | undefined =>
  typeof value === 'string' && value.length <= maximum ? value.trim() || undefined : undefined;

export class EmberToolRegistry {
  public static getDefinitions(): EmberToolDefinition[] {
    return tools;
  }

  public static async execute(
    name: string,
    rawArguments: unknown,
    context: EmberToolExecutionContext
  ): Promise<EmberToolResult> {
    if (!tools.some(tool => tool.name === name)) {
      return { ok: false, error: 'unknown_tool' };
    }

    if (!isPlainObject(rawArguments)) {
      return { ok: false, error: 'invalid_tool_arguments' };
    }

    switch (name) {
      case 'get_music_brain_context':
        return this.getMusicBrainContext(rawArguments);
      case 'get_music_dna':
        return this.getMusicDna(rawArguments);
      case 'get_generation_status':
        return this.getGenerationStatus(rawArguments, context);
      case 'get_eq_presets':
        return this.getEqPresets(rawArguments);
      case 'inspect_current_track':
        return this.inspectCurrentTrack(rawArguments, context);
      default:
        return { ok: false, error: 'unknown_tool' };
    }
  }

  private static getMusicBrainContext(argumentsValue: Record<string, unknown>): EmberToolResult {
    if (Object.keys(argumentsValue).length !== 0) return { ok: false, error: 'invalid_tool_arguments' };

    // recallOptimalDna increments usageCount and persists it, so it is unsafe in read-only Phase 2.
    return { ok: false, error: 'music_brain_context_unavailable_in_read_only_phase' };
  }

  private static getMusicDna(argumentsValue: Record<string, unknown>): EmberToolResult {
    if (Object.keys(argumentsValue).some(key => key !== 'query' && key !== 'genre')) {
      return { ok: false, error: 'invalid_tool_arguments' };
    }

    const query = safeString(argumentsValue.query, 200);
    const genre = safeString(argumentsValue.genre, 80);
    if ((argumentsValue.query !== undefined && !query) || (argumentsValue.genre !== undefined && !genre)) {
      return { ok: false, error: 'invalid_tool_arguments' };
    }

    try {
      if (!fs.existsSync(MUSIC_DNA_PATH)) return { ok: false, error: 'music_dna_unavailable' };
      const parsed = JSON.parse(fs.readFileSync(MUSIC_DNA_PATH, 'utf8')) as unknown;
      if (!Array.isArray(parsed)) return { ok: false, error: 'music_dna_unavailable' };

      const normalizedQuery = query?.toLowerCase();
      const normalizedGenre = genre?.toLowerCase();
      const records = parsed
        .filter(isPlainObject)
        .filter(record => {
          const recordGenre = safeString(record.genre, 80)?.toLowerCase() || '';
          const searchable = [record.prompt, record.genre, record.subgenre, record.keySignature]
            .map(value => safeString(value, 2_000)?.toLowerCase() || '')
            .join(' ');
          return (!normalizedGenre || recordGenre === normalizedGenre) &&
            (!normalizedQuery || searchable.includes(normalizedQuery));
        })
        .slice(0, MAX_DNA_RESULTS)
        .map(record => this.sanitizeDnaRecord(record));

      return { ok: true, data: { records } };
    } catch {
      return { ok: false, error: 'music_dna_unavailable' };
    }
  }

  private static getGenerationStatus(
    argumentsValue: Record<string, unknown>,
    context: EmberToolExecutionContext
  ): EmberToolResult {
    if (Object.keys(argumentsValue).length !== 0) return { ok: false, error: 'invalid_tool_arguments' };
    if (!context.studioContext.currentJobId) return { ok: false, error: 'no_current_generation_job' };

    // Studio jobs are not consistently tied to an authenticated user in the current architecture.
    return { ok: false, error: 'ownership_not_verifiable' };
  }

  private static getEqPresets(argumentsValue: Record<string, unknown>): EmberToolResult {
    if (Object.keys(argumentsValue).length !== 0) return { ok: false, error: 'invalid_tool_arguments' };

    return {
      ok: true,
      data: {
        presets: PROFESSIONAL_EQ_PRESETS.map(preset => ({
          id: preset.id,
          name: preset.name,
          category: preset.category,
          description: preset.description
        }))
      }
    };
  }

  private static inspectCurrentTrack(
    argumentsValue: Record<string, unknown>,
    context: EmberToolExecutionContext
  ): EmberToolResult {
    if (Object.keys(argumentsValue).length !== 0) return { ok: false, error: 'invalid_tool_arguments' };

    const { prompt, genre, subgenre, mood, bpm, hasAudio, recommendedEqPresetId } = context.studioContext;
    return {
      ok: true,
      data: {
        prompt,
        genre,
        subgenre,
        mood,
        bpm,
        hasAudio: Boolean(hasAudio),
        recommendedEqPresetId
      }
    };
  }

  private static sanitizeDnaRecord(record: Record<string, unknown>): Record<string, unknown> {
    const scores = isPlainObject(record.scores) ? record.scores : {};
    return {
      id: safeString(record.id, 120),
      genre: safeString(record.genre, 80),
      subgenre: safeString(record.subgenre, 80),
      bpm: typeof record.bpm === 'number' && Number.isFinite(record.bpm) ? record.bpm : undefined,
      keySignature: safeString(record.keySignature, 80),
      instruments: Array.isArray(record.instruments)
        ? record.instruments.filter(value => typeof value === 'string').slice(0, 6).map(value => value.slice(0, 120))
        : [],
      chords: Array.isArray(record.chords)
        ? record.chords.filter(value => typeof value === 'string').slice(0, 8).map(value => value.slice(0, 80))
        : [],
      overallScore: typeof scores.overallScore === 'number' && Number.isFinite(scores.overallScore)
        ? scores.overallScore
        : undefined,
      isBenchmark: record.isBenchmark === true
    };
  }
}
