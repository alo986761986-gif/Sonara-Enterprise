export class PlaylistService {
  static createPlaylist(name: string) {
    return { playlistId: `pl-${Date.now()}`, name, tracks: [] };
  }
}
