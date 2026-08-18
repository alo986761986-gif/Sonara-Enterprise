import {
  IAudioGenerationEngine,
  GenerationParams,
  GenerationResult,
  EngineHealthStatus
} from './IAudioGenerationEngine';

type AceStepEnvelope<T> = {
  data: T;
  code: number;
  error?: string | null;
  timestamp?: number;
  extra?: unknown;
};

type AceStepModel = {
  name: string;
  is_default?: boolean;
};

type AceStepModelsData = {
  models: AceStepModel[];
  default_model?: string;
};

type AceStepReleaseData = {
  task_id: string;
  status?: string;
  queue_position?: number;
};

type AceStepQueryItem = {
  task_id: string;
  status: number;
  result?: string | null;
  error?: string | null;
};

type AceStepResultEntry = {
  file?: string;
  url?: string;
  status?: number;
  create_time?: number;
  seed?: number;
  caption?: string;
  lyrics?: string;
  bpm?: number;
  duration?: number;
  keyscale?: string;
  timesignature?: string;
  vocal_language?: string;
};

export class AceStepEngine extends IAudioGenerationEngine {
  readonly name = 'AceStepEngine';

  private static instance: AceStepEngine | null = null;
  private isInitialized = false;
  private lastError: string | null = null;

  private readonly baseUrl = (process.env.ACESTEP_API_URL || 'http://127.0.0.1:7861').replace(/\/+$/, '');
  private readonly apiKey = process.env.ACESTEP_API_KEY || '';
  private model = process.env.ACESTEP_MODEL || 'acestep-v15-xl-sft';
  private readonly pollIntervalMs = Math.max(250, Number(process.env.ACESTEP_POLL_INTERVAL_MS || 1000));

  public static getInstance(): AceStepEngine {
    if (!AceStepEngine.instance) {
      AceStepEngine.instance = new AceStepEngine();
    }
    return AceStepEngine.instance;
  }

  public async initialize(): Promise<void> {
    this.isInitialized = true;
    const health = await this.healthCheck();
    if (!health.isAvailable) {
      console.warn(`[ENTERPRISE_LOG] [AceStepEngine] Initialization warning: ${health.error || 'engine unavailable'}`);
    }
  }

  public async loadModel(modelId?: string): Promise<boolean> {
    if (modelId?.trim()) this.model = modelId.trim();
    if (!this.isInitialized) await this.initialize();
    const health = await this.healthCheck();
    return health.isAvailable;
  }

  public async healthCheck(): Promise<EngineHealthStatus> {
    try {
      const response = await this.requestJson<AceStepModelsData>('/v1/models', {
        method: 'GET'
      }, 15000);

      const availableModels = response.data?.models || [];
      const modelAvailable = availableModels.some(item => item.name === this.model);
      const ready = response.code === 200 && modelAvailable;

      this.lastError = ready
        ? null
        : `ACE-Step model not available: ${this.model}`;

      return {
        isAvailable: ready,
        engineName: this.name,
        status: ready ? 'READY' : 'ENGINE_NOT_AVAILABLE',
        error: this.lastError || undefined,
        details: {
          baseUrl: this.baseUrl,
          model: this.model,
          defaultModel: response.data?.default_model,
          availableModels: availableModels.map(item => item.name),
          apiKeyConfigured: Boolean(this.apiKey)
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
        details: {
          baseUrl: this.baseUrl,
          model: this.model,
          apiKeyConfigured: Boolean(this.apiKey)
        }
      };
    }
  }

  public async generate(params: GenerationParams): Promise<GenerationResult> {
    if (!this.isInitialized) await this.initialize();

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

    const timeoutMs = Math.max(Number(params.timeoutMs || 900_000), 60_000);
    const durationSec = Number(params.durationSec ?? params.duration ?? 30);
    const requestedSeed = Number(params.seed ?? -1);
    const hasExplicitSeed = Number.isFinite(requestedSeed) && requestedSeed >= 0;
    const useRandomSeed = typeof params.useRandomSeed === 'boolean'
      ? params.useRandomSeed
      : typeof params.use_random_seed === 'boolean'
        ? params.use_random_seed
        : !hasExplicitSeed;

    const requestBody = {
      prompt: params.prompt,
      lyrics: params.lyrics || '',
      model: String(params.model || this.model),
      thinking: params.thinking !== false,
      audio_format: String(params.audioFormat || params.audio_format || 'wav'),
      bpm: params.bpm,
      audio_duration: durationSec,
      inference_steps: Number(params.inferenceSteps || params.inference_steps || process.env.ACESTEP_INFERENCE_STEPS || 50),
      guidance_scale: Number(params.guidanceScale || params.guidance_scale || process.env.ACESTEP_GUIDANCE_SCALE || 7),
      use_random_seed: useRandomSeed,
      seed: useRandomSeed ? -1 : requestedSeed,
      batch_size: 1
    };

    console.log(
      `[ENTERPRISE_LOG] [AceStepEngine] Generating with ${requestBody.model} | ` +
      `${requestBody.bpm || 'auto'} BPM | ${durationSec}s | ${requestBody.audio_format}`
    );

    try {
      const release = await this.requestJson<AceStepReleaseData>('/release_task', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      }, timeoutMs);

      const taskId = release.data?.task_id;
      if (!taskId) {
        throw new Error('ACE-Step /release_task returned no task_id.');
      }

      const resultEntry = await this.waitForResult(taskId, timeoutMs);
      const audioUrl = resultEntry.url || (
        resultEntry.file
          ? `/v1/audio?path=${encodeURIComponent(resultEntry.file)}`
          : ''
      );

      if (!audioUrl) {
        throw new Error('ACE-Step completed without an audio download URL.');
      }

      const audioBuffer = await this.downloadAudio(audioUrl, Math.min(timeoutMs, 120_000));
      if (audioBuffer.length === 0) {
        throw new Error('ACE-Step returned an empty audio file.');
      }

      return {
        status: 'SUCCESS',
        audioBuffer,
        audioPath: null,
        metadata: {
          engine: 'ACE-Step 1.5',
          model: requestBody.model,
          taskId,
          sourceAudioPath: resultEntry.file || null,
          sourceAudioUrl: audioUrl,
          seed: resultEntry.seed,
          caption: resultEntry.caption,
          bpm: resultEntry.bpm ?? requestBody.bpm,
          duration: resultEntry.duration ?? durationSec,
          keyScale: resultEntry.keyscale,
          timeSignature: resultEntry.timesignature,
          vocalLanguage: resultEntry.vocal_language,
          bytes: audioBuffer.length
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      console.error(`[AceStepEngine] Generation failed: ${message}`);
      return {
        status: 'ERROR',
        audioBuffer: null,
        audioPath: null,
        error: `ACE-Step generation failed: ${message}`,
        metadata: {
          engine: 'ACE-Step 1.5',
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

  private async waitForResult(taskId: string, timeoutMs: number): Promise<AceStepResultEntry> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const query = await this.requestJson<AceStepQueryItem[]>('/query_result', {
        method: 'POST',
        body: JSON.stringify({ task_id_list: [taskId] })
      }, Math.min(30_000, timeoutMs));

      const item = query.data?.find(entry => entry.task_id === taskId) || query.data?.[0];
      if (!item) {
        throw new Error(`ACE-Step returned no status for task ${taskId}.`);
      }

      if (item.status === 2) {
        throw new Error(item.error || `ACE-Step task ${taskId} failed.`);
      }

      if (item.status === 1) {
        let parsed: AceStepResultEntry[] = [];
        try {
          parsed = item.result ? JSON.parse(item.result) : [];
        } catch (error) {
          throw new Error(`ACE-Step returned invalid result JSON for task ${taskId}.`);
        }

        const completed = parsed.find(entry => entry.status === 1) || parsed[0];
        if (!completed) {
          throw new Error(`ACE-Step task ${taskId} succeeded but contained no audio result.`);
        }
        return completed;
      }

      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
    }

    throw new Error(`ACE-Step task ${taskId} timed out after ${timeoutMs}ms.`);
  }

  private async downloadAudio(audioUrl: string, timeoutMs: number): Promise<Buffer> {
    const url = audioUrl.startsWith('http://') || audioUrl.startsWith('https://')
      ? audioUrl
      : `${this.baseUrl}${audioUrl.startsWith('/') ? '' : '/'}${audioUrl}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.authHeaders(false),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`ACE-Step audio download failed (${response.status}): ${body.slice(0, 500)}`);
      }

      return Buffer.from(await response.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  }

  private async requestJson<T>(endpoint: string, init: RequestInit, timeoutMs: number): Promise<AceStepEnvelope<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...this.authHeaders(true),
          ...(init.headers || {})
        },
        signal: controller.signal
      });

      const raw = await response.text();
      let parsed: AceStepEnvelope<T> | null = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`ACE-Step returned non-JSON response (${response.status}): ${raw.slice(0, 500)}`);
      }

      if (!response.ok || !parsed || parsed.code !== 200) {
        const apiError = parsed?.error || raw || response.statusText;
        throw new Error(`ACE-Step API error (${response.status}): ${apiError}`);
      }

      return parsed;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`ACE-Step request timed out after ${timeoutMs}ms: ${endpoint}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private authHeaders(includeJson: boolean): Record<string, string> {
    const headers: Record<string, string> = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    return headers;
  }
}
