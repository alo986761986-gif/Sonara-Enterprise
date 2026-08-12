import {
  IAudioGenerationEngine,
  GenerationParams,
  GenerationResult,
  EngineHealthStatus
} from './IAudioGenerationEngine';
import http from 'http';
import https from 'https';

interface AceStepApiEnvelope<T> {
  data?: T;
  code?: number;
  error?: string | null;
  timestamp?: number;
  extra?: unknown;
}

interface AceStepHealthData {
  status?: string;
  service?: string;
  version?: string;
}

interface AceStepReleaseTaskData {
  task_id?: string;
  status?: string;
}

interface AceStepQueryItem {
  task_id?: string;
  status?: number;
  result?: string;
}

interface AceStepAudioResult {
  file?: string;
  url?: string;
  status?: number;
  seed?: number;
  caption?: string;
  lyrics?: string;
  bpm?: number | null;
  duration?: number | null;
  keyscale?: string;
  timesignature?: string;
  vocal_language?: string;
}

export class AceStepEngine extends IAudioGenerationEngine {
  readonly name = 'AceStepEngine';

  private isInitialized = false;
  private isAvailable = false;
  private lastError: string | null = null;

  private static instance: AceStepEngine | null = null;

  private apiBaseUrl = this.normalizeApiBaseUrl(
    process.env.ACE_STEP_API_URL || 'http://127.0.0.1:8001'
  );

  // The API key stays backend-only. The frontend can change the public endpoint,
  // but it never receives or modifies this secret.
  private readonly apiKey = (process.env.ACE_STEP_API_KEY || '').trim();

  public static getInstance(): AceStepEngine {
    if (!AceStepEngine.instance) {
      AceStepEngine.instance = new AceStepEngine();
    }

    return AceStepEngine.instance;
  }

  public getApiBaseUrl(): string {
    return this.apiBaseUrl;
  }

  public setApiBaseUrl(apiUrl: string): string {
    const normalized = this.normalizeApiBaseUrl(apiUrl);

    if (normalized !== this.apiBaseUrl) {
      console.log(
        `[ENTERPRISE_LOG] [AceStepEngine] Updating API endpoint: ${this.apiBaseUrl} -> ${normalized}`
      );
    }

    this.apiBaseUrl = normalized;
    this.isAvailable = false;
    this.lastError = null;

    return this.apiBaseUrl;
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
      const response = await this.requestJson<AceStepApiEnvelope<AceStepHealthData>>(
        'GET',
        '/health',
        undefined,
        10_000,
        false
      );

      const ready =
        response.code === 200 &&
        (response.data?.status === 'ok' || response.data?.status === 'healthy');

      this.isAvailable = ready;
      this.lastError = ready
        ? null
        : response.error || `Unexpected ACE-Step health response: ${JSON.stringify(response)}`;

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

    const durationSec = Math.max(
      10,
      Math.min(600, Number(params.durationSec || 15))
    );

    const bpm = Math.max(
      30,
      Math.min(300, Number(params.bpm || 128))
    );

    const timeoutMs = Math.max(
      Number(params.timeoutMs || 900_000),
      120_000
    );

    const prompt = this.buildPrompt(params, bpm);
    const lyrics = String(params.lyrics || '');

    const payload: Record<string, unknown> = {
      prompt,
      lyrics,
      thinking: Boolean((params as any).thinking ?? false),
      bpm,
      audio_duration: durationSec,
      inference_steps: Number((params as any).inferenceSteps || (params as any).inferStep || 8),
      guidance_scale: Number((params as any).guidanceScale ?? 1.0),
      batch_size: Number((params as any).batchSize || 1),
      audio_format: (params as any).audioFormat || 'wav',
      use_random_seed: (params as any).useRandomSeed ?? true
    };

    const seed = Number((params as any).seed);
    if (Number.isFinite(seed) && seed >= 0) {
      payload.use_random_seed = false;
      payload.seed = seed;
    }

    console.log(
      `[ENTERPRISE_LOG] [AceStepEngine] Generating ${durationSec}s through ${this.apiBaseUrl}/release_task`
    );

    try {
      const releaseResponse = await this.requestJson<AceStepApiEnvelope<AceStepReleaseTaskData>>(
        'POST',
        '/release_task',
        payload,
        timeoutMs,
        true
      );

      const taskId = releaseResponse.data?.task_id;
      if (releaseResponse.code !== 200 || !taskId) {
        const message =
          releaseResponse.error ||
          `Unexpected ACE-Step release_task response: ${JSON.stringify(releaseResponse)}`;

        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: message,
          metadata: {
            apiUrl: this.apiBaseUrl,
            request: payload,
            releaseResponse
          }
        };
      }

      const queryResponse = await this.waitForResult(taskId, timeoutMs);
      const queryItem = queryResponse.data?.[0];

      if (!queryItem || queryItem.status !== 1 || !queryItem.result) {
        const message =
          queryResponse.error ||
          `ACE-Step task ${taskId} did not complete successfully.`;

        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: message,
          metadata: {
            apiUrl: this.apiBaseUrl,
            request: payload,
            taskId,
            queryResponse
          }
        };
      }

      let audioResults: AceStepAudioResult[] = [];
      try {
        const parsed = JSON.parse(queryItem.result);
        audioResults = Array.isArray(parsed) ? parsed : [];
      } catch {
        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: 'ACE-Step returned an invalid query_result payload.',
          metadata: {
            apiUrl: this.apiBaseUrl,
            taskId,
            rawResult: queryItem.result
          }
        };
      }

      const firstAudio = audioResults.find(item => item?.url);
      if (!firstAudio?.url) {
        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: 'ACE-Step completed the task but returned no downloadable audio URL.',
          metadata: {
            apiUrl: this.apiBaseUrl,
            taskId,
            audioResults
          }
        };
      }

      const audioBuffer = await this.requestBuffer(
        firstAudio.url,
        Math.max(timeoutMs, 120_000),
        true
      );

      if (audioBuffer.length === 0) {
        return {
          status: 'ERROR',
          audioBuffer: null,
          audioPath: null,
          error: 'ACE-Step returned an empty audio file.',
          metadata: {
            apiUrl: this.apiBaseUrl,
            taskId,
            firstAudio
          }
        };
      }

      return {
        status: 'SUCCESS',
        audioBuffer,
        audioPath: firstAudio.file || firstAudio.url,
        metadata: {
          engine: 'ACE-Step 1.5',
          apiUrl: this.apiBaseUrl,
          taskId,
          durationSec,
          bpm,
          prompt,
          audioUrl: firstAudio.url,
          remoteOutputPath: firstAudio.file,
          bytes: audioBuffer.length,
          generation: firstAudio,
          releaseResponse,
          queryResponse
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

  private async waitForResult(
    taskId: string,
    timeoutMs: number
  ): Promise<AceStepApiEnvelope<AceStepQueryItem[]>> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const response = await this.requestJson<AceStepApiEnvelope<AceStepQueryItem[]>>(
        'POST',
        '/query_result',
        { task_id_list: [taskId] },
        Math.min(60_000, timeoutMs),
        true
      );

      const item = response.data?.[0];
      if (item?.status === 1 || item?.status === 2) {
        return response;
      }

      await new Promise(resolve => setTimeout(resolve, 1_000));
    }

    throw new Error(`ACE-Step task ${taskId} timed out after ${timeoutMs}ms`);
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
      'clear musical structure, defined kick, bassline, percussion and harmonic progression'
    ];

    return parts
      .filter(Boolean)
      .join(', ');
  }

  private normalizeApiBaseUrl(value: string): string {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');

    if (!trimmed) {
      throw new Error('ACE-Step API URL is required.');
    }

    let target: URL;
    try {
      target = new URL(trimmed);
    } catch {
      throw new Error('ACE-Step API URL is not a valid URL.');
    }

    const hostname = target.hostname.toLowerCase();
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1';

    if (target.username || target.password) {
      throw new Error('ACE-Step API URL must not contain credentials.');
    }

    if (target.protocol !== 'https:' && !(isLocalhost && target.protocol === 'http:')) {
      throw new Error('Remote ACE-Step URLs must use HTTPS. HTTP is allowed only for localhost.');
    }

    target.search = '';
    target.hash = '';
    target.pathname = target.pathname.replace(/\/+$/, '');

    return target.toString().replace(/\/+$/, '');
  }

  private requestJson<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: Record<string, unknown>,
    timeoutMs = 30_000,
    withAuth = true
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

        const headers: Record<string, string | number> = {};
        if (payload) {
          headers['Content-Type'] = 'application/json';
          headers['Content-Length'] = Buffer.byteLength(payload);
        }
        if (withAuth && this.apiKey) {
          headers.Authorization = `Bearer ${this.apiKey}`;
        }

        const request = client.request(
          target,
          {
            method,
            headers: Object.keys(headers).length > 0 ? headers : undefined
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
                        parsed.error ||
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
    timeoutMs: number,
    withAuth = true
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

        const headers: Record<string, string> = {};
        if (withAuth && this.apiKey) {
          headers.Authorization = `Bearer ${this.apiKey}`;
        }

        const request = client.get(
          target,
          {
            headers: Object.keys(headers).length > 0 ? headers : undefined
          },
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
