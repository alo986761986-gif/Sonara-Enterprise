import {
  IAudioGenerationEngine,
  GenerationParams,
  GenerationResult,
  EngineHealthStatus
} from './IAudioGenerationEngine';
import fs from 'fs';
import http from 'http';
import https from 'https';

interface LeVo2HealthResponse {
  status?: string;
  engine?: string;
  ready?: boolean;
  is_ready?: boolean;
  mode?: string;
  license_mode?: string;
  message?: string;
  detail?: string;
}

interface LeVo2GenerateResponse {
  status?: string;
  output_path?: string;
  outputPath?: string;
  audio_url?: string;
  audioUrl?: string;
  url?: string;
  message?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Research-only adapter for LeVo 2 / SongGeneration 2.
 *
 * IMPORTANT: the upstream SongGeneration license currently restricts use to
 * academic, research and education purposes and prohibits commercial or
 * production use. This adapter therefore refuses to run when NODE_ENV is
 * "production" unless an explicit future commercial-license flag is set.
 */
export class LeVo2ResearchEngine extends IAudioGenerationEngine {
  readonly name = 'LeVo2ResearchEngine';

  private static instance: LeVo2ResearchEngine | null = null;
  private initialized = false;
  private lastError: string | null = null;

  private readonly apiBaseUrl =
    (process.env.LEVO2_RESEARCH_API_URL || 'http://127.0.0.1:8012').replace(/\/+$/, '');

  private readonly apiKey = (process.env.LEVO2_RESEARCH_API_KEY || '').trim();

  private readonly timeoutMs = Math.max(
    Number(process.env.LEVO2_RESEARCH_TIMEOUT_MS || 1_800_000),
    120_000
  );

  public static getInstance(): LeVo2ResearchEngine {
    if (!LeVo2ResearchEngine.instance) {
      LeVo2ResearchEngine.instance = new LeVo2ResearchEngine();
    }
    return LeVo2ResearchEngine.instance;
  }

  private commercialUseBlocked(): boolean {
    const production = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    const licensed = ['1', 'true', 'yes', 'on'].includes(
      String(process.env.LEVO2_COMMERCIAL_LICENSE || '').toLowerCase()
    );
    return production && !licensed;
  }

  public async initialize(): Promise<void> {
    this.initialized = true;
    await this.healthCheck();
  }

  public async loadModel(_modelId?: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const health = await this.healthCheck();
    return health.isAvailable;
  }

  public async healthCheck(): Promise<EngineHealthStatus> {
    if (this.commercialUseBlocked()) {
      const error = 'LeVo 2 is disabled in production until a commercial-use license is configured.';
      this.lastError = error;
      return {
        isAvailable: false,
        engineName: this.name,
        status: 'ENGINE_NOT_AVAILABLE',
        error,
        details: { licenseMode: 'RESEARCH_ONLY', apiUrl: this.apiBaseUrl }
      };
    }

    try {
      const response = await this.requestJson<LeVo2HealthResponse>('GET', '/health', undefined, 15_000);
      const status = String(response.status || '').toLowerCase();
      const ready = response.ready === true || response.is_ready === true ||
        ['healthy', 'ready', 'ok', 'success', 'online'].includes(status);

      this.lastError = ready ? null : (response.detail || response.message || 'LeVo 2 worker not ready');

      return {
        isAvailable: ready,
        engineName: this.name,
        status: ready ? 'READY' : 'ENGINE_NOT_AVAILABLE',
        error: this.lastError || undefined,
        details: {
          apiUrl: this.apiBaseUrl,
          licenseMode: 'RESEARCH_ONLY',
          response
        }
      };
    } catch (error) {
      const message = this.errorMessage(error);
      this.lastError = message;
      return {
        isAvailable: false,
        engineName: this.name,
        status: 'ENGINE_NOT_AVAILABLE',
        error: message,
        details: { apiUrl: this.apiBaseUrl, licenseMode: 'RESEARCH_ONLY' }
      };
    }
  }

  public async generate(params: GenerationParams): Promise<GenerationResult> {
    if (this.commercialUseBlocked()) {
      const error = 'LeVo 2 generation blocked: research-only license; production use is disabled.';
      return {
        status: 'ENGINE_NOT_AVAILABLE',
        audioBuffer: null,
        audioPath: null,
        error,
        metadata: { engine: 'LeVo2', licenseMode: 'RESEARCH_ONLY' }
      };
    }

    if (!this.initialized) await this.initialize();
    const health = await this.healthCheck();
    if (!health.isAvailable) {
      return {
        status: 'ENGINE_NOT_AVAILABLE',
        audioBuffer: null,
        audioPath: null,
        error: health.error || 'LeVo 2 worker unavailable',
        metadata: { engine: 'LeVo2', health, licenseMode: 'RESEARCH_ONLY' }
      };
    }

    const durationSec = Math.max(15, Math.min(270, Number(params.durationSec || 30)));
    const payload: Record<string, unknown> = {
      prompt: params.prompt || 'Professional music production',
      descriptions: params.prompt || '',
      genre: params.genre || 'Electronic',
      mood: params.mood || '',
      lyrics: params.lyrics || '',
      title: params.title || 'Sonara Research Track',
      duration_sec: durationSec,
      bpm: params.bpm || undefined,
      generate_type: (params as any).generateType || 'mixed',
      auto_prompt_audio_type: (params as any).autoPromptAudioType || 'Electronic',
      use_flash_attn: false,
      research_only: true
    };

    try {
      const response = await this.requestJson<LeVo2GenerateResponse>(
        'POST', '/generate', payload, Math.max(Number(params.timeoutMs || 0), this.timeoutMs)
      );

      const status = String(response.status || '').toLowerCase();
      const outputPath = response.output_path || response.outputPath || '';
      const audioEndpoint = response.audio_url || response.audioUrl || response.url || '';
      const success = ['success', 'ok', 'completed', 'complete'].includes(status) || Boolean(outputPath) || Boolean(audioEndpoint);

      if (!success) {
        const message = response.detail || response.message || `Unexpected LeVo 2 response: ${JSON.stringify(response)}`;
        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: message,
          metadata: { engine: 'LeVo2', request: payload, response, licenseMode: 'RESEARCH_ONLY' }
        };
      }

      let audioBuffer: Buffer | null = null;
      let audioPath: string | null = null;

      if (outputPath && fs.existsSync(outputPath)) {
        audioBuffer = fs.readFileSync(outputPath);
        audioPath = outputPath;
      }

      if (!audioBuffer && audioEndpoint) {
        audioBuffer = await this.requestBuffer(audioEndpoint, this.timeoutMs);
        audioPath = outputPath || audioEndpoint;
      }

      if (!audioBuffer?.length) {
        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: 'LeVo 2 completed without readable audio data.',
          metadata: { engine: 'LeVo2', request: payload, response, licenseMode: 'RESEARCH_ONLY' }
        };
      }

      return {
        status: 'SUCCESS',
        audioBuffer,
        audioPath,
        metadata: {
          engine: 'LeVo2-v2-large',
          apiUrl: this.apiBaseUrl,
          licenseMode: 'RESEARCH_ONLY',
          durationSec,
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
        error: `LeVo 2 generation failed: ${message}`,
        metadata: { engine: 'LeVo2', apiUrl: this.apiBaseUrl, licenseMode: 'RESEARCH_ONLY', error: message }
      };
    }
  }

  public async shutdown(): Promise<void> {
    this.initialized = false;
    this.lastError = null;
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
      const encoded = body ? JSON.stringify(body) : undefined;
      const headers: Record<string, string | number> = {};
      if (encoded) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(encoded);
      }
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
        headers['X-API-Key'] = this.apiKey;
      }

      const req = client.request(target, { method, headers }, res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: any = {};
          try { parsed = raw ? JSON.parse(raw) : {}; }
          catch { return reject(new Error(`LeVo 2 returned invalid JSON (${res.statusCode}): ${raw.slice(0, 500)}`)); }
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(parsed.detail || parsed.message || `LeVo 2 HTTP ${res.statusCode}`));
          }
          resolve(parsed as T);
        });
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`LeVo 2 request timed out after ${timeoutMs}ms`)));
      req.on('error', reject);
      if (encoded) req.write(encoded);
      req.end();
    });
  }

  private requestBuffer(endpoint: string, timeoutMs: number, redirects = 0): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const target = endpoint.startsWith('http://') || endpoint.startsWith('https://')
        ? new URL(endpoint)
        : new URL(endpoint, `${this.apiBaseUrl}/`);
      const client = target.protocol === 'https:' ? https : http;
      const req = client.get(target, res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirects >= 3) return reject(new Error('LeVo 2 audio download exceeded redirect limit.'));
          return this.requestBuffer(new URL(res.headers.location, target).toString(), timeoutMs, redirects + 1)
            .then(resolve).catch(reject);
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`LeVo 2 audio download failed with HTTP ${res.statusCode}`));
        }
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`LeVo 2 audio download timed out after ${timeoutMs}ms`)));
      req.on('error', reject);
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
