import {
  IAudioGenerationEngine,
  GenerationParams,
  GenerationResult,
  EngineHealthStatus
} from './IAudioGenerationEngine';
import fs from 'fs';
import path from 'path';
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

interface SonaraVocalEnvelope {
  lyrics: string;
  language: string;
  instrumental: boolean;
  mode?: string;
  style?: string;
}

export class AceStepEngine extends IAudioGenerationEngine {
  readonly name = 'AceStepEngine';

  private isInitialized = false;
  private isAvailable = false;
  private lastError: string | null = null;
  private lastSuccessfulHealthAt = 0;

  private static instance: AceStepEngine | null = null;

  private readonly endpointStatePath = path.join(
    process.cwd(),
    'storage',
    'ace-step-endpoint.json'
  );

  private apiBaseUrl = this.normalizeApiBaseUrl(
    this.loadInitialApiBaseUrl()
  );

  // The API key stays backend-only. The frontend can change the public endpoint,
  // but it never receives or modifies this secret.
  private readonly apiKey = (process.env.ACE_STEP_API_KEY || '').trim();

  private readonly healthReuseWindowMs = 45_000;
  private readonly healthRetryAttempts = 3;

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

      this.apiBaseUrl = normalized;
      this.isAvailable = false;
      this.lastError = null;
      this.lastSuccessfulHealthAt = 0;
    }

    this.persistApiBaseUrl(normalized);

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
    const now = Date.now();

    if (
      this.isAvailable &&
      this.lastSuccessfulHealthAt > 0 &&
      now - this.lastSuccessfulHealthAt < this.healthReuseWindowMs
    ) {
      return {
        isAvailable: true,
        engineName: this.name,
        status: 'READY',
        details: {
          apiUrl: this.apiBaseUrl,
          cached: true,
          lastSuccessfulHealthAt: this.lastSuccessfulHealthAt
        }
      };
    }

    let lastMessage = 'ACE-Step health check failed.';

    for (let attempt = 1; attempt <= this.healthRetryAttempts; attempt += 1) {
      try {
        const response = await this.requestJson<AceStepApiEnvelope<AceStepHealthData>>(
          'GET',
          '/health',
          undefined,
          12_000,
          false
        );

        const ready =
          response.code === 200 &&
          (response.data?.status === 'ok' || response.data?.status === 'healthy');

        if (ready) {
          this.isAvailable = true;
          this.lastError = null;
          this.lastSuccessfulHealthAt = Date.now();

          return {
            isAvailable: true,
            engineName: this.name,
            status: 'READY',
            details: {
              apiUrl: this.apiBaseUrl,
              response,
              attempt
            }
          };
        }

        lastMessage =
          response.error ||
          `Unexpected ACE-Step health response: ${JSON.stringify(response)}`;

        break;
      } catch (error) {
        lastMessage = this.errorMessage(error);

        const shouldRetry =
          attempt < this.healthRetryAttempts &&
          this.isTransientNetworkError(lastMessage);

        if (!shouldRetry) {
          break;
        }

        console.warn(
          `[ENTERPRISE_LOG] [AceStepEngine] Transient health failure (${attempt}/${this.healthRetryAttempts}): ${lastMessage}. Retrying...`
        );

        await new Promise(resolve => setTimeout(resolve, 750 * attempt));
      }
    }

    this.isAvailable = false;
    this.lastError = lastMessage;

    return {
      isAvailable: false,
      engineName: this.name,
      status: 'ENGINE_NOT_AVAILABLE',
      error: this.lastError,
      details: {
        apiUrl: this.apiBaseUrl,
        retryAttempts: this.healthRetryAttempts
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
    const vocalEnvelope = this.extractSonaraVocalEnvelope(
      String(params.lyrics || ''),
      String((params as any).vocalLanguage || 'unknown'),
      Boolean((params as any).instrumental ?? false)
    );
    const lyrics = vocalEnvelope.lyrics;
    const vocalLanguage = vocalEnvelope.instrumental
      ? 'unknown'
      : vocalEnvelope.language;

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
      vocal_language: vocalLanguage,
      instrumental: vocalEnvelope.instrumental,
      use_random_seed: (params as any).useRandomSeed ?? true
    };

    const seed = Number((params as any).seed);
    if (Number.isFinite(seed) && seed >= 0) {
      payload.use_random_seed = false;
      payload.seed = seed;
    }

    console.log(
      `[ENTERPRISE_LOG] [AceStepEngine] Generating ${durationSec}s through ${this.apiBaseUrl}/release_task | vocals=${vocalEnvelope.instrumental ? 'instrumental' : vocalEnvelope.mode || 'vocal'} | language=${vocalLanguage}`
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
          vocalLanguage,
          instrumental: vocalEnvelope.instrumental,
          vocalMode: vocalEnvelope.mode || null,
          vocalStyle: vocalEnvelope.style || null,
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
    this.lastSuccessfulHealthAt = 0;
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

  private extractSonaraVocalEnvelope(
    rawLyrics: string,
    fallbackLanguage: string,
    fallbackInstrumental: boolean
  ): SonaraVocalEnvelope {
    const normalizedLyrics = String(rawLyrics || '');
    const lines = normalizedLyrics.split(/\r?\n/);
    const firstLine = (lines[0] || '').trim();
    const marker = firstLine.match(
      /^\[SONARA_VOCAL_CONFIG\s+language=(unknown|[a-z]{2})\s+mode=(instrumental|female|male|duet)\s+style=(natural|warm|intimate|powerful|airy|raspy)\s+instrumental=(true|false)\]$/i
    );

    if (!marker) {
      const cleanLanguage = /^(unknown|[a-z]{2})$/i.test(fallbackLanguage)
        ? fallbackLanguage.toLowerCase()
        : 'unknown';
      const cleanLyrics = normalizedLyrics.trim();
      const instrumental = fallbackInstrumental || cleanLyrics.toLowerCase() === '[instrumental]';

      return {
        lyrics: instrumental && !cleanLyrics ? '[Instrumental]' : normalizedLyrics,
        language: instrumental ? 'unknown' : cleanLanguage,
        instrumental
      };
    }

    const strippedLyrics = lines.slice(1).join('\n').trim();
    const instrumental = marker[4].toLowerCase() === 'true' || marker[2].toLowerCase() === 'instrumental';

    return {
      lyrics: instrumental ? '[Instrumental]' : strippedLyrics,
      language: instrumental ? 'unknown' : marker[1].toLowerCase(),
      instrumental,
      mode: marker[2].toLowerCase(),
      style: marker[3].toLowerCase()
    };
  }

  private loadInitialApiBaseUrl(): string {
    try {
      if (fs.existsSync(this.endpointStatePath)) {
        const raw = fs.readFileSync(this.endpointStatePath, 'utf8');
        const parsed = JSON.parse(raw) as { apiUrl?: unknown };
        const persisted = typeof parsed.apiUrl === 'string'
          ? parsed.apiUrl.trim()
          : '';

        if (persisted) {
          console.log(
            `[ENTERPRISE_LOG] [AceStepEngine] Restoring persisted API endpoint: ${persisted}`
          );
          return persisted;
        }
      }
    } catch (error) {
      console.warn(
        `[ENTERPRISE_LOG] [AceStepEngine] Could not restore persisted endpoint: ${this.errorMessage(error)}`
      );
    }

    const environmentUrl = String(process.env.ACE_STEP_API_URL || '').trim();
    return environmentUrl || 'http://127.0.0.1:8001';
  }

  private persistApiBaseUrl(apiUrl: string): void {
    try {
      const directory = path.dirname(this.endpointStatePath);
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }

      fs.writeFileSync(
        this.endpointStatePath,
        JSON.stringify(
          {
            apiUrl,
            updatedAt: new Date().toISOString()
          },
          null,
          2
        ),
        'utf8'
      );
    } catch (error) {
      console.warn(
        `[ENTERPRISE_LOG] [AceStepEngine] Could not persist API endpoint: ${this.errorMessage(error)}`
      );
    }
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

  private isTransientNetworkError(message: string): boolean {
    const normalized = String(message || '').toLowerCase();

    return [
      'econnreset',
      'etimedout',
      'econnrefused',
      'eai_again',
      'socket hang up',
      'network socket disconnected',
      'timed out'
    ].some(token => normalized.includes(token));
  }

  private errorMessage(
    error: unknown
  ): string {
    return error instanceof Error
      ? error.message
      : String(error);
  }
}
