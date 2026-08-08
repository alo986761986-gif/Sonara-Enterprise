import { useState } from 'react';
import {
  EmberMessage,
  EmberResponse,
  EmberStatus,
  EmberStudioContext,
  EmberToolTrace
} from '../types/ember';

const CONVERSATION_STORAGE_KEY = 'sonara.ember.conversationId';

const INITIAL_MESSAGE: EmberMessage = {
  id: 'ember-welcome',
  role: 'assistant',
  content: 'Ciao, sono Ember. Dimmi cosa vuoi creare oggi.'
};

const createConversationId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ember-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const getConversationId = (): string => {
  const existing = sessionStorage.getItem(CONVERSATION_STORAGE_KEY);
  if (existing && /^[A-Za-z0-9_-]{1,80}$/.test(existing)) return existing;

  const created = createConversationId();
  sessionStorage.setItem(CONVERSATION_STORAGE_KEY, created);
  return created;
};

const responseErrorMessage = (response: Response, data: unknown): string => {
  const code = typeof data === 'object' && data && 'error' in data &&
    typeof (data as { error?: { code?: unknown } }).error?.code === 'string'
    ? (data as { error: { code: string } }).error.code
    : '';

  if (code === 'EMBER_NOT_CONFIGURED') {
    return 'Ember e installata, ma il modello AI non e ancora configurato.';
  }
  if (response.status === 401 || response.status === 403) {
    return 'Accedi per usare Ember.';
  }
  if (code === 'EMBER_RATE_LIMITED') {
    return 'Hai inviato troppi messaggi a Ember. Riprova tra poco.';
  }
  return 'Ember non e disponibile in questo momento. Riprova piu tardi.';
};

export function useEmberConversation(studioContext: EmberStudioContext) {
  const [conversationId] = useState(getConversationId);
  const [messages, setMessages] = useState<EmberMessage[]>([INITIAL_MESSAGE]);
  const [status, setStatus] = useState<EmberStatus>('online');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolTrace, setToolTrace] = useState<EmberToolTrace[]>([]);

  const sendMessage = async (message: string): Promise<void> => {
    const content = message.trim();
    if (!content || isSending) return;

    setIsSending(true);
    setStatus('analyzing');
    setError(null);
    setToolTrace([]);

    try {
      const response = await fetch(
        `/api/ember/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content, studioContext })
        }
      );
      const data = await response.json().catch(() => null) as EmberResponse | { error?: { code?: string } } | null;
      if (!response.ok || !data || !('message' in data)) {
        throw new Error(responseErrorMessage(response, data));
      }

      setMessages(previous => [
        ...previous,
        { id: `ember-user-${Date.now()}`, role: 'user', content },
        data.message
      ]);
      setToolTrace(Array.isArray(data.toolTrace) ? data.toolTrace : []);
      setStatus('online');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Ember non e disponibile in questo momento.');
      setStatus('online');
    } finally {
      setIsSending(false);
    }
  };

  return {
    conversationId,
    messages,
    status,
    isSending,
    error,
    toolTrace,
    sendMessage
  };
}
