import { ApiApplication, ApiKey, Webhook, ApiUsage } from '../../types';

class ApiManagerService {
  private applications: ApiApplication[] = [];
  private keys: ApiKey[] = [];
  private webhooks: Webhook[] = [];
  private usage: ApiUsage[] = [];

  constructor() {
    this.initMockData();
  }

  private initMockData() {
    this.applications.push({ id: 'app_1', name: 'My Sonara App', ownerId: 'user_1', description: 'API Application', createdAt: Date.now(), updatedAt: Date.now() });
    this.keys.push({ id: 'key_1', applicationId: 'app_1', name: 'Primary Key', scopes: ['profile.read', 'songs.read'], createdAt: Date.now(), active: true });
  }

  public getApplications(): ApiApplication[] { return this.applications; }
  public getKeys(): ApiKey[] { return this.keys; }
}

export const ApiManager = new ApiManagerService();
