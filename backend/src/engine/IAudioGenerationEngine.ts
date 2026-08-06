export interface GenerationParams {
  prompt: string;
  genre?: string;
  mood?: string;
  lyrics?: string;
  title?: string;
  durationSec?: number;
  bpm?: number;
  timeoutMs?: number;
  [key: string]: any;
}

export interface GenerationResult {
  status: 'SUCCESS' | 'ENGINE_NOT_AVAILABLE' | 'ERROR';
  audioBuffer: Buffer | null;
  audioPath: string | null;
  metadata?: Record<string, any> | null;
  error?: string;
}

export interface EngineHealthStatus {
  isAvailable: boolean;
  engineName: string;
  status: 'READY' | 'ENGINE_NOT_AVAILABLE' | 'INITIALIZING' | 'ERROR';
  error?: string;
  details?: Record<string, any>;
}

export abstract class IAudioGenerationEngine {
  abstract readonly name: string;

  abstract initialize(): Promise<void>;
  abstract loadModel(modelId?: string): Promise<boolean>;
  abstract generate(params: GenerationParams): Promise<GenerationResult>;
  abstract shutdown(): Promise<void>;
  abstract healthCheck(): Promise<EngineHealthStatus>;
}
