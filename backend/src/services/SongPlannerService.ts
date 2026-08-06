export class SongPlannerService {
  static planSong(prompt: string) {
    return { sections: ['Intro', 'Verse', 'Chorus', 'Outro'], duration: 180 };
  }
}
