export type EmberStatus = 'online' | 'analyzing' | 'offline';

export type EmberMessageRole = 'user' | 'assistant';

export interface EmberMessage {
  id: string;
  role: EmberMessageRole;
  content: string;
  createdAt?: string;
}

export interface EmberToolTrace {
  name: string;
  ok: boolean;
}

export interface EmberStudioContext {
  prompt?: string;
  genre?: string;
  subgenre?: string;
  mood?: string;
  bpm?: number;
  currentJobId?: string;
  hasAudio?: boolean;
  recommendedEqPresetId?: string;
}

export interface EmberResponse {
  conversationId: string;
  message: EmberMessage;
  toolTrace: EmberToolTrace[];
}
