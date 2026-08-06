import { ConversationMemory } from './types';

export class MemoryService {
  private memory: ConversationMemory = { messages: [] };

  addMessage(sender: 'user' | 'producer', text: string) {
    this.memory.messages.push({ sender, text });
  }

  getHistory() {
    return this.memory.messages;
  }
}

export const memoryService = new MemoryService();
