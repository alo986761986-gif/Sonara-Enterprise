export class ArtistProfileService {
  static createOrUpdateProfile(data: any) {
    return { id: `artist-${Date.now()}`, ...data };
  }
  static getProfile(id: string) {
    return { id, name: 'Sonara Creator', bio: 'AI Music Producer' };
  }
}
