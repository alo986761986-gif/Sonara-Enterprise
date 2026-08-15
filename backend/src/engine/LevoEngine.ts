import {
  IAudioGenerationEngine,
  GenerationParams,
  GenerationResult,
  EngineHealthStatus
} from './IAudioGenerationEngine';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export class LevoEngine extends IAudioGenerationEngine {
  readonly name = 'LevoEngine';

  private isInitialized = false;
  private lastError: string | null = null;

  private static instance: LevoEngine | null = null;

  private readonly levoRoot = process.env.LEVO_ROOT || path.join(process.cwd(), 'LeVo');
  private readonly checkpointPath =
    process.env.LEVO_CHECKPOINT_PATH || path.join(this.levoRoot, 'songgeneration_v2_large');
  private readonly runner = process.env.LEVO_RUNNER || 'bash';

  public static getInstance(): LevoEngine {
    if (!LevoEngine.instance) {
      LevoEngine.instance = new LevoEngine();
    }
    return LevoEngine.instance;
  }

  public async initialize(): Promise<void> {
    console.log(`[ENTERPRISE_LOG] [LevoEngine] Initializing ${this.name} from ${this.levoRoot}...`);
    this.isInitialized = true;
    await this.healthCheck();
  }

  public async loadModel(_modelId?: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    const health = await this.healthCheck();
    return health.isAvailable;
  }

  public async healthCheck(): Promise<EngineHealthStatus> {
    const generateScript = path.join(this.levoRoot, 'generate.sh');
    const missing: string[] = [];

    if (!fs.existsSync(this.levoRoot)) missing.push(`LEVO_ROOT not found: ${this.levoRoot}`);
    if (!fs.existsSync(generateScript)) missing.push(`generate.sh not found: ${generateScript}`);
    if (!fs.existsSync(this.checkpointPath)) missing.push(`checkpoint not found: ${this.checkpointPath}`);

    const ready = missing.length === 0;
    this.lastError = ready ? null : missing.join('; ');

    return {
      isAvailable: ready,
      engineName: this.name,
      status: ready ? 'READY' : 'ENGINE_NOT_AVAILABLE',
      error: this.lastError || undefined,
      details: {
        levoRoot: this.levoRoot,
        checkpointPath: this.checkpointPath,
        runner: this.runner,
        model: 'SongGeneration-v2-large'
      }
    };
  }

  public async generate(params: GenerationParams): Promise<GenerationResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const health = await this.healthCheck();
    if (!health.isAvailable) {
      return {
        status: 'ENGINE_NOT_AVAILABLE',
        audioBuffer: null,
        audioPath: null,
        error: `LeVo is unavailable: ${health.error || 'health check failed'}`,
        metadata: { health }
      };
    }

    const requestId = `sonara-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonara-levo-'));
    const inputPath = path.join(workDir, 'request.jsonl');
    const outputDir = path.join(workDir, 'output');
    fs.mkdirSync(outputDir, { recursive: true });

    const lyrics = this.formatLyrics(params.lyrics || '');
    const descriptions = this.buildDescriptionTags(params);
    const input = {
      idx: requestId,
      gt_lyric: lyrics,
      descriptions,
      auto_prompt_audio_type: this.mapAutoPromptType(params.genre || '')
    };
    fs.writeFileSync(inputPath, `${JSON.stringify(input)}\n`, 'utf8');

    const args = [
      'generate.sh',
      this.checkpointPath,
      inputPath,
      outputDir
    ];

    if (!params.lyrics?.trim()) {
      args.push('--bgm');
    }
    if (String(process.env.LEVO_LOW_MEM || '').toLowerCase() === 'true') {
      args.push('--low_mem');
    }
    if (String(process.env.LEVO_DISABLE_FLASH_ATTN || '').toLowerCase() === 'true') {
      args.push('--not_use_flash_attn');
    }

    const timeoutMs = Math.max(Number(params.timeoutMs || 900_000), 120_000);

    console.log(`[ENTERPRISE_LOG] [LevoEngine] Generating with SongGeneration-v2-large | ${requestId}`);

    try {
      const commandResult = await this.runCommand(args, timeoutMs);
      const audioPath = this.findGeneratedAudio(outputDir, requestId);

      if (!audioPath) {
        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: 'LeVo finished without producing a supported audio file.',
          metadata: { requestId, input, outputDir, commandResult }
        };
      }

      const audioBuffer = fs.readFileSync(audioPath);
      if (audioBuffer.length === 0) {
        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: 'LeVo returned an empty audio file.',
          metadata: { requestId, audioPath, commandResult }
        };
      }

      return {
        status: 'SUCCESS',
        audioBuffer,
        audioPath,
        metadata: {
          engine: 'LeVo 2',
          model: 'SongGeneration-v2-large',
          requestId,
          descriptions,
          outputDir,
          bytes: audioBuffer.length,
          commandResult
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      console.error(`[LevoEngine] Generation failed: ${message}`);

      return {
        status: 'ENGINE_NOT_AVAILABLE',
        audioBuffer: null,
        audioPath: null,
        error: `LeVo generation failed: ${message}`,
        metadata: { requestId, input, outputDir, error: message }
      };
    }
  }

  public async shutdown(): Promise<void> {
    this.isInitialized = false;
    this.lastError = null;
  }

  private buildDescriptionTags(params: GenerationParams): string {
    const tags = [
      params.genre,
      params.mood,
      params.bpm ? `${params.bpm} bpm` : '',
      params.prompt
    ]
      .filter(Boolean)
      .flatMap(value => String(value).split(/[|;,]/g))
      .map(value => value.trim())
      .filter(Boolean);

    return Array.from(new Set(tags)).join(', ');
  }

  private formatLyrics(lyrics: string): string {
    const trimmed = lyrics.trim();
    if (!trimmed) return '[intro-medium]; [inst-medium]; [outro-medium]';
    if (/\[(verse|chorus|bridge|intro-|inst-|outro-)/i.test(trimmed)) return trimmed;
    return `[verse] ${trimmed}`;
  }

  private mapAutoPromptType(genre: string): string {
    const value = genre.toLowerCase();
    if (/(house|techno|trance|edm|electronic|ambient)/.test(value)) return 'Electronic';
    if (/(hip hop|hip-hop|rap|trap)/.test(value)) return 'Hip-Hop';
    if (/rock/.test(value)) return 'Rock';
    if (/metal/.test(value)) return 'Metal';
    if (/jazz/.test(value)) return 'Jazz';
    if (/funk/.test(value)) return 'Funk';
    if (/(latin|reggaeton)/.test(value)) return 'Latin';
    if (/(r&b|soul)/.test(value)) return 'R&B/Soul';
    if (/country/.test(value)) return 'Country';
    if (/(cinematic|soundtrack|orchestral)/.test(value)) return 'Soundtrack';
    return 'Auto';
  }

  private runCommand(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.runner, args, {
        cwd: this.levoRoot,
        env: process.env,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`LeVo request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', chunk => { stdout += chunk.toString(); });
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });
      child.on('error', error => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', code => {
        clearTimeout(timer);
        if (code !== 0) {
          return reject(new Error(`LeVo exited with code ${code}: ${stderr.slice(-2000)}`));
        }
        resolve({ stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) });
      });
    });
  }

  private findGeneratedAudio(root: string, requestId: string): string | null {
    const supported = new Set(['.wav', '.mp3', '.flac', '.m4a']);
    const matches: string[] = [];

    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (supported.has(path.extname(entry.name).toLowerCase())) matches.push(full);
      }
    };

    walk(root);
    return matches.find(file => path.basename(file).includes(requestId)) || matches[0] || null;
  }
}
