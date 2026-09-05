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

const BASE_WORLD_MUSIC_GENRES: MusicGenreFamily[] = [
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
      { name: 'Global Rap', subgenres: ['Grime', 'Afro Trap', 'French Rap', 'Italian Rap', 'German Rap', 'Spanish Rap', 'Korean Hip-Hop', 'Japanese Hip-Hop', 'Arabic Hip-Hop', 'Brazilian Rap'] },
      { name: 'Freestyle', subgenres: ['Classic Hip-Hop Freestyle', 'Off-the-Dome Freestyle', 'Battle Freestyle', 'Cypher Freestyle', 'Boom Bap Freestyle', 'Trap Freestyle', 'Drill Freestyle', 'Melodic Freestyle', 'Conscious Freestyle', 'Storytelling Freestyle', 'Double-Time Freestyle', 'Acapella Freestyle'] }
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

// SONARA_PROFESSIONAL_TAXONOMY_V3
// Semantic hierarchy: family > real musical genre > authentic subgenre/style.
const PROFESSIONAL_GENRE_GROUPS: Record<string, MusicGenre[]> = {"IDM / Experimental Electronic":[{"name":"IDM","subgenres":["IDM","Braindance","Wonky"]},{"name":"Glitch","subgenres":["Glitch"]},{"name":"Glitch Hop","subgenres":["Glitch Hop"]},{"name":"Microsound","subgenres":["Microsound"]},{"name":"Deconstructed Club","subgenres":["Deconstructed Club"]},{"name":"Vaporwave","subgenres":["Vaporwave","Mallsoft"]},{"name":"Future Funk","subgenres":["Future Funk"]}],"Regional Rap":[{"name":"West Coast Rap","subgenres":["West Coast Rap","G-Funk","Bay Area Hyphy"]},{"name":"East Coast Rap","subgenres":["East Coast Rap","Philly Rap"]},{"name":"Southern Rap","subgenres":["Southern Rap","Dirty South","Memphis Rap","Houston Chopped & Screwed"]},{"name":"Midwest Rap","subgenres":["Midwest Rap"]}],"Global Rap":[{"name":"Grime","subgenres":["Grime"]},{"name":"Afro Trap","subgenres":["Afro Trap"]},{"name":"French Rap","subgenres":["French Rap"]},{"name":"Italian Rap","subgenres":["Italian Rap"]},{"name":"German Rap","subgenres":["German Rap"]},{"name":"Spanish Rap","subgenres":["Spanish Rap"]},{"name":"Korean Hip-Hop","subgenres":["Korean Hip-Hop"]},{"name":"Japanese Hip-Hop","subgenres":["Japanese Hip-Hop"]},{"name":"Arabic Hip-Hop","subgenres":["Arabic Hip-Hop"]},{"name":"Brazilian Rap","subgenres":["Brazilian Rap"]}],"Asian Pop":[{"name":"K-Pop","subgenres":["K-Pop"]},{"name":"J-Pop","subgenres":["J-Pop"]},{"name":"C-Pop","subgenres":["C-Pop"]},{"name":"Mandopop","subgenres":["Mandopop"]},{"name":"Cantopop","subgenres":["Cantopop"]},{"name":"Thai Pop","subgenres":["Thai Pop"]},{"name":"V-Pop","subgenres":["V-Pop"]},{"name":"P-Pop","subgenres":["P-Pop"]},{"name":"Indo Pop","subgenres":["Indo Pop"]}],"European Pop":[{"name":"Europop","subgenres":["Europop"]},{"name":"Italo Pop","subgenres":["Italo Pop"]},{"name":"French Pop","subgenres":["French Pop"]},{"name":"Schlager","subgenres":["Schlager"]},{"name":"Nordic Pop","subgenres":["Nordic Pop"]},{"name":"Balkan Pop","subgenres":["Balkan Pop"]}],"Jazz":[{"name":"Jazz","subgenres":["Traditional Jazz","Dixieland","Swing","Big Band","Bebop","Hard Bop","Cool Jazz","Modal Jazz","Free Jazz","Avant-Garde Jazz","Post-Bop","Spiritual Jazz"]},{"name":"Jazz Fusion","subgenres":["Jazz Fusion"]}],"Brazilian":[{"name":"Samba","subgenres":["Samba","Pagode"]},{"name":"Bossa Nova","subgenres":["Bossa Nova"]},{"name":"MPB","subgenres":["MPB"]},{"name":"Tropicália","subgenres":["Tropicália"]},{"name":"Forró","subgenres":["Forro"]},{"name":"Baião","subgenres":["Baiao"]},{"name":"Sertanejo","subgenres":["Sertanejo"]},{"name":"Choro","subgenres":["Choro"]},{"name":"Axé","subgenres":["Axé"]},{"name":"Funk Carioca","subgenres":["Funk Carioca"]},{"name":"Brazilian Bass","subgenres":["Brazilian Bass"]}],"Caribbean Latin":[{"name":"Bachata","subgenres":["Bachata"]},{"name":"Merengue","subgenres":["Merengue"]},{"name":"Mambo","subgenres":["Mambo"]},{"name":"Cha-Cha-Cha","subgenres":["Cha-Cha-Cha"]},{"name":"Bolero","subgenres":["Bolero"]},{"name":"Son Cubano","subgenres":["Son Cubano"]},{"name":"Guaracha","subgenres":["Guaracha"]}],"Mexican / Regional":[{"name":"Mariachi","subgenres":["Mariachi"]},{"name":"Ranchera","subgenres":["Ranchera"]},{"name":"Norteño","subgenres":["Norteño"]},{"name":"Banda","subgenres":["Banda"]},{"name":"Corridos","subgenres":["Corridos","Corridos Tumbados"]},{"name":"Tejano","subgenres":["Tejano"]},{"name":"Duranguense","subgenres":["Duranguense"]}],"South American":[{"name":"Tango","subgenres":["Tango"]},{"name":"Milonga","subgenres":["Milonga"]},{"name":"Andean Folk","subgenres":["Andean Folk"]},{"name":"Huayno","subgenres":["Huayno"]},{"name":"Cueca","subgenres":["Cueca"]},{"name":"Nueva Canción","subgenres":["Nueva Canción"]},{"name":"Vallenato","subgenres":["Vallenato"]},{"name":"Joropo","subgenres":["Joropo"]}],"West African":[{"name":"Afrobeat","subgenres":["Afrobeat"]},{"name":"Afrobeats","subgenres":["Afrobeats"]},{"name":"Highlife","subgenres":["Highlife"]},{"name":"Hiplife","subgenres":["Hiplife"]},{"name":"Palm-Wine","subgenres":["Palm-Wine"]},{"name":"Jùjú","subgenres":["Jùjú"]},{"name":"Fuji","subgenres":["Fuji"]},{"name":"Mande","subgenres":["Mande"]},{"name":"Wassoulou","subgenres":["Wassoulou"]},{"name":"Griot Music","subgenres":["Griot Music"]}],"Southern African":[{"name":"Amapiano","subgenres":["Amapiano","3-Step"]},{"name":"Gqom","subgenres":["Gqom"]},{"name":"Kwaito","subgenres":["Kwaito"]},{"name":"Bubblegum","subgenres":["Bubblegum"]},{"name":"Afro House","subgenres":["Afro House"]},{"name":"Maskandi","subgenres":["Maskandi"]},{"name":"Mbaqanga","subgenres":["Mbaqanga"]}],"Central / East African":[{"name":"Rumba Congolaise","subgenres":["Rumba Congolaise"]},{"name":"Soukous","subgenres":["Soukous","Ndombolo"]},{"name":"Benga","subgenres":["Benga"]},{"name":"Taarab","subgenres":["Taarab"]},{"name":"Kidandali","subgenres":["Kidandali"]},{"name":"Gengetone","subgenres":["Gengetone"]},{"name":"Singeli","subgenres":["Singeli"]}],"North African":[{"name":"Raï","subgenres":["Raï"]},{"name":"Chaabi","subgenres":["Chaabi"]},{"name":"Gnawa","subgenres":["Gnawa"]},{"name":"Amazigh","subgenres":["Amazigh"]},{"name":"Maghrebi Pop","subgenres":["Maghrebi Pop"]},{"name":"Mahraganat","subgenres":["Mahraganat"]}],"Horn of Africa":[{"name":"Ethio-Jazz","subgenres":["Ethio-Jazz"]},{"name":"Ethiopian Pop","subgenres":["Ethiopian Pop"]},{"name":"Tizita","subgenres":["Tizita"]},{"name":"Somali Music","subgenres":["Somali Music"]},{"name":"Eritrean Music","subgenres":["Eritrean Music"]}],"Francophone African":[{"name":"Mbalax","subgenres":["Mbalax"]},{"name":"Zouglou","subgenres":["Zouglou"]},{"name":"Coupé-Décalé","subgenres":["Coupé-Décalé"]},{"name":"Makossa","subgenres":["Makossa"]},{"name":"Bikutsi","subgenres":["Bikutsi"]}],"Caribbean":[{"name":"Calypso","subgenres":["Calypso"]},{"name":"Soca","subgenres":["Soca"]},{"name":"Chutney","subgenres":["Chutney","Chutney Soca"]},{"name":"Kompa","subgenres":["Kompa"]},{"name":"Zouk","subgenres":["Zouk"]},{"name":"Cadence-Lypso","subgenres":["Cadence-Lypso"]},{"name":"Bouyon","subgenres":["Bouyon"]},{"name":"Rake-and-Scrape","subgenres":["Rake-and-Scrape"]},{"name":"Spouge","subgenres":["Spouge"]}],"Arabic Music":[{"name":"Arabic Pop","subgenres":["Arabic Pop","Levantine Pop","Egyptian Pop"]},{"name":"Tarab","subgenres":["Tarab"]},{"name":"Maqam","subgenres":["Maqam"]},{"name":"Dabke","subgenres":["Dabke"]},{"name":"Khaliji","subgenres":["Khaliji"]},{"name":"Shaabi","subgenres":["Shaabi"]},{"name":"Mahraganat","subgenres":["Mahraganat"]}],"Persian Music":[{"name":"Persian Classical","subgenres":["Persian Classical"]},{"name":"Persian Pop","subgenres":["Persian Pop"]},{"name":"Bandari","subgenres":["Bandari"]},{"name":"Iranian Rock","subgenres":["Iranian Rock"]},{"name":"Persian Electronic","subgenres":["Persian Electronic"]}],"Turkish Music":[{"name":"Turkish Pop","subgenres":["Turkish Pop"]},{"name":"Arabesque","subgenres":["Arabesque"]},{"name":"Anatolian Rock","subgenres":["Anatolian Rock"]},{"name":"Turkish Folk","subgenres":["Turkish Folk"]},{"name":"Fasil","subgenres":["Fasil"]},{"name":"Turkish Classical","subgenres":["Turkish Classical"]}],"Israeli / Hebrew":[{"name":"Mizrahi","subgenres":["Mizrahi"]},{"name":"Israeli Pop","subgenres":["Israeli Pop"]},{"name":"Hebrew Folk","subgenres":["Hebrew Folk"]},{"name":"Mediterranean Pop","subgenres":["Mediterranean Pop"]}],"Indian Popular":[{"name":"Bollywood","subgenres":["Bollywood"]},{"name":"Indi-Pop","subgenres":["Indi-Pop"]},{"name":"Desi Pop","subgenres":["Desi Pop"]},{"name":"Punjabi Pop","subgenres":["Punjabi Pop"]},{"name":"Bhangra","subgenres":["Bhangra"]},{"name":"Desi Hip-Hop","subgenres":["Desi Hip-Hop"]},{"name":"Indian Electronic","subgenres":["Indian Electronic"]}],"South Asian Folk":[{"name":"Qawwali","subgenres":["Qawwali"]},{"name":"Ghazal","subgenres":["Ghazal"]},{"name":"Baul","subgenres":["Baul"]},{"name":"Bengali Folk","subgenres":["Bengali Folk"]},{"name":"Bhojpuri","subgenres":["Bhojpuri"]},{"name":"Rajasthani Folk","subgenres":["Rajasthani Folk"]},{"name":"Lavani","subgenres":["Lavani"]},{"name":"Garba","subgenres":["Garba"]},{"name":"Dandiya","subgenres":["Dandiya"]}],"Pakistan / Bangladesh / Sri Lanka":[{"name":"Pakistani Pop","subgenres":["Pakistani Pop"]},{"name":"Pakistani Rock","subgenres":["Pakistani Rock"]},{"name":"Bangla Pop","subgenres":["Bangla Pop"]},{"name":"Bangla Rock","subgenres":["Bangla Rock"]},{"name":"Sinhala Pop","subgenres":["Sinhala Pop"]},{"name":"Baila","subgenres":["Baila"]}],"Japanese":[{"name":"J-Pop","subgenres":["J-Pop"]},{"name":"J-Rock","subgenres":["J-Rock"]},{"name":"City Pop","subgenres":["City Pop"]},{"name":"Visual Kei","subgenres":["Visual Kei"]},{"name":"Shibuya-kei","subgenres":["Shibuya-kei"]},{"name":"Enka","subgenres":["Enka"]},{"name":"Kayokyoku","subgenres":["Kayokyoku"]},{"name":"Japanese Jazz","subgenres":["Japanese Jazz"]},{"name":"Anime Music","subgenres":["Anime Music"]},{"name":"Vocaloid","subgenres":["Vocaloid"]}],"Korean":[{"name":"K-Pop","subgenres":["K-Pop"]},{"name":"K-R&B","subgenres":["K-R&B"]},{"name":"K-Hip-Hop","subgenres":["K-Hip-Hop"]},{"name":"K-Rock","subgenres":["K-Rock"]},{"name":"Trot","subgenres":["Trot"]},{"name":"K-Indie","subgenres":["K-Indie"]}],"Chinese":[{"name":"Mandopop","subgenres":["Mandopop"]},{"name":"Cantopop","subgenres":["Cantopop"]},{"name":"C-Rock","subgenres":["C-Rock"]},{"name":"Chinese Hip-Hop","subgenres":["Chinese Hip-Hop"]},{"name":"Guofeng","subgenres":["Guofeng"]},{"name":"Chinese Traditional","subgenres":["Chinese Traditional"]},{"name":"Taiwanese Pop","subgenres":["Taiwanese Pop"]}],"Mongolian":[{"name":"Mongolian Folk","subgenres":["Mongolian Folk","Mongolian Throat Singing"]},{"name":"Mongolian Rock","subgenres":["Mongolian Rock"]}],"Southeast Asian Popular":[{"name":"Thai Pop","subgenres":["Thai Pop"]},{"name":"Thai Rock","subgenres":["Thai Rock"]},{"name":"Luk Thung","subgenres":["Luk Thung"]},{"name":"Mor Lam","subgenres":["Mor Lam"]},{"name":"V-Pop","subgenres":["V-Pop"]},{"name":"Vietnamese Bolero","subgenres":["Vietnamese Bolero"]},{"name":"Indo Pop","subgenres":["Indo Pop"]},{"name":"Dangdut","subgenres":["Dangdut"]},{"name":"Keroncong","subgenres":["Keroncong"]},{"name":"Malay Pop","subgenres":["Malay Pop"]},{"name":"P-Pop","subgenres":["P-Pop"]},{"name":"OPM","subgenres":["OPM"]}],"Traditional Southeast Asia":[{"name":"Gamelan","subgenres":["Gamelan"]},{"name":"Kecak","subgenres":["Kecak"]},{"name":"Pinpeat","subgenres":["Pinpeat"]},{"name":"Khmer Classical","subgenres":["Khmer Classical"]},{"name":"Lao Folk","subgenres":["Lao Folk"]},{"name":"Burmese Classical","subgenres":["Burmese Classical"]}],"European Folk":[{"name":"Celtic Folk","subgenres":["Celtic Folk"]},{"name":"Irish Traditional","subgenres":["Irish Traditional"]},{"name":"Scottish Folk","subgenres":["Scottish Folk"]},{"name":"English Folk","subgenres":["English Folk"]},{"name":"Nordic Folk","subgenres":["Nordic Folk"]},{"name":"Balkan Folk","subgenres":["Balkan Folk"]},{"name":"Slavic Folk","subgenres":["Slavic Folk"]},{"name":"Romani Music","subgenres":["Romani Music"]},{"name":"Klezmer","subgenres":["Klezmer"]},{"name":"Flamenco","subgenres":["Flamenco"]},{"name":"Fado","subgenres":["Fado"]},{"name":"Rebetiko","subgenres":["Greek Rebetiko"]},{"name":"Italian Folk","subgenres":["Italian Folk"]},{"name":"Neapolitan Song","subgenres":["Neapolitan Song"]},{"name":"Alpine Folk","subgenres":["Alpine Folk"]}],"Orchestral / Chamber":[{"name":"Symphony","subgenres":["Symphony"]},{"name":"Concerto","subgenres":["Concerto"]},{"name":"Chamber Music","subgenres":["Chamber Music","String Quartet"]},{"name":"Piano Solo","subgenres":["Piano Solo"]},{"name":"Choral","subgenres":["Choral"]},{"name":"Sacred Classical","subgenres":["Sacred Classical"]}],"Spiritual / Devotional":[{"name":"Spiritual","subgenres":["Spiritual"]},{"name":"Christian Contemporary","subgenres":["Christian Contemporary"]},{"name":"Worship","subgenres":["Worship"]},{"name":"Nasheed","subgenres":["Nasheed"]},{"name":"Bhajan","subgenres":["Bhajan"]},{"name":"Kirtan","subgenres":["Kirtan"]},{"name":"Sufi Devotional","subgenres":["Sufi Devotional"]}],"Anime / Media":[{"name":"Anime Music","subgenres":["Anime Opening","Anime Ending","Anime Score"]},{"name":"Kawaii Future Bass","subgenres":["Kawaii Future Bass"]},{"name":"Idol Music","subgenres":["Idol Music"]}],"Spoken / Novelty":[{"name":"Spoken Word","subgenres":["Spoken Word"]},{"name":"Poetry","subgenres":["Poetry"]},{"name":"Comedy Music","subgenres":["Comedy Music"]},{"name":"Novelty Song","subgenres":["Novelty Song"]},{"name":"Audio Drama","subgenres":["Audio Drama"]}]};

export const PROFESSIONAL_DERIVED_GENRES = new Set<string>();

function taxonomyKey(value: string): string {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('en-US');
}

function validateProfessionalGrouping(family: string, sourceGenre: MusicGenre, mapped: MusicGenre[]) {
  const original = sourceGenre.subgenres.map(taxonomyKey);
  const replacement = mapped.flatMap(item => item.subgenres).map(taxonomyKey);
  const originalSet = new Set(original);
  const replacementSet = new Set(replacement);
  if (original.length !== replacement.length || originalSet.size !== replacementSet.size || original.some(item => !replacementSet.has(item))) {
    throw new Error('SONARA taxonomy v3 lost or duplicated styles in ' + family + ' / ' + sourceGenre.name);
  }
}

function normalizeProfessionalFamily(group: MusicGenreFamily): MusicGenreFamily {
  const genres: MusicGenre[] = [];
  const byName = new Map<string, MusicGenre>();

  for (const genre of group.genres) {
    const mapped = PROFESSIONAL_GENRE_GROUPS[genre.name];
    const expanded = mapped || [genre];
    if (mapped) validateProfessionalGrouping(group.family, genre, mapped);

    for (const item of expanded) {
      const name = item.name.trim();
      const key = taxonomyKey(name);
      if (!key) continue;
      const subgenres = Array.from(new Set((item.subgenres.length ? item.subgenres : [name]).filter(Boolean)));
      const existing = byName.get(key);
      if (existing) existing.subgenres = Array.from(new Set([...existing.subgenres, ...subgenres]));
      else {
        const normalized = { name, subgenres };
        byName.set(key, normalized);
        genres.push(normalized);
      }
      if (mapped) PROFESSIONAL_DERIVED_GENRES.add(name);
    }
  }

  return { family: group.family, genres };
}

// SONARA_REAL_TAXONOMY_V4
// Canonical hierarchy: musical family > real genre > authentic subgenre/style.
// Geographic and umbrella containers stay at family/category level, never masquerading as genres.
const PROFESSIONAL_V3_WORLD_MUSIC_GENRES: MusicGenreFamily[] = BASE_WORLD_MUSIC_GENRES.map(normalizeProfessionalFamily);
const REAL_GENRE_OVERRIDES_V4: Record<string, MusicGenre[]> = {"Ambient Electronic":[{"name":"Ambient","subgenres":["Ambient","Dark Ambient","Space Ambient"]},{"name":"Drone","subgenres":["Drone"]},{"name":"Chillout","subgenres":["Chillout"]},{"name":"Downtempo","subgenres":["Downtempo"]},{"name":"Psybient","subgenres":["Psybient"]},{"name":"Illbient","subgenres":["Illbient"]},{"name":"New Age Electronic","subgenres":["New Age Electronic"]}],"Hard Dance":[{"name":"Hardstyle","subgenres":["Hardstyle","Rawstyle","Euphoric Hardstyle"]},{"name":"Hardcore","subgenres":["Hardcore","Gabber","Frenchcore","Uptempo Hardcore","Happy Hardcore"]},{"name":"Hard Dance","subgenres":["Hard Dance"]},{"name":"Makina","subgenres":["Makina"]}],"Electro":[{"name":"Electro","subgenres":["Electro","Electro Funk","Nu Electro"]},{"name":"Electroclash","subgenres":["Electroclash"]},{"name":"Miami Bass","subgenres":["Miami Bass"]},{"name":"Freestyle","subgenres":["Freestyle"]}],"Modern Pop":[{"name":"Hyperpop","subgenres":["Hyperpop","Bubblegum Bass","PC Music"]},{"name":"Bedroom Pop","subgenres":["Bedroom Pop"]},{"name":"Alt-Pop","subgenres":["Alt-Pop"]},{"name":"Dark Pop","subgenres":["Dark Pop"]},{"name":"Experimental Pop","subgenres":["Experimental Pop"]},{"name":"Future Pop","subgenres":["Future Pop"]}],"Rock & Roll":[{"name":"Rock & Roll","subgenres":["Rock and Roll","Rockabilly"]},{"name":"Surf Rock","subgenres":["Surf Rock"]},{"name":"Beat Music","subgenres":["Beat Music"]},{"name":"Pub Rock","subgenres":["Pub Rock"]}],"Extreme Metal":[{"name":"Thrash Metal","subgenres":["Thrash Metal"]},{"name":"Death Metal","subgenres":["Death Metal","Melodic Death Metal","Technical Death Metal","Brutal Death Metal"]},{"name":"Black Metal","subgenres":["Black Metal","Atmospheric Black Metal","Blackgaze"]},{"name":"Doom Metal","subgenres":["Doom Metal","Funeral Doom"]},{"name":"Sludge Metal","subgenres":["Sludge Metal"]}],"Modern Metal":[{"name":"Metalcore","subgenres":["Metalcore","Mathcore"]},{"name":"Deathcore","subgenres":["Deathcore"]},{"name":"Djent","subgenres":["Djent"]},{"name":"Nu Metal","subgenres":["Nu Metal"]},{"name":"Industrial Metal","subgenres":["Industrial Metal"]},{"name":"Alternative Metal","subgenres":["Alternative Metal"]},{"name":"Post-Metal","subgenres":["Post-Metal"]}],"Jazz Fusion":[{"name":"Jazz Fusion","subgenres":["Jazz Fusion"]},{"name":"Jazz-Funk","subgenres":["Jazz-Funk"]},{"name":"Acid Jazz","subgenres":["Acid Jazz"]},{"name":"Nu Jazz","subgenres":["Nu Jazz"]},{"name":"Electro Jazz","subgenres":["Electro Jazz"]},{"name":"Smooth Jazz","subgenres":["Smooth Jazz"]},{"name":"Latin Jazz","subgenres":["Latin Jazz","Afro-Cuban Jazz"]},{"name":"Ethio-Jazz","subgenres":["Ethio-Jazz"]}],"Vocal Jazz":[{"name":"Vocal Jazz","subgenres":["Vocal Jazz","Jazz Standards","Scat"]},{"name":"Crooner","subgenres":["Crooner"]}],"Blues":[{"name":"Blues","subgenres":["Delta Blues","Chicago Blues","Texas Blues","Piedmont Blues","Country Blues","Electric Blues","Jump Blues","Swamp Blues","Soul Blues","Modern Blues"]},{"name":"Blues Rock","subgenres":["Blues Rock"]}],"Reggae":[{"name":"Reggae","subgenres":["Roots Reggae","Lovers Rock","Rockers","Steppers","Reggae Fusion","Modern Reggae"]},{"name":"Dub","subgenres":["Dub"]}],"Ska":[{"name":"Ska","subgenres":["First Wave Ska","2 Tone","Third Wave Ska","Ska Punk"]},{"name":"Rocksteady","subgenres":["Rocksteady"]}],"Indian Classical":[{"name":"Hindustani Classical","subgenres":["Hindustani Classical","Dhrupad","Khayal","Thumri"]},{"name":"Carnatic Classical","subgenres":["Carnatic Classical"]}],"Mongolian Folk":[{"name":"Mongolian Folk","subgenres":["Mongolian Folk"]},{"name":"Mongolian Throat Singing","subgenres":["Mongolian Throat Singing"]}],"Americana":[{"name":"Americana","subgenres":["Americana","Roots"]},{"name":"Bluegrass","subgenres":["Bluegrass"]},{"name":"Old-Time","subgenres":["Old-Time","Appalachian Folk"]},{"name":"Southern Gothic","subgenres":["Southern Gothic"]},{"name":"Gospel Country","subgenres":["Gospel Country"]}],"Contemporary Folk":[{"name":"Singer-Songwriter","subgenres":["Singer-Songwriter"]},{"name":"Indie Folk","subgenres":["Indie Folk"]},{"name":"Folk Rock","subgenres":["Folk Rock"]},{"name":"Neo-Folk","subgenres":["Neo-Folk"]},{"name":"Progressive Folk","subgenres":["Progressive Folk"]},{"name":"Freak Folk","subgenres":["Freak Folk"]},{"name":"Anti-Folk","subgenres":["Anti-Folk"]}],"Game Music":[{"name":"Video Game Soundtrack","subgenres":["Video Game Soundtrack","JRPG Soundtrack","Ambient Game Score","Action Game Score"]},{"name":"Chiptune","subgenres":["Chiptune","8-Bit","16-Bit"]}],"Easy Listening":[{"name":"Easy Listening","subgenres":["Easy Listening"]},{"name":"Lounge","subgenres":["Lounge"]},{"name":"Exotica","subgenres":["Exotica"]},{"name":"Space Age Pop","subgenres":["Space Age Pop"]},{"name":"Bossa Lounge","subgenres":["Bossa Lounge"]},{"name":"Cocktail Jazz","subgenres":["Cocktail Jazz"]},{"name":"Muzak","subgenres":["Muzak"]}],"Children":[{"name":"Children's Music","subgenres":["Children Music","Educational Songs"]},{"name":"Nursery Rhymes","subgenres":["Nursery Rhymes"]},{"name":"Lullaby","subgenres":["Lullaby"]}]};

function validateRealGenreOverrideV4(family: string, sourceGenre: MusicGenre, mapped: MusicGenre[]) {
  const original = sourceGenre.subgenres.map(taxonomyKey);
  const replacement = mapped.flatMap(item => item.subgenres).map(taxonomyKey);
  const originalSet = new Set(original);
  const replacementSet = new Set(replacement);
  if (original.length !== replacement.length || originalSet.size !== replacementSet.size || original.some(item => !replacementSet.has(item))) {
    throw new Error('SONARA real taxonomy v4 lost or duplicated styles in ' + family + ' / ' + sourceGenre.name);
  }
}

function normalizeRealFamilyV4(group: MusicGenreFamily): MusicGenreFamily {
  const genres: MusicGenre[] = [];
  const byName = new Map<string, MusicGenre>();
  for (const genre of group.genres) {
    const mapped = REAL_GENRE_OVERRIDES_V4[genre.name];
    const expanded = mapped || [genre];
    if (mapped) validateRealGenreOverrideV4(group.family, genre, mapped);
    for (const item of expanded) {
      const name = item.name.trim();
      const key = taxonomyKey(name);
      if (!key) continue;
      const subgenres = Array.from(new Set((item.subgenres.length ? item.subgenres : [name]).filter(Boolean)));
      const existing = byName.get(key);
      if (existing) existing.subgenres = Array.from(new Set([...existing.subgenres, ...subgenres]));
      else {
        const normalized = { name, subgenres };
        byName.set(key, normalized);
        genres.push(normalized);
      }
      if (mapped) PROFESSIONAL_DERIVED_GENRES.add(name);
    }
  }
  return { family: group.family, genres };
}

export const WORLD_MUSIC_GENRES: MusicGenreFamily[] = PROFESSIONAL_V3_WORLD_MUSIC_GENRES.map(normalizeRealFamilyV4);

export const ALL_GENRES = WORLD_MUSIC_GENRES.flatMap(group =>
  group.genres.map(genre => ({ family: group.family, ...genre }))
);

export function findGenre(name: string): (MusicGenre & { family: string }) | undefined {
  return ALL_GENRES.find(genre => genre.name === name);
}
