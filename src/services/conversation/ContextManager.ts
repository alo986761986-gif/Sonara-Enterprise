import { ProjectContext } from './types';

export class ContextManager {
  private currentContext: ProjectContext | null = null;

  setContext(context: ProjectContext) {
    this.currentContext = context;
  }

  getContext(): ProjectContext | null {
    return this.currentContext;
  }
}

export const contextManager = new ContextManager();
