export interface GenreFamilyDefinition {
  id: string;
  name: string;
  defaultBpm: number;
  bpmRange: [number, number];
  defaultTimeSignature: string;
  keySignature: string;
  acousticKeywords: string[];
  aliases: string[];
  subgenres: string[];
  overrides?: Record<string, { bpm?: number; timeSignature?: string }>;
}

export interface ResolvedGenreSelection {
  requestedGenre: string;
  matchedGenre: string | null;
  familyId: string;
  familyName: string;
  recommendedBpm: number;
  bpmRange: [number, number];
  timeSignature: string;
  keySignature: string;
  acousticKeywords: string[];
  isCatalogEntry: boolean;
}

export const GENRE_FAMILIES: GenreFamilyDefinition[] = [
  {
    id: 'house', name: 'House', defaultBpm: 124, bpmRange: [115, 132], defaultTimeSignature: '4/4', keySignature: 'A Minor',
    acousticKeywords: ['four-on-the-floor kick', 'syncopated bassline', 'offbeat open hats', 'club-focused groove'],
    aliases: ['house music'],
    subgenres: ['House', 'Deep House', 'Tech House', 'Afro House', 'Melodic House', 'Progressive House', 'Organic House', 'Acid House', 'Chicago House', 'Soulful House', 'Funky House', 'Electro House', 'Future House', 'Bass House', 'Tropical House', 'Latin House', 'Minimal House', 'Microhouse', 'Tribal House', 'Garage House', 'Piano House', 'French House', 'Jackin House', 'Hard House']
  },
  {
    id: 'techno', name: 'Techno', defaultBpm: 132, bpmRange: [120, 155], defaultTimeSignature: '4/4', keySignature: 'F# Minor',
    acousticKeywords: ['driving repetitive pulse', 'machine percussion', 'hypnotic synthesis', 'controlled low-frequency rumble'],
    aliases: ['techno music'],
    subgenres: ['Techno', 'Detroit Techno', 'Minimal Techno', 'Dub Techno', 'Acid Techno', 'Industrial Techno', 'Peak Time Techno', 'Hypnotic Techno', 'Hardgroove', 'Schranz', 'Melodic Techno', 'Ambient Techno', 'Electro Techno', 'Ghettotech']
  },
  {
    id: 'trance', name: 'Trance', defaultBpm: 136, bpmRange: [125, 150], defaultTimeSignature: '4/4', keySignature: 'G Minor',
    acousticKeywords: ['rolling bass sequence', 'euphoric harmonic movement', 'long tension builds', 'wide sustained synth layers'],
    aliases: [],
    subgenres: ['Trance', 'Uplifting Trance', 'Progressive Trance', 'Psytrance', 'Goa Trance', 'Tech Trance', 'Vocal Trance', 'Hard Trance', 'Acid Trance', 'Balearic Trance', 'Dream Trance']
  },
  {
    id: 'bass_breaks', name: 'Bass & Breaks', defaultBpm: 140, bpmRange: [70, 180], defaultTimeSignature: '4/4', keySignature: 'F Minor',
    acousticKeywords: ['syncopated breakbeats', 'sub-heavy bass design', 'sharp transient drums', 'rhythmic edits'],
    aliases: ['bass music', 'breaks'],
    subgenres: ['Drum & Bass', 'Liquid Drum & Bass', 'Neurofunk', 'Jungle', 'Jump Up', 'Dancefloor Drum & Bass', 'Breakbeat', 'Big Beat', 'UK Breaks', 'Dubstep', 'Brostep', 'Riddim', 'Future Bass', 'EDM Trap', 'Bass Music', 'Glitch Hop', 'Leftfield Bass', 'Breakcore'],
    overrides: { 'Drum & Bass': { bpm: 174 }, 'Liquid Drum & Bass': { bpm: 174 }, Neurofunk: { bpm: 174 }, Jungle: { bpm: 170 }, Dubstep: { bpm: 140 }, Riddim: { bpm: 140 } }
  },
  {
    id: 'garage', name: 'UK Garage', defaultBpm: 132, bpmRange: [125, 142], defaultTimeSignature: '4/4', keySignature: 'D Minor',
    acousticKeywords: ['shuffled two-step drums', 'syncopated sub bass', 'chopped vocal texture', 'swinging percussion'],
    aliases: ['garage', 'ukg'],
    subgenres: ['UK Garage', '2-Step Garage', 'Speed Garage', 'Bassline', 'Grime', 'Future Garage', 'UK Funky', 'Breakstep']
  },
  {
    id: 'hard_dance', name: 'Hard Dance', defaultBpm: 155, bpmRange: [140, 220], defaultTimeSignature: '4/4', keySignature: 'F Minor',
    acousticKeywords: ['distorted high-energy kick', 'fast rave percussion', 'aggressive synth stabs', 'large tension releases'],
    aliases: ['hardcore dance'],
    subgenres: ['Hardcore', 'Gabber', 'Hardstyle', 'Rawstyle', 'Happy Hardcore', 'Frenchcore', 'Uptempo Hardcore', 'Speedcore', 'Makina']
  },
  {
    id: 'electronic', name: 'Electronic', defaultBpm: 120, bpmRange: [60, 160], defaultTimeSignature: '4/4', keySignature: 'D Minor',
    acousticKeywords: ['electronic sound design', 'layered synthesis', 'precise spatial production', 'genre-authentic programmed rhythm'],
    aliases: ['electronica', 'electronic music'],
    subgenres: ['Electronic', 'Electronica', 'IDM', 'Ambient', 'Downtempo', 'Chillout', 'Trip Hop', 'Synthwave', 'Vaporwave', 'Chillwave', 'Retrowave', 'Electro', 'EBM', 'Industrial', 'Noise', 'Glitch', 'Experimental Electronic', 'New Age', 'Drone']
  },
  {
    id: 'pop', name: 'Pop', defaultBpm: 116, bpmRange: [75, 140], defaultTimeSignature: '4/4', keySignature: 'C Major',
    acousticKeywords: ['immediate melodic hook', 'clear verse-chorus form', 'polished vocal space', 'radio-ready rhythm section'],
    aliases: ['popular music'],
    subgenres: ['Pop', 'Dance Pop', 'Electropop', 'Synthpop', 'Indie Pop', 'Dream Pop', 'Art Pop', 'Hyperpop', 'K-Pop', 'J-Pop', 'Latin Pop', 'Teen Pop', 'Power Pop', 'Pop Rock', 'Pop EDM']
  },
  {
    id: 'hip_hop', name: 'Hip Hop', defaultBpm: 92, bpmRange: [60, 160], defaultTimeSignature: '4/4', keySignature: 'C Minor',
    acousticKeywords: ['sample-aware drum pocket', 'strong kick and snare relationship', 'supportive sub bass', 'space for rhythmic vocal phrasing'],
    aliases: ['hip-hop', 'rap music'],
    subgenres: ['Hip Hop', 'Boom Bap', 'Trap', 'Drill', 'UK Drill', 'Cloud Rap', 'Lo-fi Hip Hop', 'Jazz Rap', 'Conscious Hip Hop', 'Gangsta Rap', 'G-Funk', 'Crunk', 'Phonk', 'Memphis Rap', 'Alternative Hip Hop', 'Afro Trap']
  },
  {
    id: 'rnb_soul_funk', name: 'R&B, Soul & Funk', defaultBpm: 98, bpmRange: [60, 130], defaultTimeSignature: '4/4', keySignature: 'Eb Major',
    acousticKeywords: ['expressive harmonic voicings', 'deep pocket rhythm section', 'melodic bass movement', 'warm human dynamics'],
    aliases: ['r&b', 'rhythm and blues'],
    subgenres: ['R&B', 'Contemporary R&B', 'Alternative R&B', 'Neo Soul', 'Soul', 'Motown', 'Funk', 'P-Funk', 'Disco', 'Nu Disco', 'Boogie', 'Quiet Storm', 'Gospel', 'New Jack Swing']
  },
  {
    id: 'rock', name: 'Rock', defaultBpm: 120, bpmRange: [70, 180], defaultTimeSignature: '4/4', keySignature: 'E Minor',
    acousticKeywords: ['live drum kit articulation', 'electric guitar interplay', 'human bass performance', 'dynamic band arrangement'],
    aliases: ['rock music'],
    subgenres: ['Rock', 'Rock and Roll', 'Classic Rock', 'Alternative Rock', 'Indie Rock', 'Psychedelic Rock', 'Progressive Rock', 'Hard Rock', 'Garage Rock', 'Surf Rock', 'Glam Rock', 'Southern Rock', 'Post-Rock', 'Shoegaze', 'Grunge', 'Britpop']
  },
  {
    id: 'metal', name: 'Metal', defaultBpm: 135, bpmRange: [60, 220], defaultTimeSignature: '4/4', keySignature: 'E Minor',
    acousticKeywords: ['heavy guitar articulation', 'powerful acoustic drum transients', 'tight low-register riffing', 'controlled aggressive dynamics'],
    aliases: ['heavy metal'],
    subgenres: ['Heavy Metal', 'Thrash Metal', 'Death Metal', 'Black Metal', 'Doom Metal', 'Power Metal', 'Progressive Metal', 'Symphonic Metal', 'Metalcore', 'Deathcore', 'Nu Metal', 'Folk Metal', 'Industrial Metal', 'Sludge Metal', 'Stoner Metal', 'Glam Metal']
  },
  {
    id: 'punk', name: 'Punk', defaultBpm: 165, bpmRange: [110, 220], defaultTimeSignature: '4/4', keySignature: 'A Minor',
    acousticKeywords: ['urgent live drums', 'direct distorted guitars', 'raw ensemble energy', 'concise song form'],
    aliases: ['punk music'],
    subgenres: ['Punk Rock', 'Hardcore Punk', 'Pop Punk', 'Post-Punk', 'Ska Punk', 'Emo', 'Screamo', 'Crust Punk', 'Oi!', 'Riot Grrrl', 'Post-Hardcore']
  },
  {
    id: 'jazz_blues', name: 'Jazz & Blues', defaultBpm: 110, bpmRange: [50, 220], defaultTimeSignature: '4/4', keySignature: 'Bb Major',
    acousticKeywords: ['human swing and phrasing', 'extended harmonic language', 'interactive rhythm section', 'natural instrumental dynamics'],
    aliases: ['jazz', 'blues'],
    subgenres: ['Jazz', 'Bebop', 'Cool Jazz', 'Hard Bop', 'Modal Jazz', 'Free Jazz', 'Jazz Fusion', 'Smooth Jazz', 'Swing', 'Big Band', 'Dixieland', 'Latin Jazz', 'Acid Jazz', 'Blues', 'Delta Blues', 'Chicago Blues', 'Electric Blues', 'Rhythm and Blues'],
    overrides: { Waltz: { timeSignature: '3/4' } }
  },
  {
    id: 'classical_cinematic', name: 'Classical & Cinematic', defaultBpm: 100, bpmRange: [40, 180], defaultTimeSignature: '4/4', keySignature: 'D Minor',
    acousticKeywords: ['acoustic orchestral depth', 'developed thematic motion', 'natural concert dynamics', 'detailed instrumental voicing'],
    aliases: ['classical', 'cinematic'],
    subgenres: ['Classical', 'Baroque', 'Romantic', 'Contemporary Classical', 'Minimalism', 'Opera', 'Chamber Music', 'Symphony', 'Orchestral', 'Choral', 'Film Score', 'Soundtrack', 'Trailer Music', 'Epic Music', 'Waltz', 'Viennese Waltz', 'Neoclassical'],
    overrides: { Waltz: { timeSignature: '3/4', bpm: 90 }, 'Viennese Waltz': { timeSignature: '3/4', bpm: 174 } }
  },
  {
    id: 'folk_country', name: 'Folk & Country', defaultBpm: 105, bpmRange: [60, 170], defaultTimeSignature: '4/4', keySignature: 'G Major',
    acousticKeywords: ['natural acoustic instrumentation', 'story-led melodic form', 'human timing', 'organic ensemble balance'],
    aliases: ['folk', 'country'],
    subgenres: ['Folk', 'Indie Folk', 'Contemporary Folk', 'Traditional Folk', 'Celtic Folk', 'Bluegrass', 'Country', 'Americana', 'Country Pop', 'Outlaw Country', 'Alternative Country', 'Western', 'Singer-Songwriter']
  },
  {
    id: 'reggae', name: 'Reggae & Caribbean', defaultBpm: 82, bpmRange: [65, 125], defaultTimeSignature: '4/4', keySignature: 'G Major',
    acousticKeywords: ['offbeat skank rhythm', 'deep rounded bass', 'spacious dub-aware production', 'relaxed pocket'],
    aliases: ['caribbean music'],
    subgenres: ['Reggae', 'Roots Reggae', 'Dub', 'Dancehall', 'Ska', 'Rocksteady', 'Lovers Rock', 'Ragga', 'Calypso', 'Soca']
  },
  {
    id: 'latin', name: 'Latin', defaultBpm: 104, bpmRange: [70, 180], defaultTimeSignature: '4/4', keySignature: 'A Minor',
    acousticKeywords: ['clave-aware percussion', 'interlocking rhythmic instruments', 'expressive melodic phrasing', 'dance-focused low end'],
    aliases: ['latin music'],
    subgenres: ['Reggaeton', 'Dembow', 'Salsa', 'Bachata', 'Merengue', 'Cumbia', 'Bossa Nova', 'Samba', 'Tango', 'Mambo', 'Bolero', 'Rumba', 'Flamenco', 'Mariachi', 'Regional Mexican', 'Latin Jazz', 'Latin Pop']
  },
  {
    id: 'african', name: 'African', defaultBpm: 116, bpmRange: [75, 135], defaultTimeSignature: '4/4', keySignature: 'D Minor',
    acousticKeywords: ['interlocking polyrhythm', 'organic percussion layers', 'call-and-response phrasing', 'deep dance-oriented bass'],
    aliases: ['african music'],
    subgenres: ['Afrobeats', 'Afrobeat', 'Amapiano', 'Highlife', 'Kwaito', 'Gqom', 'Soukous', 'Makossa', 'Coupé-Décalé', 'Gnawa', 'Rai', 'Mbalax', 'Bongo Flava']
  },
  {
    id: 'global', name: 'Global & Traditional', defaultBpm: 110, bpmRange: [40, 200], defaultTimeSignature: '4/4', keySignature: 'D Minor',
    acousticKeywords: ['culture-specific instrumentation', 'authentic regional rhythm', 'traditional melodic language', 'natural ensemble space'],
    aliases: ['world music', 'traditional music'],
    subgenres: ['World Music', 'Middle Eastern', 'Arabic Music', 'Indian Classical', 'Carnatic', 'Bollywood', 'Bhangra', 'Qawwali', 'Japanese Traditional', 'Chinese Traditional', 'Klezmer', 'Balkan Music', 'Polka', 'Fado', 'Celtic Music']
  }
];

export const GENRE_CATALOG_NAMES = Array.from(new Set(
  GENRE_FAMILIES.flatMap(family => [family.name, ...family.aliases, ...family.subgenres])
));

export function normalizeGenreName(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveGenreSelection(value: string): ResolvedGenreSelection {
  const requestedGenre = String(value || '').trim() || 'Custom Genre';
  const normalized = normalizeGenreName(requestedGenre);

  let matchedFamily: GenreFamilyDefinition | null = null;
  let matchedGenre: string | null = null;

  for (const family of GENRE_FAMILIES) {
    const exactCandidate = [family.name, ...family.aliases, ...family.subgenres]
      .find(candidate => normalizeGenreName(candidate) === normalized);
    if (exactCandidate) {
      matchedFamily = family;
      matchedGenre = family.subgenres.find(
        candidate => normalizeGenreName(candidate) === normalized
      ) || exactCandidate;
      break;
    }
  }

  if (!matchedFamily) {
    const candidates = GENRE_FAMILIES.flatMap(family =>
      [family.name, ...family.aliases, ...family.subgenres]
        .filter(candidate => normalizeGenreName(candidate).length >= 3)
        .map(candidate => ({ family, candidate, normalized: normalizeGenreName(candidate) }))
    ).sort((left, right) => right.normalized.length - left.normalized.length);
    const partial = candidates.find(candidate => normalized.includes(candidate.normalized));
    if (partial) {
      matchedFamily = partial.family;
      matchedGenre = partial.candidate;
    }
  }

  if (!matchedFamily) {
    return {
      requestedGenre,
      matchedGenre: null,
      familyId: 'custom',
      familyName: 'Custom / User Defined',
      recommendedBpm: 120,
      bpmRange: [40, 240],
      timeSignature: '4/4',
      keySignature: 'D Minor',
      acousticKeywords: [
        `authentic ${requestedGenre} instrumentation`,
        `genre-correct ${requestedGenre} rhythm`,
        `genre-correct ${requestedGenre} harmony`,
        'preserve the exact user-defined style without substitution'
      ],
      isCatalogEntry: false
    };
  }

  const override = matchedGenre
    ? matchedFamily.overrides?.[matchedGenre]
    : undefined;

  return {
    requestedGenre,
    matchedGenre,
    familyId: matchedFamily.id,
    familyName: matchedFamily.name,
    recommendedBpm: override?.bpm || matchedFamily.defaultBpm,
    bpmRange: matchedFamily.bpmRange,
    timeSignature: override?.timeSignature || matchedFamily.defaultTimeSignature,
    keySignature: matchedFamily.keySignature,
    acousticKeywords: [
      `authentic ${requestedGenre} style`,
      ...matchedFamily.acousticKeywords
    ],
    isCatalogEntry: Boolean(
      matchedGenre && normalizeGenreName(matchedGenre) === normalized
    )
  };
}
