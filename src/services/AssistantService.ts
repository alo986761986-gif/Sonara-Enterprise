import { AssistantConversation, AssistantMessage, AssistantAction } from '../types';

class AssistantService {
  private conversations: Map<string, AssistantConversation> = new Map();
  private actions: AssistantAction[] = [
    { id: 'explain_song', title: 'Explain Song', description: 'Analyze song structure and lyrics', icon: 'BookOpen', category: 'analysis', enabled: true },
    { id: 'improve_prompt', title: 'Improve Prompt', description: 'Refine your generation prompt', icon: 'Zap', category: 'improvement', enabled: true },
    { id: 'generate_tags', title: 'Generate Tags', description: 'Create relevant tags for your track', icon: 'Tag', category: 'generation', enabled: true },
  ];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.initMockData();
  }

  private initMockData() {
    const convId = 'assist_conv_1';
    this.conversations.set(convId, {
      id: convId,
      title: 'Music Generation Help',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      provider: 'AbstractAssistant',
      messages: [
        { id: 'am_1', role: 'assistant', content: 'Hello! I am your AI Copilot. How can I help you with your project today?', createdAt: Date.now() }
      ]
    });
  }

  public getConversations(): AssistantConversation[] {
    return Array.from(this.conversations.values());
  }

  public getActions(): AssistantAction[] {
    return this.actions;
  }

  public sendMessage(conversationId: string, content: string) {
    const conv = this.conversations.get(conversationId);
    if (conv) {
      conv.messages.push({
        id: `am_${Date.now()}`,
        role: 'user',
        content,
        createdAt: Date.now()
      });
      this.notify();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l());
  }
}

export const AssistantServiceInstance = new AssistantService();
