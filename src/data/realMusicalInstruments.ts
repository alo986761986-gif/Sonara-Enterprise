export type RealInstrumentGroup = {
  label: string;
  items: string[];
};

export const REAL_INSTRUMENT_SUGGESTIONS: RealInstrumentGroup[] = [
  {
    label: 'Bowed Strings',
    items: [
      'Violin', 'Viola', 'Cello', 'Double Bass', 'Viola d’amore', 'Viola da Gamba', 'Hardanger Fiddle', 'Nyckelharpa'
    ]
  },
  {
    label: 'Guitars, Basses & Fretted Strings',
    items: [
      'Classical Guitar', 'Steel-String Acoustic Guitar', '12-String Guitar', 'Electric Guitar', 'Baritone Guitar',
      'Bass Guitar', 'Fretless Bass Guitar', 'Lap Steel Guitar', 'Pedal Steel Guitar', 'Resonator Guitar', 'Mandolin',
      'Mandola', 'Mandocello', 'Banjo', 'Ukulele', 'Vihuela', 'Portuguese Guitar', 'Bouzouki', 'Irish Bouzouki',
      'Balalaika', 'Domra', 'Tamburica'
    ]
  },
  {
    label: 'Harps, Lutes, Zithers & Dulcimers',
    items: [
      'Concert Harp', 'Lever Harp', 'Lute', 'Renaissance Lute', 'Baroque Lute', 'Theorbo', 'Archlute', 'Cittern',
      'Zither', 'Autoharp', 'Hammered Dulcimer', 'Mountain Dulcimer', 'Kantele', 'Kanklės', 'Kokle', 'Gusli', 'Cimbalom'
    ]
  },
  {
    label: 'Pianos & Electromechanical Keyboards',
    items: [
      'Grand Piano', 'Upright Piano', 'Prepared Piano', 'Electric Piano', 'Rhodes Electric Piano',
      'Wurlitzer Electric Piano', 'Clavinet', 'Harpsichord', 'Clavichord', 'Celesta', 'Toy Piano'
    ]
  },
  {
    label: 'Organs, Accordions & Free Reeds',
    items: [
      'Pipe Organ', 'Hammond Organ', 'Reed Organ', 'Positive Organ', 'Accordion', 'Piano Accordion', 'Button Accordion',
      'Bandoneon', 'Concertina', 'Harmonium', 'Melodica', 'Organetto'
    ]
  },
  {
    label: 'Orchestral Woodwinds',
    items: [
      'Piccolo', 'Flute', 'Alto Flute', 'Bass Flute', 'Soprano Recorder', 'Alto Recorder', 'Tenor Recorder',
      'Bass Recorder', 'Oboe', 'English Horn', 'Oboe d’amore', 'Bassoon', 'Contrabassoon', 'E-flat Clarinet',
      'B-flat Clarinet', 'Bass Clarinet', 'Contrabass Clarinet', 'Soprano Saxophone', 'Alto Saxophone',
      'Tenor Saxophone', 'Baritone Saxophone', 'Bass Saxophone', 'Tin Whistle', 'Low Whistle', 'Pan Flute', 'Ocarina'
    ]
  },
  {
    label: 'Brass',
    items: [
      'Trumpet', 'Piccolo Trumpet', 'Cornet', 'Flugelhorn', 'French Horn', 'Trombone', 'Bass Trombone', 'Euphonium',
      'Baritone Horn', 'Tuba', 'Sousaphone', 'Bugle', 'Natural Horn', 'Sackbut', 'Serpent', 'Ophicleide', 'Alphorn'
    ]
  },
  {
    label: 'Tuned Percussion',
    items: [
      'Timpani', 'Glockenspiel', 'Xylophone', 'Marimba', 'Vibraphone', 'Crotales', 'Tubular Bells', 'Handbells',
      'Steelpan', 'Bell Tree'
    ]
  },
  {
    label: 'Orchestral & Auxiliary Percussion',
    items: [
      'Orchestral Snare Drum', 'Concert Bass Drum', 'Orchestral Tom-Toms', 'Suspended Cymbal', 'Crash Cymbals',
      'Tam-Tam', 'Triangle', 'Tambourine', 'Castanets', 'Woodblock', 'Temple Blocks', 'Claves', 'Maracas', 'Shaker',
      'Cabasa', 'Güiro', 'Ratchet', 'Flexatone'
    ]
  },
  {
    label: 'Drum Kits & Contemporary Drums',
    items: [
      'Acoustic Drum Kit', 'Jazz Drum Kit', 'Rock Drum Kit', 'Electronic Drum Kit', 'Kick Drum', 'Snare Drum', 'Hi-Hat',
      'Ride Cymbal', 'Crash Cymbal', 'China Cymbal', 'Floor Tom', 'Rack Tom', 'Rototom', 'Octobans', 'Cowbell'
    ]
  },
  {
    label: 'Electronic Instruments & Machines',
    items: [
      'Analog Synthesizer', 'Digital Synthesizer', 'Modular Synthesizer', 'FM Synthesizer', 'Wavetable Synthesizer',
      'Granular Synthesizer', 'Monophonic Synthesizer', 'Polyphonic Synthesizer', 'Bass Synthesizer', 'Sampler',
      'Drum Machine', 'TR-808 Drum Machine', 'TR-909 Drum Machine', 'TR-606 Drum Machine', 'MPC Sampler', 'Groovebox',
      'Theremin', 'Ondes Martenot', 'Mellotron', 'Vocoder'
    ]
  },
  {
    label: 'South Asia — Strings',
    items: [
      'Sitar', 'Sarod', 'Surbahar', 'Rudra Veena', 'Saraswati Veena', 'Vichitra Veena', 'Sarangi', 'Dilruba', 'Esraj',
      'Santoor', 'Tanpura', 'Tumbi', 'Ektara'
    ]
  },
  {
    label: 'South Asia — Winds & Percussion',
    items: [
      'Tabla', 'Pakhawaj', 'Mridangam', 'Ghatam', 'Kanjira', 'Dhol', 'Dholak', 'Shehnai', 'Bansuri', 'Nadaswaram',
      'Morsing'
    ]
  },
  {
    label: 'East Asia — Strings',
    items: [
      'Shamisen', 'Koto', 'Biwa', 'Sanshin', 'Erhu', 'Gaohu', 'Zhonghu', 'Pipa', 'Ruan', 'Yueqin', 'Guzheng', 'Guqin',
      'Yangqin', 'Gayageum', 'Geomungo', 'Haegeum', 'Morin Khuur', 'Yatga'
    ]
  },
  {
    label: 'East Asia — Winds & Percussion',
    items: [
      'Shakuhachi', 'Shinobue', 'Hichiriki', 'Shō', 'Taiko', 'Tsuzumi', 'Dizi', 'Xiao', 'Suona', 'Sheng', 'Bianzhong',
      'Daegeum', 'Piri', 'Janggu', 'Buk', 'Kkwaenggwari'
    ]
  },
  {
    label: 'Southeast Asia',
    items: [
      'Bonang', 'Gender Wayang', 'Saron', 'Kendang', 'Javanese Rebab', 'Suling', 'Angklung', 'Kulintang', 'Agung', 'Gangsa',
      'Kudyapi', 'Bandurria', 'Khene', 'Ranad Ek', 'Khong Wong Yai', 'Saw Duang', 'Saw U', 'Pi Nai', 'Tro Khmer',
      'Roneat Ek', 'Đàn Bầu', 'Đàn Tranh', 'Đàn Nguyệt', 'Đàn Tỳ Bà', 'Sáo Trúc', 'Saung Gauk'
    ]
  },
  {
    label: 'Middle East & Central Asia — Strings',
    items: [
      'Oud', 'Qanun', 'Kamancheh', 'Santur', 'Setar', 'Tar', 'Bağlama', 'Cura', 'Kabak Kemane', 'Buzuq', 'Rubab', 'Dutar',
      'Tanbur', 'Sato', 'Komuz', 'Dombra', 'Qobyz', 'Rawap', 'Ghijak', 'Duduk'
    ]
  },
  {
    label: 'Middle East & Central Asia — Winds & Percussion',
    items: [
      'Ney', 'Riq', 'Darbuka', 'Daf', 'Bendir', 'Mizmar', 'Zurna', 'Kaval', 'Tombak', 'Doira'
    ]
  },
  {
    label: 'African Instruments',
    items: [
      'Kora', 'Ngoni', 'Balafon', 'Mbira', 'Kalimba', 'Djembe', 'Dunun', 'Talking Drum', 'Udu', 'Shekere', 'Agogô Bells',
      'Akonting', 'Krar', 'Masenqo', 'Begena', 'Inanga', 'Valiha', 'Marovany', 'Endongo', 'Adungu', 'Nyatiti', 'Orutu',
      'Uhadi', 'Umrhubhe', 'Algaita', 'Kakaki', 'Goje', 'Bolon', 'Ekwe', 'African Log Drum'
    ]
  },
  {
    label: 'Latin America & Caribbean — Strings & Winds',
    items: [
      'Tres Cubano', 'Cuatro Venezolano', 'Charango', 'Ronroco', 'Tiple Colombiano', 'Requinto Guitar', 'Vihuela Mexicana',
      'Guitarrón Mexicano', 'Bandola', 'Arpa Llanera', 'Siku', 'Quena', 'Cavaquinho', 'Marímbula'
    ]
  },
  {
    label: 'Latin America & Caribbean — Percussion',
    items: [
      'Bongos', 'Congas', 'Timbales', 'Batá Drums', 'Cajón Peruano', 'Bombo Legüero', 'Güira', 'Tambora Dominicana',
      'Surdo', 'Pandeiro', 'Cuíca', 'Reco-Reco', 'Berimbau', 'Atabaque'
    ]
  },
  {
    label: 'European Folk & Historical',
    items: [
      'Great Highland Bagpipe', 'Uilleann Pipes', 'Northumbrian Smallpipes', 'Musette de Cour', 'Hurdy-Gurdy', 'Gaida',
      'Gadulka', 'Zampogna', 'Launeddas', 'Bandura', 'Torupill', 'Talharpa', 'Crummhorn', 'Shawm', 'Cornett', 'Rackett',
      'Dulcian'
    ]
  },
  {
    label: 'Oceania & Indigenous Instruments',
    items: [
      'Didgeridoo', 'Pūtātara', 'Pahu Drum', 'ʻUkeke', 'Nose Flute', 'Conch Shell Trumpet', 'Bullroarer'
    ]
  },
  {
    label: 'Human Voice & Choirs',
    items: [
      'Soprano Voice', 'Mezzo-Soprano Voice', 'Contralto Voice', 'Countertenor Voice', 'Tenor Voice', 'Baritone Voice',
      'Bass Voice', 'Mixed Choir', 'Male Choir', 'Female Choir', 'Children’s Choir', 'Gospel Choir'
    ]
  }
];

const INSTRUMENT_ALIASES: Record<string, string[]> = {
  'Double Bass': ['upright bass', 'contrabass', 'string bass'],
  'Steel-String Acoustic Guitar': ['acoustic guitar', 'steel string guitar'],
  'Resonator Guitar': ['dobro', 'resophonic guitar'],
  'French Horn': ['horn', 'orchestral horn'],
  'English Horn': ['cor anglais'],
  'B-flat Clarinet': ['clarinet', 'bb clarinet'],
  'Rhodes Electric Piano': ['rhodes', 'fender rhodes'],
  'Wurlitzer Electric Piano': ['wurlitzer', 'wurli'],
  'TR-808 Drum Machine': ['tr-808', '808 drum machine', 'roland 808'],
  'TR-909 Drum Machine': ['tr-909', '909 drum machine', 'roland 909'],
  'TR-606 Drum Machine': ['tr-606', '606 drum machine'],
  'MPC Sampler': ['mpc', 'akai mpc'],
  'Darbuka': ['doumbek', 'dumbek', 'derbake'],
  'Agogô Bells': ['agogo', 'agogo bells'],
  'Cajón Peruano': ['cajon', 'cajón'],
  'Güiro': ['guiro'],
  'Güira': ['guira'],
  'Cuíca': ['cuica'],
  'Bağlama': ['baglama', 'saz'],
  'Shō': ['sho mouth organ'],
  'Đàn Bầu': ['dan bau'],
  'Đàn Tranh': ['dan tranh'],
  'Đàn Nguyệt': ['dan nguyet'],
  'Đàn Tỳ Bà': ['dan ty ba'],
  'Sáo Trúc': ['sao truc'],
  'Pūtātara': ['putatara'],
  'Children’s Choir': ["children's choir", 'childrens choir']
};

function normalizeInstrumentText(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .toLocaleLowerCase('en-US')
    .trim();
}

export const ALL_REAL_MUSICAL_INSTRUMENTS = REAL_INSTRUMENT_SUGGESTIONS.flatMap(group => group.items);

const GROUP_BY_INSTRUMENT = new Map<string, string>();
for (const group of REAL_INSTRUMENT_SUGGESTIONS) {
  for (const item of group.items) GROUP_BY_INSTRUMENT.set(normalizeInstrumentText(item), group.label);
}

export function getRealInstrumentGroup(instrument: string): string | undefined {
  return GROUP_BY_INSTRUMENT.get(normalizeInstrumentText(instrument));
}

export function matchesRealInstrumentSearch(instrument: string, query: string): boolean {
  const needle = normalizeInstrumentText(query);
  if (!needle) return true;
  const name = normalizeInstrumentText(instrument);
  if (name.includes(needle)) return true;
  const group = normalizeInstrumentText(getRealInstrumentGroup(instrument) || '');
  if (group.includes(needle)) return true;
  return (INSTRUMENT_ALIASES[instrument] || []).some(alias => normalizeInstrumentText(alias).includes(needle));
}

export function extractRealInstrumentsFromText(text: string): string[] {
  const haystack = ` ${normalizeInstrumentText(text)} `;
  const found: string[] = [];
  for (const instrument of ALL_REAL_MUSICAL_INSTRUMENTS) {
    const candidates = [instrument, ...(INSTRUMENT_ALIASES[instrument] || [])]
      .map(normalizeInstrumentText)
      .filter(value => value.length >= 3);
    if (candidates.some(candidate => haystack.includes(` ${candidate} `) || haystack.includes(`, ${candidate},`) || haystack.includes(`, ${candidate} `) || haystack.includes(` ${candidate},`))) {
      found.push(instrument);
    }
  }
  return found;
}
