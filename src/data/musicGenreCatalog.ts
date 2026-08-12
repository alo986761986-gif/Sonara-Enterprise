export interface MusicStyleOption {
  name: string;
  bpm: number;
}

export interface MusicGenreFamily {
  id: string;
  label: string;
  styles: MusicStyleOption[];
}

const style = (name: string, bpm: number): MusicStyleOption => ({ name, bpm });

export const MUSIC_GENRE_CATALOG: MusicGenreFamily[] = [
  {
    id: 'house',
    label: 'House',
    styles: [
      style('House', 124),
      style('Deep House', 122),
      style('Tech House', 126),
      style('Afro House', 120),
      style('Organic House', 118),
      style('Melodic House', 124),
      style('Progressive House', 126),
      style('Soulful House', 122),
      style('Funky House', 126),
      style('Disco House', 124),
      style('French House', 124),
      style('Filter House', 124),
      style('Jackin House', 126),
      style('Chicago House', 123),
      style('Acid House', 124),
      style('Detroit House', 123),
      style('Tribal House', 126),
      style('Latin House', 126),
      style('Electro House', 128),
      style('Big Room House', 128),
      style('Future House', 126),
      style('Bass House', 126),
      style('G-House', 124),
      style('Slap House', 124),
      style('Tropical House', 110),
      style('Piano House', 124),
      style('Vocal House', 124),
      style('Garage House', 124),
      style('Lo-Fi House', 118),
      style('Microhouse', 120),
      style('Minimal House', 124),
      style('Hard House', 145),
      style('Speed House', 135),
      style('Techno House', 128),
      style('Balearic House', 118),
      style('Ibiza House', 124),
      style('Beach House', 118),
      style('Afro Tech House', 122),
      style('Amapiano House', 112),
      style('Kwaito House', 110)
    ]
  },
  {
    id: 'techno',
    label: 'Techno',
    styles: [
      style('Techno', 132),
      style('Detroit Techno', 130),
      style('Minimal Techno', 128),
      style('Deep Techno', 128),
      style('Dub Techno', 124),
      style('Hypnotic Techno', 132),
      style('Peak Time Techno', 134),
      style('Driving Techno', 134),
      style('Melodic Techno', 124),
      style('Industrial Techno', 138),
      style('Acid Techno', 136),
      style('Hard Techno', 145),
      style('Raw Techno', 138),
      style('Schranz', 150),
      style('Hardgroove', 138),
      style('Tribal Techno', 136),
      style('Birmingham Techno', 135),
      style('Berlin Techno', 136)
    ]
  },
  {
    id: 'trance',
    label: 'Trance',
    styles: [
      style('Trance', 138),
      style('Uplifting Trance', 138),
      style('Progressive Trance', 132),
      style('Vocal Trance', 136),
      style('Tech Trance', 140),
      style('Hard Trance', 145),
      style('Psytrance', 145),
      style('Progressive Psytrance', 138),
      style('Goa Trance', 145),
      style('Full-On Psytrance', 146),
      style('Dark Psytrance', 150),
      style('Dream Trance', 136),
      style('Euro Trance', 138),
      style('Balearic Trance', 132),
      style('Acid Trance', 140)
    ]
  },
  {
    id: 'drum-bass-jungle',
    label: 'Drum & Bass / Jungle',
    styles: [
      style('Drum & Bass', 174),
      style('Liquid Drum & Bass', 174),
      style('Neurofunk', 174),
      style('Jump Up Drum & Bass', 174),
      style('Dancefloor Drum & Bass', 174),
      style('Techstep', 174),
      style('Darkstep', 174),
      style('Atmospheric Drum & Bass', 170),
      style('Intelligent Drum & Bass', 170),
      style('Drumfunk', 172),
      style('Jungle', 170),
      style('Ragga Jungle', 170),
      style('Dark Jungle', 172),
      style('Breakcore', 190)
    ]
  },
  {
    id: 'garage-bass-dubstep',
    label: 'Garage / Bass / Dubstep',
    styles: [
      style('UK Garage', 132),
      style('2-Step Garage', 132),
      style('Speed Garage', 135),
      style('Bassline', 135),
      style('Future Garage', 132),
      style('UK Bass', 136),
      style('Dubstep', 140),
      style('Deep Dubstep', 140),
      style('Brostep', 140),
      style('Riddim Dubstep', 140),
      style('Future Bass', 150),
      style('Trap EDM', 140),
      style('Wave', 140),
      style('Grime', 140),
      style('Purple Sound', 140)
    ]
  },
  {
    id: 'breakbeat-electro',
    label: 'Breakbeat / Electro',
    styles: [
      style('Breakbeat', 132),
      style('Breaks', 132),
      style('Nu Skool Breaks', 134),
      style('Progressive Breaks', 130),
      style('Big Beat', 128),
      style('Electro', 128),
      style('Electro Breaks', 132),
      style('Miami Bass', 130),
      style('Freestyle', 118),
      style('Baltimore Club', 130),
      style('Jersey Club', 140),
      style('Footwork', 160)
    ]
  },
  {
    id: 'hard-dance',
    label: 'Hard Dance / Hardcore',
    styles: [
      style('Hardstyle', 150),
      style('Rawstyle', 155),
      style('Euphoric Hardstyle', 150),
      style('Hard Dance', 145),
      style('Hardcore', 170),
      style('Gabber', 175),
      style('Happy Hardcore', 170),
      style('UK Hardcore', 170),
      style('Frenchcore', 200),
      style('Uptempo Hardcore', 200),
      style('Terrorcore', 220),
      style('Speedcore', 240),
      style('Hardtek', 180),
      style('Free Tekno', 180)
    ]
  },
  {
    id: 'ambient-downtempo-idm',
    label: 'Ambient / Downtempo / IDM',
    styles: [
      style('Ambient', 70),
      style('Dark Ambient', 70),
      style('Drone Ambient', 60),
      style('Space Ambient', 70),
      style('Chillout', 90),
      style('Downtempo', 90),
      style('Trip Hop', 90),
      style('Chillwave', 95),
      style('Vaporwave', 80),
      style('Synthwave', 100),
      style('Retrowave', 105),
      style('IDM', 120),
      style('Glitch', 110),
      style('Glitch Hop', 110),
      style('Lo-Fi', 80)
    ]
  },
  {
    id: 'disco-funk-dance',
    label: 'Disco / Funk / Dance',
    styles: [
      style('Disco', 118),
      style('Nu-Disco', 118),
      style('Italo Disco', 118),
      style('Eurodisco', 120),
      style('Space Disco', 118),
      style('Boogie', 112),
      style('Funk', 108),
      style('Electro-Funk', 112),
      style('Dance-Pop', 120),
      style('Eurodance', 136),
      style('Hi-NRG', 128),
      style('Dance', 124)
    ]
  },
  {
    id: 'hip-hop-rap',
    label: 'Hip Hop / Rap',
    styles: [
      style('Hip Hop', 90),
      style('Boom Bap', 90),
      style('East Coast Hip Hop', 92),
      style('West Coast Hip Hop', 94),
      style('G-Funk', 94),
      style('Southern Hip Hop', 90),
      style('Trap', 140),
      style('Drill', 140),
      style('UK Drill', 142),
      style('Chicago Drill', 140),
      style('Cloud Rap', 120),
      style('Lo-Fi Hip Hop', 80),
      style('Jazz Rap', 92),
      style('Conscious Hip Hop', 90),
      style('Alternative Hip Hop', 95),
      style('Emo Rap', 120),
      style('Phonk', 130),
      style('Memphis Rap', 120)
    ]
  },
  {
    id: 'rnb-soul',
    label: 'R&B / Soul',
    styles: [
      style('R&B', 90),
      style('Contemporary R&B', 90),
      style('Alternative R&B', 88),
      style('Neo Soul', 86),
      style('Soul', 95),
      style('Motown', 110),
      style('Quiet Storm', 78),
      style('New Jack Swing', 110),
      style('Funk Soul', 105),
      style('Psychedelic Soul', 95),
      style('Blue-Eyed Soul', 100),
      style('Gospel Soul', 90)
    ]
  },
  {
    id: 'pop',
    label: 'Pop',
    styles: [
      style('Pop', 118),
      style('Dance Pop', 120),
      style('Electropop', 120),
      style('Synthpop', 115),
      style('Dream Pop', 100),
      style('Indie Pop', 110),
      style('Art Pop', 105),
      style('Power Pop', 130),
      style('Teen Pop', 120),
      style('Hyperpop', 150),
      style('K-Pop', 124),
      style('J-Pop', 128),
      style('Latin Pop', 105),
      style('Pop Rock', 125),
      style('Pop EDM', 128)
    ]
  },
  {
    id: 'rock',
    label: 'Rock',
    styles: [
      style('Rock', 120),
      style('Classic Rock', 118),
      style('Alternative Rock', 120),
      style('Indie Rock', 120),
      style('Hard Rock', 125),
      style('Garage Rock', 130),
      style('Psychedelic Rock', 110),
      style('Progressive Rock', 115),
      style('Post-Rock', 95),
      style('Surf Rock', 145),
      style('Southern Rock', 115),
      style('Blues Rock', 110),
      style('Glam Rock', 125),
      style('Stoner Rock', 100),
      style('Shoegaze', 100),
      style('Math Rock', 120),
      style('Grunge', 115),
      style('Rockabilly', 150)
    ]
  },
  {
    id: 'metal',
    label: 'Metal',
    styles: [
      style('Heavy Metal', 130),
      style('Thrash Metal', 180),
      style('Death Metal', 180),
      style('Black Metal', 170),
      style('Doom Metal', 75),
      style('Power Metal', 160),
      style('Progressive Metal', 130),
      style('Symphonic Metal', 140),
      style('Gothic Metal', 120),
      style('Folk Metal', 140),
      style('Industrial Metal', 125),
      style('Nu Metal', 105),
      style('Metalcore', 150),
      style('Deathcore', 150),
      style('Groove Metal', 110),
      style('Sludge Metal', 90),
      style('Stoner Metal', 90),
      style('Post-Metal', 90),
      style('Speed Metal', 180),
      style('Drone Metal', 60)
    ]
  },
  {
    id: 'punk',
    label: 'Punk / Hardcore',
    styles: [
      style('Punk Rock', 180),
      style('Hardcore Punk', 190),
      style('Pop Punk', 170),
      style('Post-Punk', 130),
      style('Anarcho-Punk', 170),
      style('Crust Punk', 190),
      style('Street Punk', 180),
      style('Skate Punk', 190),
      style('Emo', 140),
      style('Post-Hardcore', 160),
      style('Screamo', 170),
      style('Noise Rock', 130)
    ]
  },
  {
    id: 'jazz',
    label: 'Jazz',
    styles: [
      style('Jazz', 120),
      style('Swing Jazz', 140),
      style('Bebop', 180),
      style('Cool Jazz', 105),
      style('Hard Bop', 150),
      style('Modal Jazz', 120),
      style('Free Jazz', 120),
      style('Jazz Fusion', 120),
      style('Smooth Jazz', 100),
      style('Latin Jazz', 120),
      style('Afro-Cuban Jazz', 125),
      style('Gypsy Jazz', 160),
      style('Nu Jazz', 110),
      style('Acid Jazz', 112),
      style('Jazz Funk', 112)
    ]
  },
  {
    id: 'blues',
    label: 'Blues',
    styles: [
      style('Blues', 90),
      style('Delta Blues', 85),
      style('Chicago Blues', 100),
      style('Electric Blues', 100),
      style('Texas Blues', 105),
      style('Jump Blues', 140),
      style('Soul Blues', 90),
      style('Country Blues', 95),
      style('Piedmont Blues', 100),
      style('Blues Rock', 110)
    ]
  },
  {
    id: 'classical',
    label: 'Classical / Orchestral',
    styles: [
      style('Classical', 100),
      style('Baroque', 100),
      style('Classical Period', 100),
      style('Romantic', 90),
      style('Modern Classical', 90),
      style('Contemporary Classical', 90),
      style('Minimalism', 100),
      style('Neoclassical', 95),
      style('Chamber Music', 90),
      style('Symphonic', 100),
      style('Opera', 90),
      style('Choral', 80),
      style('Piano Solo', 80),
      style('Orchestral', 100)
    ]
  },
  {
    id: 'country-americana',
    label: 'Country / Americana',
    styles: [
      style('Country', 105),
      style('Traditional Country', 105),
      style('Country Pop', 115),
      style('Outlaw Country', 100),
      style('Alt-Country', 105),
      style('Americana', 100),
      style('Bluegrass', 150),
      style('Honky Tonk', 120),
      style('Western Swing', 130),
      style('Country Rock', 115),
      style('Nashville Sound', 105),
      style('Red Dirt', 110)
    ]
  },
  {
    id: 'reggae-caribbean',
    label: 'Reggae / Caribbean',
    styles: [
      style('Reggae', 82),
      style('Roots Reggae', 78),
      style('Dub', 72),
      style('Dancehall', 100),
      style('Ragga', 95),
      style('Ska', 145),
      style('Rocksteady', 85),
      style('Reggae Fusion', 100),
      style('Soca', 130),
      style('Calypso', 120),
      style('Zouk', 100),
      style('Kompa', 105)
    ]
  },
  {
    id: 'latin',
    label: 'Latin',
    styles: [
      style('Latin', 105),
      style('Reggaeton', 95),
      style('Dembow', 110),
      style('Salsa', 100),
      style('Bachata', 125),
      style('Merengue', 130),
      style('Cumbia', 95),
      style('Latin Pop', 105),
      style('Latin Trap', 140),
      style('Bossa Nova', 125),
      style('Samba', 100),
      style('Tango', 120),
      style('Mambo', 110),
      style('Cha-Cha-Cha', 120),
      style('Bolero', 80),
      style('Ranchera', 95),
      style('Corridos', 105),
      style('Norteño', 110)
    ]
  },
  {
    id: 'african',
    label: 'African',
    styles: [
      style('Afrobeat', 110),
      style('Afrobeats', 105),
      style('Amapiano', 112),
      style('Highlife', 115),
      style('Juju', 110),
      style('Fuji', 120),
      style('Kwaito', 110),
      style('Gqom', 120),
      style('Kuduro', 140),
      style('Makossa', 115),
      style('Soukous', 125),
      style('Mbalax', 125),
      style('Gnawa', 100),
      style('Desert Blues', 100),
      style('Afro-Cuban', 120),
      style('Afro Fusion', 110)
    ]
  },
  {
    id: 'folk-world',
    label: 'Folk / World / Traditional',
    styles: [
      style('Folk', 100),
      style('Contemporary Folk', 100),
      style('Indie Folk', 100),
      style('Celtic Folk', 110),
      style('Nordic Folk', 90),
      style('Balkan Folk', 120),
      style('Mediterranean Folk', 105),
      style('Flamenco', 120),
      style('Fado', 90),
      style('Klezmer', 130),
      style('Arabic', 100),
      style('Middle Eastern', 100),
      style('Indian Classical', 90),
      style('Bollywood', 120),
      style('Bhangra', 140),
      style('Gamelan', 90),
      style('Traditional Japanese', 90),
      style('Traditional Chinese', 90),
      style('Andean', 100),
      style('World Fusion', 110)
    ]
  },
  {
    id: 'cinematic',
    label: 'Cinematic / Soundtrack',
    styles: [
      style('Cinematic', 100),
      style('Epic Orchestral', 110),
      style('Film Score', 100),
      style('Trailer Music', 120),
      style('Ambient Cinematic', 80),
      style('Hybrid Orchestral', 115),
      style('Dark Cinematic', 90),
      style('Action Score', 125),
      style('Fantasy Score', 100),
      style('Game Soundtrack', 110)
    ]
  },
  {
    id: 'experimental',
    label: 'Experimental / Avant-Garde',
    styles: [
      style('Experimental', 110),
      style('Avant-Garde', 100),
      style('Noise', 120),
      style('Musique Concrète', 90),
      style('Electroacoustic', 100),
      style('Industrial', 120),
      style('Darkwave', 110),
      style('EBM', 125),
      style('Witch House', 80),
      style('Deconstructed Club', 130)
    ]
  }
];

export const DEFAULT_GENRE_FAMILY_ID = 'house';
export const DEFAULT_GENRE_STYLE = 'Tech House';

export function getGenreFamily(familyId: string): MusicGenreFamily {
  return MUSIC_GENRE_CATALOG.find(family => family.id === familyId) || MUSIC_GENRE_CATALOG[0];
}

export function getGenreStyle(familyId: string, styleName: string): MusicStyleOption {
  const family = getGenreFamily(familyId);
  return family.styles.find(entry => entry.name === styleName) || family.styles[0];
}
