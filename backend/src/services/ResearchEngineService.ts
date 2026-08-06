export class ResearchEngineService {
  static queryTrends(topic: string) {
    return { topic, trends: ['synthwave', 'retrowave', 'cyberpunk'] };
  }
}
