export type SuggestionGroup = {
  label: string;
  items: string[];
};

export const GLOBAL_MUSIC_SUGGESTIONS: SuggestionGroup[] = [
  {
    label: 'Pop & Contemporary',
    items: [
      'Pop', 'Contemporary Pop', 'Dance Pop', 'Electropop', 'Synthpop', 'Indie Pop', 'Dream Pop', 'Art Pop', 'Chamber Pop',
      'Power Pop', 'Teen Pop', 'Bubblegum Pop', 'Sunshine Pop', 'Sophisti-Pop', 'Hyperpop', 'Bedroom Pop', 'City Pop', 'J-Pop',
      'K-Pop', 'C-Pop', 'Mandopop', 'Cantopop', 'Europop', 'Italo Pop', 'French Pop', 'Latin Pop', 'Arabic Pop', 'Afropop',
      'Neomelodico Napoletano', 'Canzone Napoletana', 'Adult Contemporary', 'Easy Listening', 'Singer-Songwriter'
    ]
  },
  {
    label: 'Electronic & Dance',
    items: [
      'House', 'Deep House', 'Tech House', 'Progressive House', 'Afro House', 'Organic House', 'Soulful House', 'Funky House',
      'Acid House', 'Chicago House', 'French House', 'Electro House', 'Future House', 'Bass House', 'Melodic House', 'Tropical House',
      'Techno', 'Detroit Techno', 'Minimal Techno', 'Dub Techno', 'Industrial Techno', 'Hard Techno', 'Acid Techno', 'Melodic Techno',
      'Trance', 'Progressive Trance', 'Uplifting Trance', 'Psytrance', 'Goa Trance', 'Tech Trance', 'Hard Trance', 'Vocal Trance',
      'Drum & Bass', 'Liquid Drum & Bass', 'Neurofunk', 'Jungle', 'Breakbeat', 'Breaks', 'UK Garage', '2-Step Garage', 'Speed Garage',
      'Dubstep', 'Brostep', 'Future Garage', 'Future Bass', 'Trap EDM', 'Glitch Hop', 'Electro', 'Electroclash', 'EDM', 'Big Room',
      'Hardstyle', 'Rawstyle', 'Hardcore Techno', 'Gabber', 'Frenchcore', 'Happy Hardcore', 'Hands Up', 'Eurodance', 'Italo Dance',
      'Disco', 'Nu-Disco', 'Hi-NRG', 'Boogie', 'Electronica', 'IDM', 'Glitch', 'Downtempo', 'Chillout', 'Trip Hop', 'Lounge',
      'Ambient House', 'Ambient Techno', 'Vaporwave', 'Synthwave', 'Retrowave', 'Darkwave', 'Chillwave', 'Lo-Fi Beats'
    ]
  },
  {
    label: 'Hip-Hop, R&B & Urban',
    items: [
      'Hip-Hop', 'Rap', 'Boom Bap', 'East Coast Hip-Hop', 'West Coast Hip-Hop', 'Southern Hip-Hop', 'G-Funk', 'Gangsta Rap',
      'Conscious Hip-Hop', 'Alternative Hip-Hop', 'Experimental Hip-Hop', 'Jazz Rap', 'Lo-Fi Hip-Hop', 'Trap', 'Drill', 'UK Drill',
      'Brooklyn Drill', 'Chicago Drill', 'Cloud Rap', 'Emo Rap', 'Grime', 'Crunk', 'Phonk', 'Memphis Rap', 'R&B', 'Contemporary R&B',
      'Neo Soul', 'Quiet Storm', 'New Jack Swing', 'Soul', 'Motown', 'Northern Soul', 'Funk', 'P-Funk', 'Go-Go', 'Afroswing',
      'Amapiano', 'Gqom', 'Kwaito', 'Afrobeats', 'Alté'
    ]
  },
  {
    label: 'Rock, Metal & Punk',
    items: [
      'Rock', 'Classic Rock', 'Alternative Rock', 'Indie Rock', 'Garage Rock', 'Hard Rock', 'Soft Rock', 'Arena Rock', 'Art Rock',
      'Progressive Rock', 'Psychedelic Rock', 'Surf Rock', 'Southern Rock', 'Blues Rock', 'Folk Rock', 'Country Rock', 'Glam Rock',
      'Post-Rock', 'Shoegaze', 'Noise Rock', 'Math Rock', 'Grunge', 'Britpop', 'Emo', 'Screamo', 'Post-Hardcore', 'Punk Rock',
      'Pop Punk', 'Hardcore Punk', 'Post-Punk', 'Anarcho-Punk', 'Garage Punk', 'Skate Punk', 'Oi!', 'Metal', 'Heavy Metal',
      'Thrash Metal', 'Death Metal', 'Melodic Death Metal', 'Black Metal', 'Doom Metal', 'Sludge Metal', 'Stoner Metal', 'Power Metal',
      'Symphonic Metal', 'Progressive Metal', 'Folk Metal', 'Nu Metal', 'Metalcore', 'Deathcore', 'Industrial Metal', 'Gothic Metal',
      'Alternative Metal', 'Djent', 'Speed Metal', 'Grindcore'
    ]
  },
  {
    label: 'Jazz, Blues & Related',
    items: [
      'Jazz', 'Traditional Jazz', 'Dixieland', 'Swing', 'Big Band', 'Bebop', 'Hard Bop', 'Cool Jazz', 'Modal Jazz', 'Free Jazz',
      'Avant-Garde Jazz', 'Jazz Fusion', 'Smooth Jazz', 'Latin Jazz', 'Afro-Cuban Jazz', 'Gypsy Jazz', 'Vocal Jazz', 'Nu Jazz',
      'Acid Jazz', 'Blues', 'Delta Blues', 'Chicago Blues', 'Texas Blues', 'Piedmont Blues', 'Electric Blues', 'Jump Blues',
      'Rhythm & Blues', 'Gospel Blues', 'Soul Jazz', 'Funk Jazz'
    ]
  },
  {
    label: 'Classical & Art Music',
    items: [
      'Medieval Music', 'Gregorian Chant', 'Renaissance Music', 'Baroque', 'Classical Period', 'Viennese Classicism', 'Romantic',
      'Late Romantic', 'Impressionism', 'Expressionism', 'Modern Classical', 'Contemporary Classical', 'Neoclassical', 'Minimalism',
      'Post-Minimalism', 'Serialism', 'Twelve-Tone', 'Aleatoric Music', 'Spectral Music', 'Electroacoustic', 'Musique Concrète',
      'Opera', 'Operetta', 'Oratorio', 'Cantata', 'Mass', 'Requiem', 'Symphony', 'Concerto', 'Chamber Music', 'String Quartet',
      'Piano Sonata', 'Art Song', 'Lieder', 'Choral Music', 'Ballet Music', 'March', 'Waltz', 'Polka'
    ]
  },
  {
    label: 'Latin America & Caribbean',
    items: [
      'Salsa', 'Salsa Dura', 'Timba', 'Son Cubano', 'Mambo', 'Cha-Cha-Chá', 'Rumba Cubana', 'Bolero', 'Guaracha', 'Danzón',
      'Merengue', 'Bachata', 'Reggaeton', 'Dembow', 'Latin Trap', 'Cumbia', 'Cumbia Colombiana', 'Cumbia Sonidera', 'Cumbia Villera',
      'Vallenato', 'Champeta', 'Samba', 'Bossa Nova', 'MPB', 'Forró', 'Baião', 'Axé', 'Pagode', 'Sertanejo', 'Choro', 'Tropicália',
      'Funk Carioca', 'Tango', 'Milonga', 'Chamamé', 'Nueva Canción', 'Cueca', 'Huayno', 'Marinera', 'Joropo', 'Bambuco',
      'Reggae', 'Roots Reggae', 'Dub', 'Dancehall', 'Ska', 'Rocksteady', 'Calypso', 'Soca', 'Zouk', 'Kompa', 'Reggae en Español'
    ]
  },
  {
    label: 'Africa',
    items: [
      'Highlife', 'Palm-Wine Music', 'Afrobeat', 'Afrobeats', 'Jùjú', 'Fuji', 'Apala', 'Gospel Highlife', 'Amapiano', 'Gqom',
      'Kwaito', 'Maskandi', 'Mbaqanga', 'Marabi', 'Kwela', 'Township Jazz', 'Soukous', 'Congo Rumba', 'Ndombolo', 'Makossa',
      'Bikutsi', 'Mbalax', 'Gnawa', 'Raï', 'Chaabi', 'Taarab', 'Bongo Flava', 'Ethio-Jazz', 'Tizita', 'Azmari', 'Desert Blues',
      'Tuareg Music', 'Manding Music', 'Griot Music', 'Wassoulou', 'Morna', 'Funana', 'Sega', 'Maloya', 'Kizomba', 'Kuduro'
    ]
  },
  {
    label: 'Middle East, North Africa & Central Asia',
    items: [
      'Arabic Classical Music', 'Tarab', 'Maqam Music', 'Andalusian Classical Music', 'Muwashshah', 'Dabke', 'Khaliji', 'Shaabi',
      'Mahraganat', 'Raï', 'Gnawa', 'Persian Classical Music', 'Radif', 'Persian Pop', 'Kurdish Folk', 'Turkish Classical Music',
      'Turkish Folk', 'Arabesque', 'Anatolian Rock', 'Azerbaijani Mugham', 'Armenian Folk', 'Georgian Polyphony', 'Kazakh Folk',
      'Uzbek Shashmaqam', 'Tajik Shashmaqam', 'Kyrgyz Folk', 'Turkmen Folk', 'Mongolian Long Song', 'Tuvan Throat Singing'
    ]
  },
  {
    label: 'South Asia',
    items: [
      'Hindustani Classical', 'Carnatic Classical', 'Dhrupad', 'Khayal', 'Thumri', 'Ghazal', 'Qawwali', 'Bhajan', 'Kirtan',
      'Bollywood', 'Filmi', 'Bhangra', 'Punjabi Folk', 'Baul', 'Rabindra Sangeet', 'Nazrul Geeti', 'Lavani', 'Marathi Folk',
      'Gujarati Garba', 'Rajasthani Folk', 'Bhojpuri Folk', 'Assamese Folk', 'Kashmiri Folk', 'Sufi Rock', 'Indian Pop', 'Desi Hip-Hop',
      'Sri Lankan Baila', 'Nepali Folk', 'Pakistani Pop'
    ]
  },
  {
    label: 'East Asia',
    items: [
      'Gagaku', 'Shōmyō', 'Minyō', 'Enka', 'Kayōkyoku', 'J-Pop', 'J-Rock', 'Visual Kei', 'Shibuya-kei', 'City Pop',
      'Korean Court Music', 'Gugak', 'Pansori', 'Samulnori', 'Trot', 'K-Pop', 'K-R&B', 'K-Hip-Hop', 'Chinese Classical Music',
      'Guoyue', 'Jiangnan Sizhu', 'Peking Opera', 'Kunqu', 'Mandopop', 'Cantopop', 'Taiwanese Pop', 'Hakka Music',
      'Mongolian Folk', 'Morin Khuur Music'
    ]
  },
  {
    label: 'Southeast Asia & Oceania',
    items: [
      'Gamelan', 'Keroncong', 'Dangdut', 'Campursari', 'Sundanese Music', 'Kulintang', 'Rondalla', 'OPM', 'Manila Sound',
      'Thai Classical Music', 'Luk Thung', 'Mor Lam', 'Khmer Classical Music', 'Pinpeat', 'Vietnamese Ca Trù', 'Nhã Nhạc',
      'Vietnamese Pop', 'Burmese Classical Music', 'Malay Gamelan', 'Dikir Barat', 'Hawaiian Music', 'Slack-Key Guitar', 'Hula Music',
      'Māori Waiata', 'Pacific Island Music', 'Aboriginal Australian Music', 'Didgeridoo Drone', 'Australian Bush Music'
    ]
  },
  {
    label: 'European Folk & Traditional',
    items: [
      'Irish Traditional', 'Scottish Traditional', 'Celtic', 'English Folk', 'Welsh Folk', 'Breton Music', 'Galician Folk', 'Fado',
      'Flamenco', 'Sevillanas', 'Basque Folk', 'Musette', 'Chanson Française', 'Italian Folk', 'Tarantella', 'Pizzica', 'Tammurriata',
      'Canzone Napoletana', 'Neomelodico Napoletano', 'Alpine Folk', 'Schlager', 'Klezmer', 'Balkan Brass', 'Romani Music',
      'Rebetiko', 'Greek Folk', 'Sevdalinka', 'Turbo-Folk', 'Romanian Lăutărească', 'Hungarian Folk', 'Polish Folk', 'Mazurka',
      'Polonaise', 'Czech Folk', 'Slovak Folk', 'Russian Folk', 'Ukrainian Folk', 'Nordic Folk', 'Swedish Polska', 'Finnish Folk',
      'Joik', 'Icelandic Folk'
    ]
  },
  {
    label: 'Country, Folk & Roots',
    items: [
      'Country', 'Traditional Country', 'Honky-Tonk', 'Outlaw Country', 'Nashville Sound', 'Country Pop', 'Americana', 'Bluegrass',
      'Old-Time', 'Appalachian Folk', 'Western Swing', 'Cajun', 'Zydeco', 'Tejano', 'Norteño', 'Ranchera', 'Mariachi', 'Corridos',
      'Folk', 'Contemporary Folk', 'Indie Folk', 'Folk Pop', 'Folk Punk', 'Roots Rock', 'Gospel', 'Southern Gospel', 'Spirituals'
    ]
  },
  {
    label: 'Ambient, Experimental & Cinematic',
    items: [
      'Ambient', 'Dark Ambient', 'Drone', 'Space Ambient', 'New Age', 'Meditation Music', 'Nature Soundscape', 'Experimental',
      'Avant-Garde', 'Noise', 'Harsh Noise', 'Industrial', 'EBM', 'Power Electronics', 'Electroacoustic', 'Musique Concrète',
      'Sound Art', 'Field Recording', 'Minimalism', 'Lowercase', 'Microsound', 'Glitch', 'Cinematic', 'Film Score', 'TV Score',
      'Video Game Music', 'Trailer Music', 'Epic Orchestral', 'Hybrid Orchestral', 'Horror Score', 'Sci-Fi Score', 'Fantasy Score',
      'Documentary Score', 'Musical Theatre', 'Cabaret', 'Vaudeville'
    ]
  }
];

export const GLOBAL_INSTRUMENT_SUGGESTIONS: SuggestionGroup[] = [
  {
    label: 'Strings & Guitars',
    items: [
      'Violin', 'Viola', 'Cello', 'Double Bass', 'Harp', 'Classical Guitar', 'Acoustic Guitar', 'Steel-String Guitar', '12-String Guitar',
      'Electric Guitar', 'Baritone Guitar', 'Bass Guitar', 'Fretless Bass', 'Upright Bass', 'Mandolin', 'Mandola', 'Mandocello', 'Banjo',
      'Ukulele', 'Lap Steel Guitar', 'Pedal Steel Guitar', 'Resonator Guitar', 'Dobro', 'Lute', 'Theorbo', 'Archlute', 'Mandore',
      'Vihuela', 'Cittern', 'Zither', 'Autoharp', 'Hammered Dulcimer', 'Mountain Dulcimer'
    ]
  },
  {
    label: 'Keyboards & Free Reeds',
    items: [
      'Grand Piano', 'Upright Piano', 'Prepared Piano', 'Electric Piano', 'Rhodes', 'Wurlitzer Electric Piano', 'Clavinet', 'Harpsichord',
      'Clavichord', 'Celesta', 'Pipe Organ', 'Hammond Organ', 'Reed Organ', 'Positive Organ', 'Accordion', 'Piano Accordion',
      'Button Accordion', 'Bandoneon', 'Concertina', 'Harmonium', 'Melodica', 'Toy Piano', 'Ondes Martenot', 'Mellotron'
    ]
  },
  {
    label: 'Woodwinds',
    items: [
      'Piccolo', 'Flute', 'Alto Flute', 'Bass Flute', 'Recorder', 'Soprano Recorder', 'Alto Recorder', 'Bass Recorder', 'Oboe',
      'English Horn', 'Oboe d’amore', 'Bassoon', 'Contrabassoon', 'Clarinet', 'Bass Clarinet', 'Contrabass Clarinet', 'Soprano Saxophone',
      'Alto Saxophone', 'Tenor Saxophone', 'Baritone Saxophone', 'Bass Saxophone', 'Tin Whistle', 'Low Whistle', 'Pan Flute', 'Ocarina'
    ]
  },
  {
    label: 'Brass',
    items: [
      'Trumpet', 'Piccolo Trumpet', 'Cornet', 'Flugelhorn', 'French Horn', 'Trombone', 'Bass Trombone', 'Euphonium', 'Baritone Horn',
      'Tuba', 'Sousaphone', 'Bugle', 'Sackbut', 'Alphorn', 'Natural Horn', 'Serpent', 'Ophicleide'
    ]
  },
  {
    label: 'Orchestral & Marching Percussion',
    items: [
      'Timpani', 'Snare Drum', 'Bass Drum', 'Concert Bass Drum', 'Tom-Toms', 'Cymbals', 'Suspended Cymbal', 'Gong', 'Tam-Tam',
      'Triangle', 'Tambourine', 'Castanets', 'Woodblock', 'Temple Blocks', 'Claves', 'Maracas', 'Shaker', 'Cabasa', 'Guiro', 'Ratchet',
      'Tubular Bells', 'Glockenspiel', 'Xylophone', 'Marimba', 'Vibraphone', 'Crotales', 'Chimes', 'Bell Tree', 'Flexatone'
    ]
  },
  {
    label: 'Drums & Contemporary Percussion',
    items: [
      'Acoustic Drum Kit', 'Jazz Drum Kit', 'Rock Drum Kit', 'Electronic Drum Kit', 'Kick Drum', 'Snare', 'Hi-Hat', 'Ride Cymbal',
      'Crash Cymbal', 'China Cymbal', 'Floor Tom', 'Rack Tom', 'Rototom', 'Octobans', 'Cowbell', 'Agogô Bells', 'Bongos', 'Congas',
      'Timbales', 'Cajón', 'Djembe', 'Darbuka', 'Doumbek', 'Frame Drum', 'Bodhrán', 'Talking Drum', 'Udu', 'Shekere', 'Berimbau'
    ]
  },
  {
    label: 'Electronic & Studio',
    items: [
      'Analog Synthesizer', 'Digital Synthesizer', 'Modular Synthesizer', 'FM Synthesizer', 'Wavetable Synthesizer', 'Granular Synthesizer',
      'Virtual Analog Synth', 'Monosynth', 'Polysynth', 'Supersaw Synth', 'Synth Bass', 'Sub Bass', '808 Bass', '303 Acid Bass',
      'Synth Pad', 'Synth Lead', 'Synth Pluck', 'Arpeggiator', 'Sampler', 'Drum Machine', 'TR-808', 'TR-909', 'TR-606', 'MPC',
      'Groovebox', 'Turntables', 'Theremin', 'Vocoder', 'Talk Box', 'Tape Loops', 'Field Recorder'
    ]
  },
  {
    label: 'Indian Subcontinent',
    items: [
      'Sitar', 'Sarod', 'Surbahar', 'Rudra Veena', 'Saraswati Veena', 'Vichitra Veena', 'Sarangi', 'Dilruba', 'Esraj', 'Santoor',
      'Tanpura', 'Tabla', 'Pakhawaj', 'Mridangam', 'Ghatam', 'Kanjira', 'Dhol', 'Dholak', 'Tumbi', 'Ektara', 'Shehnai', 'Bansuri',
      'Nadaswaram', 'Harmonium', 'Morsing'
    ]
  },
  {
    label: 'East Asian Instruments',
    items: [
      'Shamisen', 'Koto', 'Biwa', 'Shakuhachi', 'Shinobue', 'Hichiriki', 'Shō', 'Taiko', 'Tsuzumi', 'Sanshin', 'Erhu', 'Gaohu',
      'Zhonghu', 'Pipa', 'Ruan', 'Yueqin', 'Guzheng', 'Guqin', 'Yangqin', 'Dizi', 'Xiao', 'Suona', 'Sheng', 'Bianzhong', 'Gong',
      'Gayageum', 'Geomungo', 'Haegeum', 'Daegeum', 'Piri', 'Janggu', 'Buk', 'Kkwaenggwari', 'Morin Khuur', 'Yatga'
    ]
  },
  {
    label: 'Southeast Asian Instruments',
    items: [
      'Gamelan Gong', 'Bonang', 'Gender', 'Saron', 'Kendang', 'Rebab Jawa', 'Suling', 'Angklung', 'Kulintang', 'Agung', 'Gangsa',
      'Kudyapi', 'Rondalla Bandurria', 'Khene', 'Ranad Ek', 'Khong Wong Yai', 'Saw Duang', 'Saw U', 'Pi Nai', 'Tro Khmer', 'Roneat Ek',
      'Đàn Bầu', 'Đàn Tranh', 'Đàn Nguyệt', 'Đàn Tỳ Bà', 'Sáo Trúc', 'Saung Gauk'
    ]
  },
  {
    label: 'Middle Eastern & Central Asian Instruments',
    items: [
      'Oud', 'Qanun', 'Ney', 'Riq', 'Darbuka', 'Daf', 'Bendir', 'Mizmar', 'Kamancheh', 'Santur', 'Setar', 'Tar', 'Tombak',
      'Saz', 'Bağlama', 'Cura', 'Kabak Kemane', 'Zurna', 'Duduk', 'Kaval', 'Buzuq', 'Rubab', 'Dutar', 'Tanbur', 'Doira', 'Sato',
      'Komuz', 'Dombra', 'Qobyz', 'Rawap', 'Ghijak'
    ]
  },
  {
    label: 'African Instruments',
    items: [
      'Kora', 'Ngoni', 'Balafon', 'Mbira', 'Kalimba', 'Djembe', 'Dunun', 'Talking Drum', 'Udu', 'Shekere', 'Agogô', 'Berimbau',
      'Akonting', 'Krar', 'Masenqo', 'Begena', 'Inanga', 'Valiha', 'Marovany', 'Endongo', 'Adungu', 'Nyatiti', 'Orutu', 'Uhadi',
      'Umrhubhe', 'Algaita', 'Kakaki', 'Goje', 'Bolon', 'Ekwe', 'Log Drum'
    ]
  },
  {
    label: 'Latin American & Caribbean Instruments',
    items: [
      'Tres Cubano', 'Cuatro', 'Charango', 'Ronroco', 'Tiple', 'Requinto Guitar', 'Vihuela Mexicana', 'Guitarrón Mexicano',
      'Bandola', 'Arpa Llanera', 'Panpipes', 'Siku', 'Quena', 'Bombo Legüero', 'Cajón Peruano', 'Claves', 'Maracas', 'Guiro',
      'Bongos', 'Congas', 'Timbales', 'Batá Drums', 'Steelpan', 'Marímbula', 'Güira', 'Tambora Dominicana', 'Surdo', 'Pandeiro',
      'Cuíca', 'Reco-Reco', 'Cavaquinho', 'Berimbau', 'Atabaque'
    ]
  },
  {
    label: 'European Folk & Historical Instruments',
    items: [
      'Bagpipes', 'Great Highland Bagpipe', 'Uilleann Pipes', 'Northumbrian Smallpipes', 'Musette de Cour', 'Hurdy-Gurdy', 'Nyckelharpa',
      'Hardanger Fiddle', 'Bouzouki', 'Irish Bouzouki', 'Balalaika', 'Domra', 'Gusli', 'Kantele', 'Kanklės', 'Kokle', 'Cimbalom',
      'Tamburica', 'Gaida', 'Gadulka', 'Kaval', 'Zampogna', 'Launeddas', 'Organetto', 'Mandolin', 'Portuguese Guitar', 'Bandura',
      'Torupill', 'Talharpa', 'Renaissance Lute', 'Baroque Lute', 'Viola da Gamba', 'Viola d’amore', 'Crummhorn', 'Shawm', 'Cornett',
      'Rackett', 'Dulcian'
    ]
  },
  {
    label: 'Voice & Vocal Techniques',
    items: [
      'Male Lead Vocal', 'Female Lead Vocal', 'Duet Vocals', 'Mixed Choir', 'Male Choir', 'Female Choir', 'Children’s Choir', 'Gospel Choir',
      'Operatic Soprano', 'Mezzo-Soprano', 'Contralto', 'Countertenor', 'Tenor', 'Baritone', 'Bass Voice', 'Falsetto', 'Head Voice',
      'Belting', 'Whisper Vocal', 'Spoken Word', 'Rap Vocal', 'Beatboxing', 'Scat Singing', 'Yodeling', 'Overtone Singing',
      'Tuvan Throat Singing', 'Gregorian Chant', 'Pansori Vocal', 'Qawwali Vocals', 'Flamenco Cante', 'Ululation'
    ]
  }
];

export function flattenSuggestions(groups: SuggestionGroup[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export const ALL_GLOBAL_MUSIC_SUGGESTIONS = flattenSuggestions(GLOBAL_MUSIC_SUGGESTIONS);
export const ALL_GLOBAL_INSTRUMENT_SUGGESTIONS = flattenSuggestions(GLOBAL_INSTRUMENT_SUGGESTIONS);
