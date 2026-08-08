import { EmberConversationMessage } from '../types/ember';

const MAX_MESSAGES = 20;
const MAX_TOTAL_TEXT_LENGTH = 20_000;
const STALE_CONVERSATION_MS = 12 * 60 * 60 * 1000;

interface StoredConversation {
  messages: EmberConversationMessage[];
  lastAccessAt: number;
}

export class EmberConversationStore {
  private static conversations = new Map<string, StoredConversation>();

  public static getMessages(userId: string, conversationId: string): EmberConversationMessage[] {
    this.cleanupStaleConversations();
    const key = this.keyFor(userId, conversationId);
    const conversation = this.conversations.get(key);
    if (!conversation) return [];

    conversation.lastAccessAt = Date.now();
    return conversation.messages.map(message => ({ ...message }));
  }

  public static appendTurn(
    userId: string,
    conversationId: string,
    userMessage: EmberConversationMessage,
    assistantMessage: EmberConversationMessage
  ): void {
    this.cleanupStaleConversations();
    const key = this.keyFor(userId, conversationId);
    const existing = this.conversations.get(key) || { messages: [], lastAccessAt: Date.now() };
    const messages = [...existing.messages, userMessage, assistantMessage];

    while (messages.length > MAX_MESSAGES || this.totalTextLength(messages) > MAX_TOTAL_TEXT_LENGTH) {
      messages.shift();
    }

    this.conversations.set(key, { messages, lastAccessAt: Date.now() });
  }

  private static keyFor(userId: string, conversationId: string): string {
    return `${userId}:${conversationId}`;
  }

  private static totalTextLength(messages: EmberConversationMessage[]): number {
    return messages.reduce((total, message) => total + message.content.length, 0);
  }

  private static cleanupStaleConversations(): void {
    const cutoff = Date.now() - STALE_CONVERSATION_MS;
    for (const [key, conversation] of this.conversations) {
      if (conversation.lastAccessAt < cutoff) this.conversations.delete(key);
    }
  }
}
