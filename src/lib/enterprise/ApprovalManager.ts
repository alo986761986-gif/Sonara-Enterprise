/**
 * SONARA PHOENIX APPROVAL MANAGER
 * Handles multi-stage creative approval workflows.
 */

export type ApprovalStatus = 'draft' | 'pending_review' | 'revision_requested' | 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  title: string;
  type: 'song' | 'artwork' | 'publishing' | 'budget';
  status: ApprovalStatus;
  requester: string;
  approvers: string[];
  createdAt: number;
  updatedAt: number;
}

class ApprovalManager {
  private requests: ApprovalRequest[] = [
    {
      id: 'req-1',
      title: 'Midnight Echoes - Final Mix',
      type: 'song',
      status: 'pending_review',
      requester: 'Julian Thorne',
      approvers: ['Creative Director'],
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000
    }
  ];

  public getRequests() {
    return [...this.requests];
  }

  public async submitRequest(request: Omit<ApprovalRequest, 'id' | 'status' | 'updatedAt'>) {
    const newRequest: ApprovalRequest = {
      ...request,
      id: crypto.randomUUID(),
      status: 'pending_review',
      updatedAt: Date.now()
    };
    this.requests.unshift(newRequest);
    return newRequest;
  }

  public async updateStatus(id: string, status: ApprovalStatus) {
    this.requests = this.requests.map(r => 
      r.id === id ? { ...r, status, updatedAt: Date.now() } : r
    );
  }
}

export const approvalManager = new ApprovalManager();
