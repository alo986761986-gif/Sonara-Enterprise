import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  IAudioGenerationEngine,
  GenerationParams,
  GenerationResult,
  EngineHealthStatus
} from './IAudioGenerationEngine';

type AceApiResponse<T = any> = {
  data?: T;
  code?: number;
  error?: string | null;
  timestamp?: number;
  extra?: any;
};

type AceQueryItem = {
  task_id?: string;
  status?: number;
  result?: string | any[];
  error?: string;
};

export class AceStepEngine extends IAudioGenerationEngine {
  readonly name = 'AceStepEngine';

  private static instance: AceStepEngine | null = null;
  private isInitialized = false;
  private lastError: string | null = null;

  private readonly baseUrl = (process.env.ACESTEP_API_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
  private readonly apiKey = process.env.ACESTEP_API_KEY || '';
  private readonly model = process.env.ACESTEP_MODEL || 'acestep-v15-turbo';
  private readonly pollIntervalMs = Math.max(Number(process.env.ACESTEP_POLL_INTERVAL_MS || 1000), 250);

  public static getInstance(): AceStepEngine {
    if (!AceStepEngine.instance) AceStepEngine.instance = new AceStepEngine();
    return AceStepEngine.instance;
  }

  public async initialize(): Promise<void> {
    this.isInitialized = true;
    const health = await this.healthCheck();
    if (!health.isAvailable) {
      throw new Error(health.error || 'ACE-Step API is unavailable.');
    }
  }

  public async loadModel(_modelId?: string): Promise<boolean> {
    const health = await this.healthCheck();
    return health.isAvailable;
  }

  public async healthCheck(): Promise<EngineHealthStatus> {
    try {
      const response = await this.request('/health', { method: 'GET' }, 5000);
      const payload = await this.readJsonSafe(response);
      const ready = response.ok && (!payload?.data?.status || payload.data.status === 'ok');
      this.lastError = ready ? null : (payload?.error || `HTTP ${response.status}`);

      return {
        isAvailable: ready,
        engineName: this.name,
        status: ready ? 'READY' : 'ENGINE_NOT_AVAILABLE',
        error: this.lastError || undefined,
        details: {
          baseUrl: this.baseUrl,
          model: this.model,
          health: payload
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      return {
        isAvailable: false,
        engineName: this.name,
        status: 'ENGINE_NOT_AVAILABLE',
        error: message,
        details: { baseUrl: this.baseUrl, model: this.model }
      };
    }
  }

  public async generate(params: GenerationParams): Promise<GenerationResult> {
    if (!this.isInitialized) this.isInitialized = true;

    const timeoutMs = Math.max(Number(params.timeoutMs || 900_000), 30_000);
    const startedAt = Date.now();
    const durationSec = Math.max(10, Math.min(600, Number(params.durationSec || 30)));
    const bpm = params.bpm == null ? undefined : Math.max(30, Math.min(300, Math.round(Number(params.bpm))));
    const keyScale = String(params.key || params.keyScale || '').trim();
    const vocalLanguage = String(params.vocalLanguage || 'en');
    const thinking = params.thinking == null
      ? String(process.env.ACESTEP_THINKING || 'true').toLowerCase() !== 'false'
      : Boolean(params.thinking);

    const requestBody: Record<string, any> = {
      prompt: this.buildPrompt(params),
      lyrics: params.lyrics || '',
      model: String(params.model || this.model),
      thinking,
      vocal_language: vocalLanguage,
      audio_format: 'wav',
      audio_duration: durationSec,
      batch_size: 1,
      use_random_seed: params.seed == null,
      use_format: Boolean(params.useFormat || false)
    };

    if (bpm != null) requestBody.bpm = bpm;
    if (keyScale) requestBody.key_scale = keyScale;
    if (params.seed != null) requestBody.seed = Number(params.seed);
    if (params.inferenceSteps != null) requestBody.inference_steps = Number(params.inferenceSteps);

    try {
      const health = await this.healthCheck();
      if (!health.isAvailable) {
        return {
          status: 'ENGINE_NOT_AVAILABLE',
          audioBuffer: null,
          audioPath: null,
          error: `ACE-Step is unavailable: ${health.error || 'health check failed'}`,
          metadata: { health }
        };
      }

      const releaseResponse = await this.request(
        '/release_task',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        },
        Math.min(timeoutMs, 30_000)
      );

      const releasePayload = await this.readJsonSafe(releaseResponse) as AceApiResponse<any>;
      if (!releaseResponse.ok || releasePayload?.error) {
        throw new Error(releasePayload?.error || `release_task failed with HTTP ${releaseResponse.status}`);
      }

      const taskId = this.extractTaskId(releasePayload?.data);
      if (!taskId) throw new Error('ACE-Step release_task did not return a task_id.');

      let completed: any = null;
      while (Date.now() - startedAt < timeoutMs) {
        await this.sleep(this.pollIntervalMs);

        const queryResponse = await this.request(
          '/query_result',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id_list: [taskId] })
          },
          Math.min(30_000, Math.max(1000, timeoutMs - (Date.now() - startedAt)))
        );

        const queryPayload = await this.readJsonSafe(queryResponse) as AceApiResponse<AceQueryItem[]>;
        if (!queryResponse.ok || queryPayload?.error) {
          throw new Error(queryPayload?.error || `query_result failed with HTTP ${queryResponse.status}`);
        }

        const item = Array.isArray(queryPayload?.data) ? queryPayload.data[0] : null;
        if (!item) continue;
        if (Number(item.status) === 2) {
          throw new Error(item.error || 'ACE-Step generation failed.');
        }
        if (Number(item.status) !== 1) continue;

        completed = this.parseResult(item.result);
        break;
      }

      if (!completed) throw new Error(`ACE-Step generation timed out after ${timeoutMs}ms.`);

      const fileRef = String(completed.file || '');
      if (!fileRef) throw new Error('ACE-Step completed without returning an audio file URL.');

      const audioUrl = this.resolveUrl(fileRef);
      const audioResponse = await this.request(audioUrl, { method: 'GET' }, 120_000, true);
      if (!audioResponse.ok) throw new Error(`ACE-Step audio download failed with HTTP ${audioResponse.status}.`);

      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
      if (!audioBuffer.length) throw new Error('ACE-Step returned an empty audio file.');
      if (!this.isWav(audioBuffer)) throw new Error('ACE-Step did not return the requested WAV payload.');

      const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonara-acestep-'));
      const audioPath = path.join(workDir, 'audio.wav');
      fs.writeFileSync(audioPath, audioBuffer);

      this.lastError = null;
      return {
        status: 'SUCCESS',
        audioBuffer,
        audioPath,
        metadata: {
          engine: 'Sonara ACE-Step 1.5 Engine',
          provider: 'ACE-Step',
          model: completed.dit_model || requestBody.model,
          lmModel: completed.lm_model || null,
          taskId,
          audioFormat: 'wav',
          audioExtension: '.wav',
          bytes: audioBuffer.length,
          durationSec,
          bpm: completed?.metas?.bpm ?? bpm ?? null,
          keyScale: completed?.metas?.keyscale ?? (keyScale || null),
          generationInfo: completed.generation_info || null,
          seedValue: completed.seed_value || null
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      return {
        status: 'ENGINE_NOT_AVAILABLE',
        audioBuffer: null,
        audioPath: null,
        error: `ACE-Step generation failed: ${message}`,
        metadata: {
          engine: 'Sonara ACE-Step 1.5 Engine',
          model: requestBody.model,
          baseUrl: this.baseUrl,
          error: message
        }
      };
    }
  }

  public async shutdown(): Promise<void> {
    this.isInitialized = false;
    this.lastError = null;
  }

  private buildPrompt(params: GenerationParams): string {
    return [params.genre, params.mood, params.bpm ? `${params.bpm} BPM` : '', params.prompt]
      .filter(Boolean)
      .map(value => String(value).trim())
      .filter(Boolean)
      .join(', ');
  }

  private extractTaskId(data: any): string | null {
    if (typeof data === 'string' && data.trim()) return data.trim();
    if (data && typeof data.task_id === 'string') return data.task_id;
    if (data && typeof data.taskId === 'string') return data.taskId;
    return null;
  }

  private parseResult(result: any): any | null {
    let parsed = result;
    if (typeof result === 'string') {
      try { parsed = JSON.parse(result); } catch { return null; }
    }
    if (Array.isArray(parsed)) return parsed.find(item => item && item.file) || parsed[0] || null;
    return parsed && parsed.file ? parsed : null;
  }

  private resolveUrl(value: string): string {
    if (/^https?:\/\//i.test(value)) return value;
    return `${this.baseUrl}${value.startsWith('/') ? '' : '/'}${value}`;
  }

  private async request(
    endpointOrUrl: string,
    init: RequestInit,
    timeoutMs: number,
    isAbsolute = false
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers(init.headers || {});
    if (this.apiKey) headers.set('Authorization', `Bearer ${this.apiKey}`);

    try {
      return await fetch(isAbsolute ? endpointOrUrl : this.resolveUrl(endpointOrUrl), {
        ...init,
        headers,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async readJsonSafe(response: Response): Promise<any> {
    const text = await response.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return { raw: text }; }
  }

  private isWav(buffer: Buffer): boolean {
    return buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
