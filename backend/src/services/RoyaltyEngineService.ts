export class RoyaltyEngineService {
  static createSplit(data: any) {
    return { id: `split-${Date.now()}`, ...data };
  }
  static calculateSplits(trackId: string) {
    return { splits: [{ user: 'Creator', percent: 100 }] };
  }
}
