export type EmberRole = 'user' | 'assistant';

export interface EmberConversationMessage {
  id: string;
  role: EmberRole;
  content: string;
  createdAt: string;
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

export interface EmberToolTrace {
  name: string;
  ok: boolean;
}

export interface EmberMessageRequest {
  message: string;
  studioContext?: EmberStudioContext;
}

export interface EmberMessageResponse {
  conversationId: string;
  message: EmberConversationMessage;
  toolTrace: EmberToolTrace[];
}

export interface EmberToolExecutionContext {
  authenticatedUserId: string;
  studioContext: EmberStudioContext;
}

export interface EmberToolDefinition {
  type: 'function';
  name: string;
  description: string;
  strict: true;
  parameters: Record<string, unknown>;
}

export interface EmberToolResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}
