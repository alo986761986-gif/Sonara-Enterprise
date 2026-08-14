import {
  IAudioGenerationEngine,
  GenerationParams,
  GenerationResult,
  EngineHealthStatus
} from './IAudioGenerationEngine';
import http from 'http';
import https from 'https';

interface LeVoHealthResponse {
  status?: string;
  engine?: string;
}

interface LeVoGenerateResponse {
  status?: string;
  job_id?: string;
  status_url?: string;
  output_path?: string;
  audio_url?: string;
  message?: string;
  detail?: string;
}

export class LeVoEngine extends IAudioGenerationEngine {
  readonly name = 'LeVoEngine';

  private static instance: LeVoEngine | null = null;
  private isInitialized = false;

  private readonly apiBaseUrl =
    (process.env.LEVO_API_URL || 'http://127.0.0.1:8010').replace(/\/+$/, '');

  public static getInstance(): LeVoEngine {
    if (!LeVoEngine.instance) {
      LeVoEngine.instance = new LeVoEngine();
    }
    return LeVoEngine.instance;
  }

  public async initialize(): Promise<void> {
    this.isInitialized = true;
    await this.healthCheck();
  }

  public async loadModel(_modelId?: string): Promise<boolean> {
    if (!this.isInitialized) await this.initialize();
    const health = await this.healthCheck();
    return health.isAvailable;
  }

  public async healthCheck(): Promise<EngineHealthStatus> {
    try {
      const response = await this.requestJson<LeVoHealthResponse>('GET', '/health', undefined, 10_000);
      const ready = response.status === 'healthy' || response.status === 'ready';

      return {
        isAvailable: ready,
        engineName: this.name,
        status: ready ? 'READY' : 'ENGINE_NOT_AVAILABLE',
        error: ready ? undefined : `Unexpected LeVo health response: ${JSON.stringify(response)}`,
        details: { apiUrl: this.apiBaseUrl, response }
      };
    } catch (error) {
      const message = this.errorMessage(error);
      return {
        isAvailable: false,
        engineName: this.name,
        status: 'ENGINE_NOT_AVAILABLE',
        error: message,
        details: { apiUrl: this.apiBaseUrl }
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
        error: `LeVo API is unavailable: ${health.error || 'health check failed'}`,
        metadata: { apiUrl: this.apiBaseUrl, health }
      };
    }

    const durationSec = Math.max(5, Math.min(240, Number(params.durationSec || 15)));
    const bpm = Math.max(60, Math.min(240, Number(params.bpm || 126)));
    const timeoutMs = Math.max(Number(params.timeoutMs || 600_000), 120_000);

    const payload = {
      prompt: params.prompt,
      genre: params.genre || 'House',
      mood: params.mood || '',
      lyrics: params.lyrics || '',
      title: params.title || 'Sonara Track',
      bpm,
      duration_sec: durationSec,
      model: (params as any).model || 'songgeneration_v2_medium',
      low_mem: (params as any).lowMem ?? true,
      use_flash_attn: false
    };

    try {
      const started = await this.requestJson<LeVoGenerateResponse>('POST', '/generate', payload, 30_000);

      if (started.status !== 'accepted' || !started.job_id || !started.status_url) {
        const message = started.detail || started.message || `Unexpected LeVo start response: ${JSON.stringify(started)}`;
        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: message,
          metadata: { apiUrl: this.apiBaseUrl, request: payload, response: started }
        };
      }

      const deadline = Date.now() + timeoutMs;
      let response: LeVoGenerateResponse = started;

      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 5_000));
        response = await this.requestJson<LeVoGenerateResponse>('GET', started.status_url, undefined, 20_000);

        if (response.status === 'success') break;
        if (response.status === 'error') {
          return {
            status: 'ERROR',
            audioBuffer: null,
            audioPath: null,
            error: response.detail || response.message || 'LeVo job failed.',
            metadata: { apiUrl: this.apiBaseUrl, request: payload, response }
          };
        }
      }

      if (response.status !== 'success' || !response.audio_url) {
        return {
          status: 'ENGINE_NOT_AVAILABLE',
          audioBuffer: null,
          audioPath: null,
          error: `LeVo job timed out after ${timeoutMs}ms`,
          metadata: { apiUrl: this.apiBaseUrl, request: payload, response }
        };
      }

      const audioBuffer = await this.requestBuffer(response.audio_url, 120_000);
      if (!audioBuffer.length) {
        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: 'LeVo returned an empty audio file.',
          metadata: { apiUrl: this.apiBaseUrl, response }
        };
      }

      return {
        status: 'SUCCESS',
        audioBuffer,
        audioPath: response.output_path || response.audio_url,
        metadata: {
          engine: 'LeVo',
          apiUrl: this.apiBaseUrl,
          durationSec,
          bpm,
          remoteJobId: started.job_id,
          remoteOutputPath: response.output_path,
          audioUrl: response.audio_url,
          bytes: audioBuffer.length,
          response
        }
      };
    } catch (error) {
      const message = this.errorMessage(error);
      return {
        status: 'ENGINE_NOT_AVAILABLE',
        audioBuffer: null,
        audioPath: null,
        error: `LeVo generation failed: ${message}`,
        metadata: { apiUrl: this.apiBaseUrl, request: payload, error: message }
      };
    }
  }

  public async shutdown(): Promise<void> {
    this.isInitialized = false;
  }

  private requestJson<T>(method: 'GET' | 'POST', endpoint: string, body?: Record<string, unknown>, timeoutMs = 30_000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const target = endpoint.startsWith('http://') || endpoint.startsWith('https://')
        ? new URL(endpoint)
        : new URL(`${this.apiBaseUrl}${endpoint}`);
      const client = target.protocol === 'https:' ? https : http;
      const payload = body ? JSON.stringify(body) : undefined;

      const request = client.request(target, {
        method,
        headers: payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        } : undefined
      }, response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: any = {};
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            return reject(new Error(`LeVo returned invalid JSON (${response.statusCode}): ${raw.slice(0, 500)}`));
          }

          if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode >= 300) {
            return reject(new Error(parsed.detail || parsed.message || `LeVo HTTP ${response.statusCode}`));
          }
          resolve(parsed as T);
        });
      });

      request.setTimeout(timeoutMs, () => request.destroy(new Error(`LeVo request timed out after ${timeoutMs}ms`)));
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
      const request = client.get(target, response => {
        if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          return reject(new Error(`LeVo audio download failed with HTTP ${response.statusCode}`));
        }
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      });
      request.setTimeout(timeoutMs, () => request.destroy(new Error(`LeVo audio download timed out after ${timeoutMs}ms`)));
      request.on('error', reject);
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
