/**
 * SONARA PHOENIX AUDIT MANAGER
 * Enterprise-grade activity tracking and compliance logging.
 */

export interface AuditEntry {
  id: string;
  userId: string;
  workspaceId: string;
  action: string;
  resourceId?: string;
  timestamp: number;
  metadata?: any;
}

class AuditManager {
  private logs: AuditEntry[] = [];

  public log(action: string, resourceId?: string, metadata?: any) {
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      userId: 'current-user', // Mock
      workspaceId: 'current-workspace', // Mock
      action,
      resourceId,
      timestamp: Date.now(),
      metadata
    };

    this.logs.unshift(entry);
    console.log(`[Audit] ${action}`, entry);
    
    // In enterprise, this would sync to a secure audit database
    this.persist();
  }

  private persist() {
    localStorage.setItem('sonara_audit_logs', JSON.stringify(this.logs.slice(0, 100)));
  }

  public getRecentLogs() {
    return this.logs;
  }
}

export const auditManager = new AuditManager();
