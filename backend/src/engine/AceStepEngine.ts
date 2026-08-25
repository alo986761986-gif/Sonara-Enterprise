import {
  IAudioGenerationEngine,
  GenerationParams,
  GenerationResult,
  EngineHealthStatus
} from './IAudioGenerationEngine';
import fs from 'fs';
import http from 'http';
import https from 'https';

interface AceStepHealthResponse {
  status?: string;
  engine?: string;
  api?: string;
  ready?: boolean;
  is_ready?: boolean;
  message?: string;
  detail?: string;
}

interface AceStepGenerateResponse {
  status?: string;
  output_path?: string;
  outputPath?: string;
  audio_url?: string;
  audioUrl?: string;
  url?: string;
  message?: string;
  detail?: string;
}

export class AceStepEngine extends IAudioGenerationEngine {
  readonly name = 'AceStepEngine';

  private isInitialized = false;
  private isAvailable = false;
  private lastError: string | null = null;

  private static instance: AceStepEngine | null = null;

  private readonly apiBaseUrl =
    (process.env.ACE_STEP_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

  private readonly apiKey = (process.env.ACE_STEP_API_KEY || '').trim();

  private readonly defaultTimeoutMs = Math.max(
    Number(process.env.ACE_STEP_TIMEOUT_MS || 600_000),
    120_000
  );

  public static getInstance(): AceStepEngine {
    if (!AceStepEngine.instance) {
      AceStepEngine.instance = new AceStepEngine();
    }

    return AceStepEngine.instance;
  }

  public async initialize(): Promise<void> {
    console.log(
      `[ENTERPRISE_LOG] [AceStepEngine] Initializing ${this.name} through ${this.apiBaseUrl}...`
    );

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
    try {
      const response = await this.requestJson<AceStepHealthResponse>(
        'GET',
        '/health',
        undefined,
        15_000
      );

      const status = String(response.status || response.api || '').toLowerCase();
      const ready =
        response.ready === true ||
        response.is_ready === true ||
        ['healthy', 'ready', 'ok', 'success', 'online'].includes(status);

      this.isAvailable = ready;
      this.lastError = ready
        ? null
        : response.detail ||
          response.message ||
          `Unexpected ACE-Step health response: ${JSON.stringify(response)}`;

      return {
        isAvailable: ready,
        engineName: this.name,
        status: ready ? 'READY' : 'ENGINE_NOT_AVAILABLE',
        error: this.lastError || undefined,
        details: {
          apiUrl: this.apiBaseUrl,
          response
        }
      };
    } catch (error) {
      const message = this.errorMessage(error);

      this.isAvailable = false;
      this.lastError = message;

      return {
        isAvailable: false,
        engineName: this.name,
        status: 'ENGINE_NOT_AVAILABLE',
        error: message,
        details: {
          apiUrl: this.apiBaseUrl
        }
      };
    }
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
        error: `ACE-Step API is unavailable: ${health.error || 'health check failed'}`,
        metadata: {
          status: 'ENGINE_NOT_AVAILABLE',
          apiUrl: this.apiBaseUrl,
          health,
          error: health.error || 'health check failed'
        }
      };
    }

    const durationSec = Math.max(
      5,
      Math.min(480, Number(params.durationSec || 15))
    );

    const bpm = Math.max(
      60,
      Math.min(240, Number(params.bpm || 128))
    );

    const timeoutMs = Math.max(
      Number(params.timeoutMs || this.defaultTimeoutMs),
      120_000
    );

    const prompt = this.buildPrompt(params, bpm);
    const configuredCheckpointPath = (process.env.ACE_STEP_CHECKPOINT_PATH || '').trim();

    const payload: Record<string, unknown> = {
      bf16: this.envBoolean('ACE_STEP_BF16', true),
      torch_compile: this.envBoolean('ACE_STEP_TORCH_COMPILE', false),
      cpu_offload: this.envBoolean('ACE_STEP_CPU_OFFLOAD', false),
      overlapped_decode: this.envBoolean('ACE_STEP_OVERLAPPED_DECODE', false),
      device_id: Number(process.env.ACE_STEP_DEVICE_ID || 0),

      audio_duration: durationSec,
      prompt,
      lyrics: params.lyrics || '',

      infer_step: Number((params as any).inferStep || process.env.ACE_STEP_INFER_STEP || 60),
      guidance_scale: Number((params as any).guidanceScale || process.env.ACE_STEP_GUIDANCE_SCALE || 15),
      scheduler_type: (params as any).schedulerType || process.env.ACE_STEP_SCHEDULER || 'euler',
      cfg_type: (params as any).cfgType || process.env.ACE_STEP_CFG_TYPE || 'apg',
      omega_scale: Number((params as any).omegaScale || process.env.ACE_STEP_OMEGA_SCALE || 10),

      actual_seeds: [
        Number((params as any).seed ?? Math.floor(Math.random() * 2_147_483_647))
      ],

      guidance_interval: Number((params as any).guidanceInterval ?? 0.5),
      guidance_interval_decay: Number((params as any).guidanceIntervalDecay ?? 0),
      min_guidance_scale: Number((params as any).minGuidanceScale || 3),

      use_erg_tag: (params as any).useErgTag ?? true,
      use_erg_lyric: (params as any).useErgLyric ?? Boolean(params.lyrics),
      use_erg_diffusion: (params as any).useErgDiffusion ?? true,

      oss_steps: Array.isArray((params as any).ossSteps)
        ? (params as any).ossSteps
        : [],

      guidance_scale_text: Number((params as any).guidanceScaleText || 0),
      guidance_scale_lyric: Number((params as any).guidanceScaleLyric || 0)
    };

    // On local Windows setups ACE-Step should use the checkpoint path configured by
    // its own API service. Only override it when explicitly configured for Sonara.
    if (configuredCheckpointPath) {
      payload.checkpoint_path = configuredCheckpointPath;
    }

    console.log(
      `[ENTERPRISE_LOG] [AceStepEngine] Generating ${durationSec}s through ${this.apiBaseUrl}/generate (timeout ${timeoutMs}ms)`
    );

    try {
      const response = await this.requestJson<AceStepGenerateResponse>(
        'POST',
        '/generate',
        payload,
        timeoutMs
      );

      const status = String(response.status || '').toLowerCase();
      const audioEndpoint = response.audio_url || response.audioUrl || response.url || '';
      const outputPath = response.output_path || response.outputPath || '';
      const responseLooksSuccessful =
        ['success', 'ok', 'completed', 'complete'].includes(status) ||
        Boolean(audioEndpoint) ||
        Boolean(outputPath);

      if (!responseLooksSuccessful) {
        const message =
          response.detail ||
          response.message ||
          `Unexpected ACE-Step response: ${JSON.stringify(response)}`;

        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: message,
          metadata: {
            apiUrl: this.apiBaseUrl,
            request: payload,
            response,
            error: message
          }
        };
      }

      let audioBuffer: Buffer | null = null;
      let resolvedAudioPath: string | null = null;

      // If ACE-Step returns a path on the same local machine, read it directly.
      if (outputPath && fs.existsSync(outputPath)) {
        audioBuffer = fs.readFileSync(outputPath);
        resolvedAudioPath = outputPath;
      }

      // Otherwise download the generated audio from the API URL.
      if (!audioBuffer && audioEndpoint) {
        audioBuffer = await this.requestBuffer(
          audioEndpoint,
          Math.max(timeoutMs, 120_000)
        );
        resolvedAudioPath = outputPath || audioEndpoint;
      }

      if (!audioBuffer || audioBuffer.length === 0) {
        const message = outputPath && !fs.existsSync(outputPath)
          ? `ACE-Step returned output_path '${outputPath}', but Sonara cannot access that file and no usable audio_url was returned.`
          : 'ACE-Step completed without returning readable audio data.';

        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: message,
          metadata: {
            apiUrl: this.apiBaseUrl,
            request: payload,
            response,
            error: message
          }
        };
      }

      return {
        status: 'SUCCESS',
        audioBuffer,
        audioPath: resolvedAudioPath,
        metadata: {
          engine: 'ACE-Step',
          apiUrl: this.apiBaseUrl,
          durationSec,
          bpm,
          prompt,
          remoteOutputPath: outputPath || undefined,
          audioUrl: audioEndpoint || undefined,
          bytes: audioBuffer.length,
          response
        }
      };
    } catch (error) {
      const message = this.errorMessage(error);

      console.error(
        `[AceStepEngine] Generation failed: ${message}`
      );

      return {
        status: 'ENGINE_NOT_AVAILABLE',
        audioBuffer: null,
        audioPath: null,
        error: `ACE-Step generation failed: ${message}`,
        metadata: {
          status: 'ENGINE_NOT_AVAILABLE',
          apiUrl: this.apiBaseUrl,
          request: payload,
          error: message
        }
      };
    }
  }

  public async shutdown(): Promise<void> {
    console.log(
      `[ENTERPRISE_LOG] [AceStepEngine] Shutting down ${this.name}...`
    );

    this.isInitialized = false;
    this.isAvailable = false;
    this.lastError = null;
  }

  private buildPrompt(
    params: GenerationParams,
    bpm: number
  ): string {
    const parts = [
      params.genre || 'House',
      `track at ${bpm} BPM`,
      params.mood ? `${params.mood} mood` : '',
      params.prompt || 'Modern electronic dance track',
      'clear musical structure, defined kick, bassline, percussion and harmonic progression'
    ];

    return parts
      .filter(Boolean)
      .join(', ');
  }

  private envBoolean(name: string, fallback: boolean): boolean {
    const value = process.env[name];
    if (value === undefined || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
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
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
        headers['X-API-Key'] = this.apiKey;
      }

      const request = client.request(
        target,
        {
          method,
          headers: Object.keys(headers).length > 0 ? headers : undefined
        },
        response => {
          const chunks: Buffer[] = [];

          response.on('data', (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            let parsed: any = {};

            try {
              parsed = raw ? JSON.parse(raw) : {};
            } catch {
              return reject(
                new Error(
                  `ACE-Step returned invalid JSON (${response.statusCode}): ${raw.slice(0, 500)}`
                )
              );
            }

            if (
              response.statusCode === undefined ||
              response.statusCode < 200 ||
              response.statusCode >= 300
            ) {
              return reject(
                new Error(
                  parsed.detail ||
                    parsed.message ||
                    `ACE-Step HTTP ${response.statusCode}`
                )
              );
            }

            resolve(parsed as T);
          });
        }
      );

      request.setTimeout(timeoutMs, () => {
        request.destroy(
          new Error(`ACE-Step request timed out after ${timeoutMs}ms`)
        );
      });

      request.on('error', reject);

      if (payload) {
        request.write(payload);
      }

      request.end();
    });
  }

  private requestBuffer(
    endpoint: string,
    timeoutMs: number,
    redirectCount = 0
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const target = endpoint.startsWith('http://') || endpoint.startsWith('https://')
        ? new URL(endpoint)
        : new URL(endpoint, `${this.apiBaseUrl}/`);

      const client = target.protocol === 'https:' ? https : http;
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
        headers['X-API-Key'] = this.apiKey;
      }

      const request = client.get(
        target,
        { headers: Object.keys(headers).length > 0 ? headers : undefined },
        response => {
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            response.resume();
            if (redirectCount >= 3) {
              return reject(new Error('ACE-Step audio download exceeded redirect limit.'));
            }
            const redirected = new URL(response.headers.location, target).toString();
            return this.requestBuffer(redirected, timeoutMs, redirectCount + 1)
              .then(resolve)
              .catch(reject);
          }

          if (
            response.statusCode === undefined ||
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            response.resume();
            return reject(
              new Error(
                `ACE-Step audio download failed with HTTP ${response.statusCode}`
              )
            );
          }

          const chunks: Buffer[] = [];

          response.on('data', (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

          response.on('end', () => {
            resolve(Buffer.concat(chunks));
          });
        }
      );

      request.setTimeout(timeoutMs, () => {
        request.destroy(
          new Error(`ACE-Step audio download timed out after ${timeoutMs}ms`)
        );
      });

      request.on('error', reject);
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
