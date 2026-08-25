export type MusicGenre = {
  name: string;
  subgenres: string[];
};

export type MusicGenreFamily = {
  family: string;
  genres: MusicGenre[];
};

export const NEAPOLITAN_URBAN_SUBGENRES = [
  'Rap Napoletano',
  'Hip-Hop Napoletano',
  'Trap Napoletano'
] as const;

export const WORLD_MUSIC_GENRES: MusicGenreFamily[] = [
  {
    family: 'Electronic / Dance',
    genres: [
      { name: 'House', subgenres: ['House', 'Classic House', 'Chicago House', 'Deep House', 'Tech House', 'Progressive House', 'Melodic House', 'Afro House', 'Tribal House', 'Soulful House', 'Funky House', 'French House', 'Filter House', 'Disco House', 'Jackin House', 'Acid House', 'Electro House', 'Future House', 'Bass House', 'Big Room House', 'Organic House', 'Latin House', 'Minimal House', 'Microhouse', 'Lo-Fi House', 'G-House', 'Garage House', 'Hard House', 'Piano House'] },
      { name: 'Techno', subgenres: ['Detroit Techno', 'Minimal Techno', 'Dub Techno', 'Acid Techno', 'Industrial Techno', 'Hard Techno', 'Peak Time Techno', 'Hypnotic Techno', 'Melodic Techno', 'Ambient Techno', 'Schranz', 'Birmingham Techno', 'Raw Techno', 'Deep Techno'] },
      { name: 'Trance', subgenres: ['Classic Trance', 'Progressive Trance', 'Uplifting Trance', 'Vocal Trance', 'Psytrance', 'Goa Trance', 'Full-On Psytrance', 'Dark Psytrance', 'Forest Psytrance', 'Tech Trance', 'Hard Trance', 'Dream Trance', 'Balearic Trance'] },
      { name: 'Drum & Bass', subgenres: ['Liquid Drum & Bass', 'Jungle', 'Neurofunk', 'Jump-Up', 'Techstep', 'Darkstep', 'Drumfunk', 'Atmospheric DnB', 'Dancefloor DnB', 'Minimal DnB', 'Ragga Jungle'] },
      { name: 'Dubstep', subgenres: ['UK Dubstep', 'Deep Dubstep', 'Brostep', 'Riddim', 'Melodic Dubstep', 'Future Garage', 'Post-Dubstep', 'Chillstep', 'Deathstep'] },
      { name: 'UK Garage', subgenres: ['2-Step Garage', 'Speed Garage', 'Bassline', 'Future Garage', 'UK Funky', 'Niche', '4x4 Garage'] },
      { name: 'Breakbeat', subgenres: ['Breaks', 'Big Beat', 'Nu Skool Breaks', 'Florida Breaks', 'Electro Breaks', 'Progressive Breaks', 'Broken Beat'] },
      { name: 'Hard Dance', subgenres: ['Hardstyle', 'Rawstyle', 'Euphoric Hardstyle', 'Hardcore', 'Gabber', 'Frenchcore', 'Uptempo Hardcore', 'Happy Hardcore', 'Hard Dance', 'Makina'] },
      { name: 'Electro', subgenres: ['Electro', 'Electro Funk', 'Electroclash', 'Miami Bass', 'Freestyle', 'Nu Electro'] },
      { name: 'Ambient Electronic', subgenres: ['Ambient', 'Dark Ambient', 'Drone', 'Space Ambient', 'Chillout', 'Downtempo', 'Psybient', 'Illbient', 'New Age Electronic'] },
      { name: 'IDM / Experimental Electronic', subgenres: ['IDM', 'Glitch', 'Glitch Hop', 'Braindance', 'Microsound', 'Deconstructed Club', 'Wonky', 'Vaporwave', 'Mallsoft', 'Future Funk'] },
      { name: 'Synthwave', subgenres: ['Synthwave', 'Retrowave', 'Outrun', 'Darksynth', 'Dreamwave', 'Cyberpunk', 'Spacewave'] }
    ]
  },
  {
    family: 'Hip-Hop / Rap',
    genres: [
      { name: 'Hip-Hop', subgenres: ['Old School Hip-Hop', 'Golden Age Hip-Hop', 'Boom Bap', 'Jazz Rap', 'Alternative Hip-Hop', 'Conscious Hip-Hop', 'Underground Hip-Hop', 'Abstract Hip-Hop', 'Instrumental Hip-Hop', 'Lo-Fi Hip-Hop', 'Hardcore Hip-Hop', 'Horrorcore'] },
      { name: 'Trap', subgenres: ['Southern Trap', 'Atlanta Trap', 'Melodic Trap', 'Dark Trap', 'Latin Trap', 'Trap Soul', 'Cloud Trap', 'Rage', 'PluggnB', 'Plugg'] },
      { name: 'Drill', subgenres: ['Chicago Drill', 'UK Drill', 'Brooklyn Drill', 'French Drill', 'Italian Drill', 'Melodic Drill'] },
      { name: 'Regional Rap', subgenres: ['West Coast Rap', 'G-Funk', 'East Coast Rap', 'Southern Rap', 'Dirty South', 'Memphis Rap', 'Houston Chopped & Screwed', 'Bay Area Hyphy', 'Midwest Rap', 'Philly Rap'] },
      { name: 'Global Rap', subgenres: ['Grime', 'Afro Trap', 'French Rap', 'Italian Rap', 'German Rap', 'Spanish Rap', 'Korean Hip-Hop', 'Japanese Hip-Hop', 'Arabic Hip-Hop', 'Brazilian Rap'] }
    ]
  },
  {
    family: 'Pop',
    genres: [
      { name: 'Pop', subgenres: ['Contemporary Pop', 'Dance-Pop', 'Electropop', 'Synthpop', 'Indie Pop', 'Dream Pop', 'Art Pop', 'Power Pop', 'Teen Pop', 'Adult Contemporary', 'Sophisti-Pop', 'Baroque Pop', 'Chamber Pop', 'Sunshine Pop'] },
      { name: 'Modern Pop', subgenres: ['Hyperpop', 'Bedroom Pop', 'Alt-Pop', 'Dark Pop', 'Experimental Pop', 'Bubblegum Bass', 'PC Music', 'Future Pop'] },
      { name: 'Asian Pop', subgenres: ['K-Pop', 'J-Pop', 'C-Pop', 'Mandopop', 'Cantopop', 'Thai Pop', 'V-Pop', 'P-Pop', 'Indo Pop'] },
      { name: 'European Pop', subgenres: ['Europop', 'Italo Pop', 'French Pop', 'Schlager', 'Nordic Pop', 'Balkan Pop'] },
      { name: 'Latin Pop', subgenres: ['Latin Pop', 'Pop Latino', 'Mexican Pop', 'Brazilian Pop', 'Caribbean Pop', 'Andean Pop'] }
    ]
  },
  {
    family: 'Rock',
    genres: [
      { name: 'Rock', subgenres: ['Classic Rock', 'Hard Rock', 'Soft Rock', 'Arena Rock', 'Blues Rock', 'Roots Rock', 'Southern Rock', 'Garage Rock', 'Glam Rock', 'Psychedelic Rock', 'Progressive Rock', 'Art Rock', 'Experimental Rock'] },
      { name: 'Alternative Rock', subgenres: ['Alternative Rock', 'Indie Rock', 'College Rock', 'Grunge', 'Post-Grunge', 'Britpop', 'Shoegaze', 'Dream Rock', 'Noise Rock', 'Math Rock', 'Post-Rock', 'Space Rock'] },
      { name: 'Punk', subgenres: ['Punk Rock', 'Hardcore Punk', 'Post-Punk', 'Pop Punk', 'Skate Punk', 'Street Punk', 'Oi!', 'Crust Punk', 'Anarcho-Punk', 'Garage Punk', 'Horror Punk', 'Emo', 'Screamo', 'Post-Hardcore'] },
      { name: 'Rock & Roll', subgenres: ['Rock and Roll', 'Rockabilly', 'Surf Rock', 'Beat Music', 'Pub Rock'] }
    ]
  },
  {
    family: 'Metal',
    genres: [
      { name: 'Heavy Metal', subgenres: ['Traditional Heavy Metal', 'NWOBHM', 'Speed Metal', 'Power Metal', 'Progressive Metal', 'Symphonic Metal', 'Gothic Metal', 'Folk Metal', 'Viking Metal'] },
      { name: 'Extreme Metal', subgenres: ['Thrash Metal', 'Death Metal', 'Melodic Death Metal', 'Technical Death Metal', 'Brutal Death Metal', 'Black Metal', 'Atmospheric Black Metal', 'Blackgaze', 'Doom Metal', 'Funeral Doom', 'Sludge Metal'] },
      { name: 'Modern Metal', subgenres: ['Metalcore', 'Deathcore', 'Djent', 'Nu Metal', 'Industrial Metal', 'Alternative Metal', 'Post-Metal', 'Mathcore'] }
    ]
  },
  {
    family: 'R&B / Soul / Funk',
    genres: [
      { name: 'R&B', subgenres: ['Contemporary R&B', 'Alternative R&B', 'Neo R&B', 'Quiet Storm', 'New Jack Swing', 'Trap Soul', 'PBR&B'] },
      { name: 'Soul', subgenres: ['Soul', 'Neo Soul', 'Motown', 'Memphis Soul', 'Philly Soul', 'Northern Soul', 'Southern Soul', 'Psychedelic Soul', 'Blue-Eyed Soul'] },
      { name: 'Funk', subgenres: ['Funk', 'P-Funk', 'Boogie', 'Electro-Funk', 'Jazz-Funk', 'Go-Go', 'Afro-Funk', 'Nu-Funk'] }
    ]
  },
  {
    family: 'Jazz',
    genres: [
      { name: 'Jazz', subgenres: ['Traditional Jazz', 'Dixieland', 'Swing', 'Big Band', 'Bebop', 'Hard Bop', 'Cool Jazz', 'Modal Jazz', 'Free Jazz', 'Avant-Garde Jazz', 'Post-Bop', 'Spiritual Jazz', 'Jazz Fusion'] },
      { name: 'Jazz Fusion', subgenres: ['Jazz Fusion', 'Jazz-Funk', 'Acid Jazz', 'Nu Jazz', 'Electro Jazz', 'Smooth Jazz', 'Latin Jazz', 'Afro-Cuban Jazz', 'Ethio-Jazz'] },
      { name: 'Vocal Jazz', subgenres: ['Vocal Jazz', 'Jazz Standards', 'Crooner', 'Scat'] }
    ]
  },
  {
    family: 'Blues',
    genres: [
      { name: 'Blues', subgenres: ['Delta Blues', 'Chicago Blues', 'Texas Blues', 'Piedmont Blues', 'Country Blues', 'Electric Blues', 'Jump Blues', 'Swamp Blues', 'Soul Blues', 'Modern Blues', 'Blues Rock'] }
    ]
  },
  {
    family: 'Reggae / Jamaican',
    genres: [
      { name: 'Reggae', subgenres: ['Roots Reggae', 'Lovers Rock', 'Dub', 'Rockers', 'Steppers', 'Reggae Fusion', 'Modern Reggae'] },
      { name: 'Dancehall', subgenres: ['Early Dancehall', 'Digital Dancehall', 'Ragga', 'Modern Dancehall'] },
      { name: 'Ska', subgenres: ['First Wave Ska', '2 Tone', 'Third Wave Ska', 'Ska Punk', 'Rocksteady'] }
    ]
  },
  {
    family: 'Latin America',
    genres: [
      { name: 'Reggaeton', subgenres: ['Old School Reggaeton', 'Modern Reggaeton', 'Romantic Reggaeton', 'Perreo', 'Neoperreo'] },
      { name: 'Salsa', subgenres: ['Salsa Dura', 'Salsa Romantica', 'Salsa Cubana', 'Salsa Puerto Rican', 'Salsa Colombiana', 'Timba'] },
      { name: 'Cumbia', subgenres: ['Cumbia Colombiana', 'Cumbia Sonidera', 'Cumbia Villera', 'Cumbia Peruana', 'Chicha', 'Digital Cumbia', 'Cumbia Rebajada'] },
      { name: 'Brazilian', subgenres: ['Samba', 'Bossa Nova', 'MPB', 'Forro', 'Baiao', 'Sertanejo', 'Pagode', 'Choro', 'Axé', 'Funk Carioca', 'Brazilian Bass', 'Tropicália'] },
      { name: 'Caribbean Latin', subgenres: ['Bachata', 'Merengue', 'Mambo', 'Cha-Cha-Cha', 'Bolero', 'Son Cubano', 'Guaracha'] },
      { name: 'Mexican / Regional', subgenres: ['Mariachi', 'Ranchera', 'Norteño', 'Banda', 'Corridos', 'Corridos Tumbados', 'Tejano', 'Duranguense'] },
      { name: 'South American', subgenres: ['Tango', 'Milonga', 'Andean Folk', 'Huayno', 'Cueca', 'Nueva Canción', 'Vallenato', 'Joropo'] }
    ]
  },
  {
    family: 'Africa',
    genres: [
      { name: 'West African', subgenres: ['Afrobeat', 'Afrobeats', 'Highlife', 'Hiplife', 'Jùjú', 'Fuji', 'Palm-Wine', 'Mande', 'Wassoulou', 'Griot Music'] },
      { name: 'Southern African', subgenres: ['Amapiano', 'Gqom', 'Kwaito', 'Afro House', '3-Step', 'Maskandi', 'Mbaqanga', 'Bubblegum'] },
      { name: 'Central / East African', subgenres: ['Soukous', 'Ndombolo', 'Rumba Congolaise', 'Benga', 'Taarab', 'Kidandali', 'Gengetone', 'Singeli'] },
      { name: 'North African', subgenres: ['Raï', 'Chaabi', 'Gnawa', 'Amazigh', 'Maghrebi Pop', 'Mahraganat'] },
      { name: 'Horn of Africa', subgenres: ['Ethio-Jazz', 'Ethiopian Pop', 'Tizita', 'Somali Music', 'Eritrean Music'] },
      { name: 'Francophone African', subgenres: ['Mbalax', 'Zouglou', 'Coupé-Décalé', 'Makossa', 'Bikutsi'] }
    ]
  },
  {
    family: 'Caribbean',
    genres: [
      { name: 'Caribbean', subgenres: ['Calypso', 'Soca', 'Chutney', 'Chutney Soca', 'Kompa', 'Zouk', 'Cadence-Lypso', 'Bouyon', 'Rake-and-Scrape', 'Spouge'] }
    ]
  },
  {
    family: 'Middle East / North Africa',
    genres: [
      { name: 'Arabic Music', subgenres: ['Arabic Pop', 'Tarab', 'Maqam', 'Dabke', 'Khaliji', 'Shaabi', 'Mahraganat', 'Levantine Pop', 'Egyptian Pop'] },
      { name: 'Persian Music', subgenres: ['Persian Classical', 'Persian Pop', 'Bandari', 'Iranian Rock', 'Persian Electronic'] },
      { name: 'Turkish Music', subgenres: ['Turkish Pop', 'Arabesque', 'Anatolian Rock', 'Turkish Folk', 'Fasil', 'Turkish Classical'] },
      { name: 'Israeli / Hebrew', subgenres: ['Mizrahi', 'Israeli Pop', 'Hebrew Folk', 'Mediterranean Pop'] }
    ]
  },
  {
    family: 'South Asia',
    genres: [
      { name: 'Indian Classical', subgenres: ['Hindustani Classical', 'Carnatic Classical', 'Dhrupad', 'Khayal', 'Thumri'] },
      { name: 'Indian Popular', subgenres: ['Bollywood', 'Indi-Pop', 'Desi Pop', 'Bhangra', 'Punjabi Pop', 'Desi Hip-Hop', 'Indian Electronic'] },
      { name: 'South Asian Folk', subgenres: ['Qawwali', 'Ghazal', 'Baul', 'Bhojpuri', 'Rajasthani Folk', 'Lavani', 'Garba', 'Dandiya', 'Bengali Folk'] },
      { name: 'Pakistan / Bangladesh / Sri Lanka', subgenres: ['Pakistani Pop', 'Pakistani Rock', 'Bangla Pop', 'Bangla Rock', 'Sinhala Pop', 'Baila'] }
    ]
  },
  {
    family: 'East Asia',
    genres: [
      { name: 'Japanese', subgenres: ['J-Pop', 'J-Rock', 'City Pop', 'Visual Kei', 'Shibuya-kei', 'Enka', 'Kayokyoku', 'Japanese Jazz', 'Anime Music', 'Vocaloid'] },
      { name: 'Korean', subgenres: ['K-Pop', 'K-R&B', 'K-Hip-Hop', 'K-Rock', 'Trot', 'K-Indie'] },
      { name: 'Chinese', subgenres: ['Mandopop', 'Cantopop', 'C-Rock', 'Chinese Hip-Hop', 'Guofeng', 'Chinese Traditional', 'Taiwanese Pop'] },
      { name: 'Mongolian', subgenres: ['Mongolian Folk', 'Mongolian Throat Singing', 'Mongolian Rock'] }
    ]
  },
  {
    family: 'Southeast Asia',
    genres: [
      { name: 'Southeast Asian Popular', subgenres: ['Thai Pop', 'Thai Rock', 'Luk Thung', 'Mor Lam', 'V-Pop', 'Vietnamese Bolero', 'Indo Pop', 'Dangdut', 'Keroncong', 'Malay Pop', 'P-Pop', 'OPM'] },
      { name: 'Traditional Southeast Asia', subgenres: ['Gamelan', 'Kecak', 'Pinpeat', 'Khmer Classical', 'Lao Folk', 'Burmese Classical'] }
    ]
  },
  {
    family: 'Country / Americana',
    genres: [
      { name: 'Country', subgenres: ['Traditional Country', 'Honky-Tonk', 'Outlaw Country', 'Nashville Sound', 'Neo-Traditional Country', 'Country Pop', 'Bro-Country', 'Alt-Country', 'Country Rock', 'Western Swing'] },
      { name: 'Americana', subgenres: ['Americana', 'Bluegrass', 'Old-Time', 'Appalachian Folk', 'Roots', 'Southern Gothic', 'Gospel Country'] }
    ]
  },
  {
    family: 'Folk / Traditional Europe',
    genres: [
      { name: 'European Folk', subgenres: ['Celtic Folk', 'Irish Traditional', 'Scottish Folk', 'English Folk', 'Nordic Folk', 'Balkan Folk', 'Slavic Folk', 'Romani Music', 'Klezmer', 'Flamenco', 'Fado', 'Greek Rebetiko', 'Italian Folk', 'Neapolitan Song', 'Alpine Folk'] },
      { name: 'Contemporary Folk', subgenres: ['Singer-Songwriter', 'Indie Folk', 'Folk Rock', 'Neo-Folk', 'Progressive Folk', 'Freak Folk', 'Anti-Folk'] }
    ]
  },
  {
    family: 'Neomelodica Napoletana',
    genres: [
      {
        name: 'Neomelodica Napoletana Moderna',
        subgenres: [
          'Neomelodico Moderno',
          'Neomelodico Pop',
          'Neomelodico Urban',
          'Neomelodico Trap',
          ...NEAPOLITAN_URBAN_SUBGENRES,
          'Neomelodico Dance',
          'Ballata Neomelodica Moderna',
          'Duetto Neomelodico',
          'Neomelodico Romantico',
          'Neomelodico Drammatico'
        ]
      },
      { name: 'Canzone Napoletana Contemporanea', subgenres: ['Canzone Napoletana Pop', 'Napoli Acoustic Pop', 'Napoli Piano Ballad', 'Napoli Pop Orchestrale', 'Napoli Latin Pop', 'Napoli Soul'] }
    ]
  },
  {
    family: 'Classical / Art Music',
    genres: [
      { name: 'Musica Classica', subgenres: ['Classica Medievale', 'Classica Rinascimentale', 'Classica Barocca', 'Classicismo Viennese', 'Classica Romantica', 'Classica Impressionista', 'Classica Moderna', 'Classica Contemporanea', 'Classica Minimalista'] },
      { name: 'Western Classical', subgenres: ['Medieval', 'Renaissance', 'Baroque', 'Classical Period', 'Romantic', 'Impressionist', 'Modern Classical', 'Contemporary Classical', 'Minimalism', 'Serialism', 'Avant-Garde Classical'] },
      { name: 'Orchestral / Chamber', subgenres: ['Symphony', 'Concerto', 'Chamber Music', 'String Quartet', 'Piano Solo', 'Choral', 'Sacred Classical'] },
      { name: 'Opera', subgenres: ['Opera', 'Bel Canto', 'Verismo', 'Operetta', 'Contemporary Opera'] }
    ]
  },
  {
    family: 'Gospel / Spiritual',
    genres: [
      { name: 'Gospel', subgenres: ['Traditional Gospel', 'Contemporary Gospel', 'Urban Gospel', 'Southern Gospel', 'Gospel Choir'] },
      { name: 'Spiritual / Devotional', subgenres: ['Spiritual', 'Christian Contemporary', 'Worship', 'Nasheed', 'Bhajan', 'Kirtan', 'Sufi Devotional'] }
    ]
  },
  {
    family: 'Cinematic / Media',
    genres: [
      { name: 'Soundtrack', subgenres: ['Film Score', 'Epic Orchestral', 'Trailer Music', 'TV Score', 'Documentary Score', 'Romantic Score', 'Horror Score', 'Sci-Fi Score', 'Fantasy Score'] },
      { name: 'Game Music', subgenres: ['Video Game Soundtrack', 'Chiptune', '8-Bit', '16-Bit', 'JRPG Soundtrack', 'Ambient Game Score', 'Action Game Score'] },
      { name: 'Anime / Media', subgenres: ['Anime Opening', 'Anime Ending', 'Anime Score', 'Kawaii Future Bass', 'Idol Music'] }
    ]
  },
  {
    family: 'Experimental / Avant-Garde',
    genres: [
      { name: 'Experimental', subgenres: ['Experimental Music', 'Musique Concrète', 'Electroacoustic', 'Acousmatic', 'Noise', 'Harsh Noise', 'Power Electronics', 'Lowercase', 'Sound Art', 'Free Improvisation'] }
    ]
  },
  {
    family: 'Easy Listening / Lounge',
    genres: [
      { name: 'Easy Listening', subgenres: ['Easy Listening', 'Lounge', 'Exotica', 'Space Age Pop', 'Bossa Lounge', 'Cocktail Jazz', 'Muzak'] }
    ]
  },
  {
    family: 'Children / Novelty / Spoken',
    genres: [
      { name: 'Children', subgenres: ['Children Music', 'Nursery Rhymes', 'Educational Songs', 'Lullaby'] },
      { name: 'Spoken / Novelty', subgenres: ['Spoken Word', 'Poetry', 'Comedy Music', 'Novelty Song', 'Audio Drama'] }
    ]
  }
];

export const ALL_GENRES = WORLD_MUSIC_GENRES.flatMap(group =>
  group.genres.map(genre => ({ family: group.family, ...genre }))
);

export function findGenre(name: string): (MusicGenre & { family: string }) | undefined {
  return ALL_GENRES.find(genre => genre.name === name);
}
