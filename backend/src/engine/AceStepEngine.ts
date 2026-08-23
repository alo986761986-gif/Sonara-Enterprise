import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  IAudioGenerationEngine,
  GenerationParams,
  GenerationResult,
  EngineHealthStatus
} from './IAudioGenerationEngine';

type AceTaskResponse = {
  data?: {
    task_id?: string;
  };
};

type AceResultItem = {
  status?: number;
  result?: string | unknown[];
  error?: string;
};

type AceQueryResponse = {
  data?: AceResultItem[];
};

type AceAudioResult = {
  file?: string;
  url?: string;
  [key: string]: unknown;
};

export class AceStepEngine extends IAudioGenerationEngine {
  readonly name = 'AceStepModal';

  private static instance: AceStepEngine | null = null;
  private initialized = false;
  private lastError: string | null = null;
  private readonly baseUrl = String(process.env.ACESTEP_API_URL || '').replace(/\/$/, '');
  private readonly modalKey = String(process.env.MODAL_PROXY_KEY || '');
  private readonly modalSecret = String(process.env.MODAL_PROXY_SECRET || '');
  private readonly client: AxiosInstance;

  private constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl || undefined,
      headers: this.authHeaders(),
      timeout: 30_000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
  }

  public static getInstance(): AceStepEngine {
    if (!AceStepEngine.instance) AceStepEngine.instance = new AceStepEngine();
    return AceStepEngine.instance;
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
    if (!this.baseUrl) {
      return {
        isAvailable: false,
        engineName: this.name,
        status: 'ENGINE_NOT_AVAILABLE',
        error: 'ACESTEP_API_URL is not configured.'
      };
    }

    if (!this.modalKey || !this.modalSecret) {
      return {
        isAvailable: false,
        engineName: this.name,
        status: 'ENGINE_NOT_AVAILABLE',
        error: 'Modal proxy credentials are not configured.'
      };
    }

    try {
      const response = await this.client.get('/health', { timeout: 60_000 });
      this.lastError = null;
      return {
        isAvailable: response.status >= 200 && response.status < 300,
        engineName: this.name,
        status: 'READY',
        details: { baseUrl: this.baseUrl, health: response.data }
      };
    } catch (error) {
      const message = this.errorMessage(error);
      this.lastError = message;
      return {
        isAvailable: false,
        engineName: this.name,
        status: 'ENGINE_NOT_AVAILABLE',
        error: message,
        details: { baseUrl: this.baseUrl }
      };
    }
  }

  public async generate(params: GenerationParams): Promise<GenerationResult> {
    if (!this.initialized) this.initialized = true;

    if (!this.baseUrl || !this.modalKey || !this.modalSecret) {
      return {
        status: 'ENGINE_NOT_AVAILABLE',
        audioBuffer: null,
        audioPath: null,
        error: 'ACE-Step Modal is not configured.'
      };
    }

    const timeoutMs = Math.max(Number(params.timeoutMs || 900_000), 120_000);
    const duration = Math.max(5, Math.min(Number(params.durationSec || 30), 480));
    const bpm = Math.max(40, Math.min(Number(params.bpm || 128), 240));
    const pollIntervalMs = Math.max(1000, Number(process.env.ACESTEP_POLL_INTERVAL_MS || 3000));

    const prompt = [params.genre, params.mood, params.prompt]
      .filter(Boolean)
      .map(value => String(value).trim())
      .filter(Boolean)
      .join(', ');

    const requestBody = {
      prompt,
      lyrics: params.lyrics || '',
      thinking: String(process.env.ACESTEP_THINKING || 'true').toLowerCase() !== 'false',
      audio_duration: duration,
      bpm,
      inference_steps: Math.max(1, Number(process.env.ACESTEP_INFERENCE_STEPS || 4)),
      batch_size: 1,
      infer_method: process.env.ACESTEP_INFER_METHOD || 'ode',
      audio_format: process.env.ACESTEP_AUDIO_FORMAT || 'mp3',
      model: process.env.ACESTEP_MODEL || 'acestep-v15-turbo'
    };

    console.log(`[ENTERPRISE_LOG] [AceStepEngine] Submitting generation to Modal L4 | ${duration}s | ${bpm} BPM`);

    try {
      const submit = await this.client.post<AceTaskResponse>('/release_task', requestBody, {
        timeout: 90_000
      });
      const taskId = submit.data?.data?.task_id;
      if (!taskId) throw new Error('ACE-Step did not return a task_id.');

      const deadline = Date.now() + timeoutMs;
      let finalItem: AceResultItem | null = null;

      while (Date.now() < deadline) {
        await this.sleep(pollIntervalMs);
        const query = await this.client.post<AceQueryResponse>(
          '/query_result',
          { task_id_list: [taskId] },
          { timeout: 60_000 }
        );
        const item = query.data?.data?.[0];
        if (!item) continue;
        if (item.status === 1) {
          finalItem = item;
          break;
        }
        if (item.status === 2) {
          throw new Error(item.error || `ACE-Step task ${taskId} failed.`);
        }
      }

      if (!finalItem) throw new Error(`ACE-Step task ${taskId} timed out after ${timeoutMs}ms.`);

      const outputs = this.parseResults(finalItem.result);
      const first = outputs[0];
      if (!first) throw new Error('ACE-Step completed without an audio result.');

      const relativeUrl = first.url || first.file;
      if (!relativeUrl) throw new Error('ACE-Step result did not contain a downloadable audio URL.');
      const audioUrl = /^https?:\/\//i.test(relativeUrl)
        ? relativeUrl
        : `${this.baseUrl}${relativeUrl.startsWith('/') ? '' : '/'}${relativeUrl}`;

      const audioResponse = await axios.get<ArrayBuffer>(audioUrl, {
        headers: this.authHeaders(),
        responseType: 'arraybuffer',
        timeout: 120_000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      const audioBuffer = Buffer.from(audioResponse.data);
      if (!audioBuffer.length) throw new Error('ACE-Step returned an empty audio file.');

      const ext = this.extensionFromUrl(audioUrl);
      const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonara-acestep-'));
      const audioPath = path.join(workDir, `acestep-${taskId}${ext}`);
      fs.writeFileSync(audioPath, audioBuffer);

      this.lastError = null;
      return {
        status: 'SUCCESS',
        audioBuffer,
        audioPath,
        metadata: {
          engine: 'ACE-Step 1.5',
          provider: 'Modal',
          gpu: 'L4',
          model: requestBody.model,
          taskId,
          durationSec: duration,
          bpm,
          bytes: audioBuffer.length,
          output: first
        }
      };
    } catch (error) {
      const message = this.errorMessage(error);
      this.lastError = message;
      console.error(`[AceStepEngine] Generation failed: ${message}`);
      return {
        status: 'ENGINE_NOT_AVAILABLE',
        audioBuffer: null,
        audioPath: null,
        error: message,
        metadata: { engine: this.name, baseUrl: this.baseUrl }
      };
    }
  }

  public async shutdown(): Promise<void> {
    this.initialized = false;
    this.lastError = null;
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.modalKey) headers['Modal-Key'] = this.modalKey;
    if (this.modalSecret) headers['Modal-Secret'] = this.modalSecret;
    return headers;
  }

  private parseResults(value: string | unknown[] | undefined): AceAudioResult[] {
    if (!value) return [];
    if (Array.isArray(value)) return value as AceAudioResult[];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }

  private extensionFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const source = parsed.searchParams.get('path') || parsed.pathname;
      const ext = path.extname(source).toLowerCase();
      return ['.wav', '.mp3', '.flac', '.m4a', '.ogg'].includes(ext) ? ext : '.mp3';
    } catch {
      return '.mp3';
    }
  }

  private errorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      const detail = typeof data === 'string' ? data : JSON.stringify(data || {});
      return `ACE-Step HTTP${status ? ` ${status}` : ''}: ${detail || error.message}`;
    }
    return error instanceof Error ? error.message : String(error);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
