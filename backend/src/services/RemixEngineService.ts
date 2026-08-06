export class RemixEngineService {
  static remix(trackId: string, parameters: any) {
    return { remixTrackId: `remix-${Date.now()}`, parameters };
  }
}
