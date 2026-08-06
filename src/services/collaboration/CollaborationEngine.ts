import { collaborationManager } from './CollaborationManager';
import { collaborationStore } from './CollaborationStore';

export class CollaborationEngine {
  constructor() {
    this.init();
  }

  private init() {
    console.log('Collaboration Engine Initialized');
  }

  getProjectMembers() {
    return collaborationStore.getMembers();
  }

  inviteUser(email: string, role: any) {
    collaborationManager.inviteMember(email, role);
  }
}

export const collaborationEngine = new CollaborationEngine();
