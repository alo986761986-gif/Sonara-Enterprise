export interface MusicDNAProfile {
  genre: string;
  subgenres: string[];
  moods: string[];
  energy: number;
  tempoRange: {
    min: number;
    max: number;
  };
  eqPreset: string;
}

export const SONARA_MUSIC_DNA: MusicDNAProfile[] = [
  {
    genre: "Electronic",
    subgenres: [
      "Tech House",
      "Melodic Techno",
      "Synthwave",
      "Ambient"
    ],
    moods: [
      "Dark",
      "Cinematic",
      "Energetic"
    ],
    energy: 8,
    tempoRange: {
      min: 90,
      max: 140
    },
    eqPreset: "Club Master"
  },
  {
    genre: "Hip Hop",
    subgenres: [
      "Trap",
      "Drill",
      "Boom Bap",
      "Lo-Fi"
    ],
    moods: [
      "Aggressive",
      "Chill",
      "Urban"
    ],
    energy: 7,
    tempoRange: {
      min: 70,
      max: 110
    },
    eqPreset: "Bass Focus"
  },
  {
    genre: "Pop",
    subgenres: [
      "Modern Pop",
      "Synth Pop",
      "Indie Pop"
    ],
    moods: [
      "Happy",
      "Emotional",
      "Radio"
    ],
    energy: 7,
    tempoRange: {
      min: 90,
      max: 130
    },
    eqPreset: "Vocal Clarity"
  }
];