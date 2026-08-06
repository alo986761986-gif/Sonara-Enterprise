import {
  IAudioGenerationEngine,
  GenerationParams,
  GenerationResult,
  EngineHealthStatus
} from './IAudioGenerationEngine';
import http from 'http';
import https from 'https';

interface AceStepHealthResponse {
  status?: string;
  engine?: string;
  api?: string;
}

interface AceStepGenerateResponse {
  status?: string;
  output_path?: string;
  audio_url?: string;
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
        10_000
      );

      const ready = response.status === 'healthy';

      this.isAvailable = ready;
      this.lastError = ready
        ? null
        : `Unexpected ACE-Step health response: ${JSON.stringify(response)}`;

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
          health
        }
      };
    }

    const requestedDurationSec = Math.max(
      5,
      Math.min(240, Number(params.durationSec || 15))
    );

    const bpm = Math.max(
      60,
      Math.min(240, Number(params.bpm || 128))
    );

    const requestedBeatsPerBar = Number((params as any).beatsPerBar);
    const beatsPerBar = Number.isFinite(requestedBeatsPerBar) && requestedBeatsPerBar > 0
      ? Math.max(1, Math.min(16, Math.round(requestedBeatsPerBar)))
      : 4;
    const timeSignature = String(
      (params as any).timeSignature || `${beatsPerBar}/4`
    );
    const secondsPerBar = (60 / bpm) * beatsPerBar;
    const requestedBars = Number((params as any).totalBars);
    const totalBars = Number.isFinite(requestedBars) && requestedBars > 0
      ? Math.max(4, Math.round(requestedBars))
      : Math.max(4, Math.round((requestedDurationSec / secondsPerBar) / 4) * 4);
    const durationSec = Number((totalBars * secondsPerBar).toFixed(3));

    const timeoutMs = Math.max(
      Number(params.timeoutMs || 300_000),
      60_000
    );

    const prompt = this.buildPrompt(params, bpm);

    const payload = {
      checkpoint_path:
        process.env.ACE_STEP_CHECKPOINT_PATH ||
        '/workspace/ACE-Step/checkpoints',

      bf16: true,
      torch_compile: Boolean((params as any).torchCompile ?? false),
      cpu_offload: false,
      overlapped_decode: Boolean((params as any).overlappedDecode ?? false),
      device_id: Number(process.env.ACE_STEP_DEVICE_ID || 0),

      audio_duration: durationSec,
      prompt,
      lyrics: params.lyrics || '',

      infer_step: Number((params as any).inferStep || 60),
      guidance_scale: Number((params as any).guidanceScale || 15),
      scheduler_type: (params as any).schedulerType || 'euler',
      cfg_type: (params as any).cfgType || 'apg',
      omega_scale: Number((params as any).omegaScale || 10),

      actual_seeds: [
        Number((params as any).seed || 42)
      ],

      guidance_interval: Number(
        (params as any).guidanceInterval ?? 0.5
      ),

      guidance_interval_decay: Number(
        (params as any).guidanceIntervalDecay ?? 0
      ),

      min_guidance_scale: Number(
        (params as any).minGuidanceScale || 3
      ),

      use_erg_tag:
        (params as any).useErgTag ?? true,

      use_erg_lyric:
        (params as any).useErgLyric ??
        Boolean(params.lyrics),

      use_erg_diffusion:
        (params as any).useErgDiffusion ?? true,

      oss_steps:
        Array.isArray((params as any).ossSteps)
          ? (params as any).ossSteps
          : [],

      guidance_scale_text: Number(
        (params as any).guidanceScaleText || 0
      ),

      guidance_scale_lyric: Number(
        (params as any).guidanceScaleLyric || 0
      )
    };

    console.log(
      `[ENTERPRISE_LOG] [AceStepEngine] Generating ${durationSec}s through ${this.apiBaseUrl}/generate`
    );

    try {
      const response = await this.requestJson<AceStepGenerateResponse>(
        'POST',
        '/generate',
        payload,
        timeoutMs
      );

      if (
        response.status !== 'success' ||
        !response.audio_url
      ) {
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
            response
          }
        };
      }

      const audioBuffer = await this.requestBuffer(
        response.audio_url,
        Math.max(timeoutMs, 120_000)
      );

      if (audioBuffer.length === 0) {
        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: 'ACE-Step returned an empty WAV file.',
          metadata: {
            apiUrl: this.apiBaseUrl,
            response
          }
        };
      }

      return {
        status: 'SUCCESS',
        audioBuffer,
        audioPath:
          response.output_path ||
          response.audio_url,

        metadata: {
          engine: 'ACE-Step',
          apiUrl: this.apiBaseUrl,
          durationSec,
          requestedDurationSec,
          bpm,
          totalBars,
          beatsPerBar,
          timeSignature,
          secondsPerBar: Number(secondsPerBar.toFixed(6)),
          prompt,
          remoteOutputPath:
            response.output_path,
          audioUrl:
            response.audio_url,
          bytes:
            audioBuffer.length,
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
      params.mood
        ? `${params.mood} mood`
        : '',
      params.prompt ||
        'Modern electronic dance track',
      (params as any).structurePrompt || '',
      (params as any).groovePrompt || '',
      'MIX_ARCHITECTURE: drums centered and transient-clear; bass mono-compatible below 100 Hz; vocals centered with clean presence; harmonic instruments frequency-carved and spatially separated',
      'MASTER_REQUIREMENTS: real stereo image, high transient definition, no clipping, no frequency masking, clean sub-bass, complete final bar'
    ];

    return parts
      .filter(Boolean)
      .join(', ');
  }

  private requestJson<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: Record<string, unknown>,
    timeoutMs = 30_000
  ): Promise<T> {
    return new Promise<T>(
      (resolve, reject) => {
        const target = new URL(
          `${this.apiBaseUrl}${endpoint}`
        );

        const client =
          target.protocol === 'https:'
            ? https
            : http;

        const payload = body
          ? JSON.stringify(body)
          : undefined;

        const request = client.request(
          target,
          {
            method,
            headers: payload
              ? {
                  'Content-Type':
                    'application/json',

                  'Content-Length':
                    Buffer.byteLength(payload)
                }
              : undefined
          },
          (response) => {
            const chunks: Buffer[] = [];

            response.on(
              'data',
              (chunk: Buffer | string) => {
                chunks.push(
                  Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk)
                );
              }
            );

            response.on(
              'end',
              () => {
                const raw =
                  Buffer.concat(chunks)
                    .toString('utf8');

                let parsed: any = {};

                try {
                  parsed = raw
                    ? JSON.parse(raw)
                    : {};
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
              }
            );
          }
        );

        request.setTimeout(
          timeoutMs,
          () => {
            request.destroy(
              new Error(
                `ACE-Step request timed out after ${timeoutMs}ms`
              )
            );
          }
        );

        request.on(
          'error',
          reject
        );

        if (payload) {
          request.write(payload);
        }

        request.end();
      }
    );
  }

  private requestBuffer(
    endpoint: string,
    timeoutMs: number
  ): Promise<Buffer> {
    return new Promise<Buffer>(
      (resolve, reject) => {
        const target =
          endpoint.startsWith('http://') ||
          endpoint.startsWith('https://')
            ? new URL(endpoint)
            : new URL(
                `${this.apiBaseUrl}${endpoint}`
              );

        const client =
          target.protocol === 'https:'
            ? https
            : http;

        const request = client.get(
          target,
          (response) => {
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

            response.on(
              'data',
              (chunk: Buffer | string) => {
                chunks.push(
                  Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk)
                );
              }
            );

            response.on(
              'end',
              () => {
                resolve(
                  Buffer.concat(chunks)
                );
              }
            );
          }
        );

        request.setTimeout(
          timeoutMs,
          () => {
            request.destroy(
              new Error(
                `ACE-Step audio download timed out after ${timeoutMs}ms`
              )
            );
          }
        );

        request.on(
          'error',
          reject
        );
      }
    );
  }

  private errorMessage(
    error: unknown
  ): string {
    return error instanceof Error
      ? error.message
      : String(error);
  }
}
