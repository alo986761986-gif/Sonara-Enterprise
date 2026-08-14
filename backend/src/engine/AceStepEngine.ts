import {
  IAudioGenerationEngine,
  GenerationParams,
  GenerationResult,
  EngineHealthStatus
} from './IAudioGenerationEngine';
import http from 'http';
import https from 'https';

interface OfficialEnvelope<T> {
  data?: T;
  code?: number;
  error?: string | null;
}

interface OfficialHealthData {
  status?: string;
  service?: string;
  version?: string;
}

interface OfficialReleaseData {
  task_id?: string;
  status?: string;
  queue_position?: number;
}

interface OfficialQueryItem {
  task_id?: string;
  status?: number;
  result?: string;
  error?: string;
}

interface LegacyHealthResponse {
  status?: string;
  engine?: string;
  api?: string;
}

interface LegacyGenerateResponse {
  status?: string;
  output_path?: string;
  audio_url?: string;
  message?: string;
  detail?: string;
}

type ApiMode = 'official-v15' | 'legacy';

export class AceStepEngine extends IAudioGenerationEngine {
  readonly name = 'AceStepEngine';

  private isInitialized = false;
  private lastError: string | null = null;
  private apiMode: ApiMode = 'official-v15';

  private static instance: AceStepEngine | null = null;

  private readonly apiBaseUrl =
    (process.env.ACE_STEP_API_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '');

  private readonly apiKey =
    process.env.ACE_STEP_API_KEY || process.env.ACESTEP_API_KEY || '';

  public static getInstance(): AceStepEngine {
    if (!AceStepEngine.instance) AceStepEngine.instance = new AceStepEngine();
    return AceStepEngine.instance;
  }

  public async initialize(): Promise<void> {
    this.isInitialized = true;
    await this.healthCheck();
  }

  public async loadModel(_modelId?: string): Promise<boolean> {
    if (!this.isInitialized) await this.initialize();
    return (await this.healthCheck()).isAvailable;
  }

  public async healthCheck(): Promise<EngineHealthStatus> {
    try {
      const response = await this.requestJson<any>('GET', '/health', undefined, 10_000);

      const officialStatus = response?.data?.status;
      const legacyStatus = response?.status;
      const officialReady = officialStatus === 'ok' || officialStatus === 'healthy';
      const legacyReady = legacyStatus === 'healthy' || legacyStatus === 'ready';

      if (officialReady) this.apiMode = 'official-v15';
      else if (legacyReady) this.apiMode = 'legacy';

      const ready = officialReady || legacyReady;
      this.lastError = ready
        ? null
        : `Unexpected ACE-Step health response: ${JSON.stringify(response)}`;

      return {
        isAvailable: ready,
        engineName: this.name,
        status: ready ? 'READY' : 'ENGINE_NOT_AVAILABLE',
        error: this.lastError || undefined,
        details: { apiUrl: this.apiBaseUrl, apiMode: this.apiMode, response }
      };
    } catch (error) {
      const message = this.errorMessage(error);
      this.lastError = message;
      return {
        isAvailable: false,
        engineName: this.name,
        status: 'ENGINE_NOT_AVAILABLE',
        error: message,
        details: { apiUrl: this.apiBaseUrl, apiMode: this.apiMode }
      };
    }
  }

  public async generate(params: GenerationParams): Promise<GenerationResult> {
    if (!this.isInitialized) this.isInitialized = true;

    const health = await this.healthCheck();
    if (!health.isAvailable) {
      return {
        status: 'ENGINE_NOT_AVAILABLE',
        audioBuffer: null,
        audioPath: null,
        error: `ACE-Step API is unavailable: ${health.error || 'health check failed'}`,
        metadata: { apiUrl: this.apiBaseUrl, apiMode: this.apiMode, health }
      };
    }

    return this.apiMode === 'official-v15'
      ? this.generateOfficial(params)
      : this.generateLegacy(params);
  }

  private async generateOfficial(params: GenerationParams): Promise<GenerationResult> {
    const durationSec = Math.max(5, Math.min(600, Number(params.durationSec || 15)));
    const bpm = Math.max(30, Math.min(300, Number(params.bpm || 126)));
    const timeoutMs = Math.max(Number(params.timeoutMs || 600_000), 120_000);
    const prompt = this.buildPrompt(params, bpm);

    const payload = {
      prompt,
      lyrics: params.lyrics || '',
      bpm,
      audio_duration: durationSec,
      audio_format: 'wav',
      model: (params as any).model || process.env.ACE_STEP_MODEL || 'acestep-v15-turbo',
      inference_steps: Number((params as any).inferStep || 8),
      thinking: String(process.env.ACE_STEP_THINKING || 'false').toLowerCase() === 'true',
      use_format: false,
      task_type: 'text2music'
    };

    try {
      const released = await this.requestJson<OfficialEnvelope<OfficialReleaseData>>(
        'POST',
        '/release_task',
        payload,
        30_000
      );

      if (released.code && released.code !== 200) {
        throw new Error(released.error || `ACE-Step release_task returned code ${released.code}`);
      }

      const taskId = released.data?.task_id;
      if (!taskId) throw new Error(`ACE-Step did not return task_id: ${JSON.stringify(released)}`);

      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const queried = await this.requestJson<OfficialEnvelope<OfficialQueryItem[]>>(
          'POST',
          '/query_result',
          { task_id_list: [taskId] },
          30_000
        );

        const item = queried.data?.find(entry => entry.task_id === taskId) || queried.data?.[0];
        if (!item) continue;

        if (item.status === 2) {
          throw new Error(item.error || item.result || 'ACE-Step generation failed');
        }

        if (item.status !== 1) continue;

        let results: any[] = [];
        try {
          results = item.result ? JSON.parse(item.result) : [];
        } catch {
          throw new Error(`ACE-Step returned invalid task result JSON: ${String(item.result).slice(0, 500)}`);
        }

        const file = results?.[0]?.file;
        if (!file) throw new Error(`ACE-Step task completed without audio file: ${item.result}`);

        const audioBuffer = await this.requestBuffer(file, 120_000);
        if (!audioBuffer.length) throw new Error('ACE-Step returned an empty audio file');

        return {
          status: 'SUCCESS',
          audioBuffer,
          audioPath: file,
          metadata: {
            engine: 'ACE-Step 1.5',
            engineName: 'AceStepEngine',
            apiUrl: this.apiBaseUrl,
            apiMode: this.apiMode,
            taskId,
            durationSec,
            bpm,
            prompt,
            audioUrl: file,
            bytes: audioBuffer.length,
            result: results[0]
          }
        };
      }

      throw new Error(`ACE-Step generation timed out after ${timeoutMs}ms`);
    } catch (error) {
      const message = this.errorMessage(error);
      return {
        status: 'ENGINE_NOT_AVAILABLE',
        audioBuffer: null,
        audioPath: null,
        error: `ACE-Step generation failed: ${message}`,
        metadata: { apiUrl: this.apiBaseUrl, apiMode: this.apiMode, request: payload, error: message }
      };
    }
  }

  private async generateLegacy(params: GenerationParams): Promise<GenerationResult> {
    const durationSec = Math.max(5, Math.min(240, Number(params.durationSec || 15)));
    const bpm = Math.max(60, Math.min(240, Number(params.bpm || 128)));
    const timeoutMs = Math.max(Number(params.timeoutMs || 300_000), 60_000);
    const prompt = this.buildPrompt(params, bpm);

    const payload = {
      checkpoint_path: process.env.ACE_STEP_CHECKPOINT_PATH || '/workspace/ACE-Step/checkpoints',
      bf16: true,
      torch_compile: false,
      cpu_offload: false,
      overlapped_decode: false,
      device_id: Number(process.env.ACE_STEP_DEVICE_ID || 0),
      audio_duration: durationSec,
      prompt,
      lyrics: params.lyrics || '',
      infer_step: Number((params as any).inferStep || 60),
      guidance_scale: Number((params as any).guidanceScale || 15),
      scheduler_type: (params as any).schedulerType || 'euler',
      cfg_type: (params as any).cfgType || 'apg',
      omega_scale: Number((params as any).omegaScale || 10),
      actual_seeds: [Number((params as any).seed || 42)]
    };

    try {
      const response = await this.requestJson<LegacyGenerateResponse>('POST', '/generate', payload, timeoutMs);
      if (response.status !== 'success' || !response.audio_url) {
        throw new Error(response.detail || response.message || `Unexpected ACE-Step response: ${JSON.stringify(response)}`);
      }

      const audioBuffer = await this.requestBuffer(response.audio_url, Math.max(timeoutMs, 120_000));
      if (!audioBuffer.length) throw new Error('ACE-Step returned an empty WAV file');

      return {
        status: 'SUCCESS',
        audioBuffer,
        audioPath: response.output_path || response.audio_url,
        metadata: {
          engine: 'ACE-Step',
          engineName: 'AceStepEngine',
          apiUrl: this.apiBaseUrl,
          apiMode: this.apiMode,
          durationSec,
          bpm,
          prompt,
          audioUrl: response.audio_url,
          bytes: audioBuffer.length
        }
      };
    } catch (error) {
      const message = this.errorMessage(error);
      return {
        status: 'ENGINE_NOT_AVAILABLE',
        audioBuffer: null,
        audioPath: null,
        error: `ACE-Step generation failed: ${message}`,
        metadata: { apiUrl: this.apiBaseUrl, apiMode: this.apiMode, request: payload, error: message }
      };
    }
  }

  public async shutdown(): Promise<void> {
    this.isInitialized = false;
    this.lastError = null;
  }

  private buildPrompt(params: GenerationParams, bpm: number): string {
    return [
      params.genre || 'House',
      `track at ${bpm} BPM`,
      params.mood ? `${params.mood} mood` : '',
      params.prompt || 'Modern electronic dance track',
      'clear musical structure, defined kick, bassline, percussion and harmonic progression'
    ].filter(Boolean).join(', ');
  }

  private requestJson<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: Record<string, unknown>,
    timeoutMs = 30_000
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const target = new URL(`${this.apiBaseUrl}${endpoint}`);
      const client = target.protocol === 'https:' ? https : http;
      const payload = body ? JSON.stringify(body) : undefined;
      const headers: Record<string, string | number> = {};

      if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
      }
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

      const request = client.request(target, { method, headers }, response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: any = {};
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            return reject(new Error(`ACE-Step returned invalid JSON (${response.statusCode}): ${raw.slice(0, 500)}`));
          }

          if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode >= 300) {
            return reject(new Error(parsed.error || parsed.detail || parsed.message || `ACE-Step HTTP ${response.statusCode}`));
          }
          resolve(parsed as T);
        });
      });

      request.setTimeout(timeoutMs, () => request.destroy(new Error(`ACE-Step request timed out after ${timeoutMs}ms`)));
      request.on('error', reject);
      if (payload) request.write(payload);
      request.end();
    });
  }

  private requestBuffer(endpoint: string, timeoutMs: number): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const target = endpoint.startsWith('http://') || endpoint.startsWith('https://')
        ? new URL(endpoint)
        : new URL(`${this.apiBaseUrl}${endpoint}`);
      const client = target.protocol === 'https:' ? https : http;
      const headers: Record<string, string> = {};
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

      const request = client.get(target, { headers }, response => {
        if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          return reject(new Error(`ACE-Step audio download failed with HTTP ${response.statusCode}`));
        }
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      });

      request.setTimeout(timeoutMs, () => request.destroy(new Error(`ACE-Step audio download timed out after ${timeoutMs}ms`)));
      request.on('error', reject);
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
