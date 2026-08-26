import {
  getAtmospheresForSelection as getBaseAtmospheres,
  getMusicStyleProfile as getBaseProfile,
  hasCuratedGenreIdentity as hasBaseGenreIdentity,
  type MusicStyleProfile
} from './musicStyleIntelligenceLegacy';
import { getHouseStylePatch } from './houseStyleIntelligence';

export type { MusicStyleProfile } from './musicStyleIntelligenceLegacy';

export interface MusicTaxonomyAudit {
  taxonomyPath: string;
  specificityScore: number;
  exactProfile: boolean;
  matchedRules: string[];
  fingerprint: string;
  atmosphereSignature: string[];
}

type Patch = Partial<Omit<MusicStyleProfile, 'moods'>> & {
  moods?: string[];
  blockedMoods?: string[];
};

type Rule = Patch & { id: string; pattern: RegExp; priority: number };

const p = (identity: string, moods: string[], rest: Omit<Patch, 'identity' | 'moods'> = {}): Patch => ({ identity, moods, ...rest });

const EXACT: Record<string, Patch> = {
  'deep house': p('Deep House is warm, spacious, soulful and hypnotic rather than aggressive or festival-sized.', ['Deep', 'Warm', 'Hypnotic', 'Soulful', 'Late-Night', 'Atmospheric', 'Intimate', 'Groovy'], {
    instrumentation: 'rounded deep bass, warm electric piano or organ chords, soft defined house drums, subtle pads, restrained motifs and spacious effects',
    rhythm: 'steady four-on-the-floor with a warm pocket, lightly syncopated percussion and smooth bass movement',
    harmony: 'soulful extended chords, gentle voice leading and understated melodic language',
    arrangement: 'spacious intro, gradual layering, emotionally focused main section, restrained breakdown, warm final lift and clean outro',
    blockedMoods: ['Aggressive', 'Relentless', 'Brutal']
  }),
  'tech house': p('Tech House is a stripped, groove-dominant club tool built from short bass phrases, shuffled percussion, restrained stabs and DJ-functional tension.', ['Groovy', 'Driving', 'Hypnotic', 'Underground', 'Dark', 'Peak-Time', 'Raw', 'Minimal'], {
    instrumentation: 'tight electronic drums, short punchy kick, elastic mono bass, syncopated percussion, restrained synth stabs and functional club effects',
    rhythm: 'locked four-on-the-floor with disciplined kick-bass interaction, shuffled hats, concise fills and controlled forward motion',
    harmony: 'minimal repetitive harmony with small timbral changes that never distract from the groove',
    arrangement: 'DJ-friendly intro, gradual groove build, main drop, tension breakdown, stronger return and clean mixable outro',
    blockedMoods: ['Dreamy', 'Pastoral', 'Orchestral']
  }),
  'detroit techno': p('Detroit Techno combines machine precision with futurist soul, melodic restraint and evolving urban-industrial imagination.', ['Futuristic', 'Machine-Soul', 'Hypnotic', 'Deep', 'Driving', 'Nocturnal', 'Raw', 'Transcendent']),
  'dub techno': p('Dub Techno fuses techno pulse with chord-delay clouds, tape-like space, filtered decay and slow hypnotic evolution.', ['Deep', 'Dubwise', 'Hypnotic', 'Spacious', 'Nocturnal', 'Minimal', 'Atmospheric', 'Meditative']),
  'goa trance': p('Goa Trance uses spiraling acid sequences, psychedelic modal motifs, rolling propulsion and long narrative builds rooted in early psychedelic trance.', ['Psychedelic', 'Cosmic', 'Hypnotic', 'Mystical', 'Driving', 'Euphoric', 'Tribal', 'Transcendent']),
  'liquid drum & bass': p('Liquid Drum & Bass balances fast breakbeat propulsion with warm bass, soulful harmony and fluid melodic atmosphere.', ['Liquid', 'Soulful', 'Uplifting', 'Atmospheric', 'Emotional', 'Flowing', 'Warm', 'Energetic']),
  jungle: p('Jungle is defined by aggressively edited breakbeats, deep sub bass, sound-system pressure and restless rhythmic recombination.', ['Raw', 'Ruff', 'Energetic', 'Urban', 'Dark', 'Breakbeat', 'Rebellious', 'Hypnotic']),
  'uk dubstep': p('UK Dubstep is sparse, sub-led and half-time, using negative space, syncopated percussion and sound-system depth rather than maximal midrange aggression.', ['Deep', 'Subterranean', 'Dark', 'Spacious', 'Nocturnal', 'Tense', 'Minimal', 'Dubwise']),
  ambient: p('Ambient prioritizes immersive space, timbre, gradual transformation and sustained attention over conventional beat or song form.', ['Atmospheric', 'Meditative', 'Ethereal', 'Serene', 'Spacious', 'Introspective', 'Dreamy', 'Timeless']),
  'boom bap': p('Boom Bap requires a hard kick-snare conversation, dusty human swing and loop-focused head-nod authority.', ['Gritty', 'Confident', 'Raw', 'Nostalgic', 'Soulful', 'Laid-Back', 'Street', 'Defiant']),
  'lo-fi hip-hop': p('Lo-Fi Hip-Hop uses deliberately softened texture, relaxed swing, intimate harmonic loops and understated variation without sounding unfinished.', ['Cozy', 'Laid-Back', 'Nostalgic', 'Intimate', 'Warm', 'Reflective', 'Rainy', 'Mellow']),
  'uk drill': p('UK Drill uses gliding bass, syncopated kick placement, clipped percussion and cold minor-key tension with a distinctly UK pocket.', ['Cold', 'Menacing', 'Tense', 'Dark', 'Gritty', 'Defiant', 'Urban', 'Focused']),
  'g-funk': p('G-Funk combines relaxed West Coast swing, deep bass, bright portamento synth leads and funk-derived melodic ease.', ['Laid-Back', 'Sunny', 'Confident', 'Funky', 'West-Coast', 'Smooth', 'Nostalgic', 'Cruising']),
  'dream pop': p('Dream Pop uses hazy guitar or synth layers, soft rhythm, melodic intimacy and blurred but purposeful atmosphere.', ['Dreamy', 'Ethereal', 'Romantic', 'Nostalgic', 'Intimate', 'Melancholic', 'Soft', 'Atmospheric']),
  'k-pop': p('K-Pop requires high-detail section contrast, precise performance, layered hooks and polished contemporary Korean pop production.', ['Polished', 'Energetic', 'Confident', 'Dramatic', 'Playful', 'Bold', 'Uplifting', 'Cinematic']),
  shoegaze: p('Shoegaze uses layered effected guitars as a harmonic cloud, blended vocals, strong dynamics and immersive noise without losing song form.', ['Ethereal', 'Wall-of-Sound', 'Melancholic', 'Dreamy', 'Cathartic', 'Noisy', 'Romantic', 'Immersive']),
  'post-rock': p('Post-Rock develops instrumental motifs through patient repetition, textural layering, dynamic crescendo and emotionally earned release.', ['Atmospheric', 'Cinematic', 'Cathartic', 'Expansive', 'Melancholic', 'Hopeful', 'Slow-Building', 'Epic']),
  'black metal': p('Black Metal uses tremolo-picked riffing, blast-beat or martial momentum, harsh atmosphere and modal darkness specific to its branch.', ['Frostbitten', 'Dark', 'Ominous', 'Raw', 'Atmospheric', 'Relentless', 'Ritual', 'Desolate']),
  'doom metal': p('Doom Metal uses slow massive riffs, sustained weight, tragic harmony and patient tension rather than speed-driven aggression.', ['Heavy', 'Ominous', 'Melancholic', 'Slow', 'Monolithic', 'Dark', 'Ritual', 'Desolate']),
  'neo soul': p('Neo Soul combines deep pocket, extended harmony, expressive microtiming and intimate organic-electric texture.', ['Soulful', 'Warm', 'Intimate', 'Groovy', 'Reflective', 'Romantic', 'Organic', 'Late-Night']),
  bebop: p('Bebop requires fast interactive swing, angular eighth-note language, rapid harmonic movement and concise improvisational conversation.', ['Virtuosic', 'Swinging', 'Fast', 'Cerebral', 'Playful', 'Intense', 'Urban', 'Adventurous']),
  'jazz fusion': p('Jazz Fusion combines advanced jazz improvisation and extended harmony with the electric power, rhythmic precision and long-form development of funk or rock.', ['Electric', 'Virtuosic', 'Dynamic', 'Groovy', 'Adventurous', 'Sophisticated', 'Futuristic', 'Intense'], {
    instrumentation: 'Rhodes or electric piano, analog or digital synthesizers, articulate electric bass, electric guitar, powerful acoustic drums and optional brass or reeds',
    rhythm: 'tight funk- or rock-informed groove with syncopated bass, interactive drums, metric displacement, odd meters where musical and fluid transitions',
    harmony: 'extended jazz chords, modal interchange, chromatic movement, sophisticated voice leading and thematic improvisation',
    arrangement: 'strong composed theme, developed electric ensemble passages, purposeful virtuosic solos, rhythmic contrast, return and decisive ending'
  }),
  'roots reggae': p('Roots Reggae uses deep bass, one-drop or rockers pulse, skank, spiritual or social gravity and spacious ensemble dialogue.', ['Conscious', 'Deep', 'Spiritual', 'Laid-Back', 'Uplifting', 'Earthy', 'Hypnotic', 'Rebellious']),
  'bossa nova': p('Bossa Nova requires intimate Brazilian restraint, nylon-guitar syncopation and sophisticated harmony, never generic Latin percussion.', ['Intimate', 'Relaxed', 'Elegant', 'Romantic', 'Warm', 'Nostalgic', 'Sunny', 'Sophisticated'], {
    instrumentation: 'nylon-string guitar, soft acoustic bass, understated percussion, light piano and optional restrained woodwind or strings',
    rhythm: 'authentic bossa guitar and percussion pattern with relaxed syncopation, human timing and elegant dynamics',
    harmony: 'rich jazz-influenced chords, smooth voice leading and lyrical melodic phrasing'
  }),
  samba: p('Samba is driven by layered Brazilian percussion, syncopated surdo-centered pulse, communal momentum and melodic rhythmic interplay.', ['Festive', 'Joyful', 'Communal', 'Energetic', 'Proud', 'Rhythmic', 'Sunny', 'Celebratory']),
  tango: p('Tango requires dramatic phrasing, elastic marcato or syncopation, bandoneon-centered color and intense tension-release.', ['Passionate', 'Dramatic', 'Sensual', 'Nostalgic', 'Elegant', 'Tense', 'Romantic', 'Proud']),
  mariachi: p('Mariachi requires violin and trumpet dialogue, vihuela, guitarron, strong vocal or melodic projection and dramatic Mexican phrasing.', ['Proud', 'Festive', 'Heartfelt', 'Dramatic', 'Romantic', 'Triumphant', 'Nostalgic', 'Communal']),
  afrobeat: p('Afrobeat uses extended polyrhythmic groove, interlocking guitars, horns, bass and drums with patient ensemble development.', ['Groovy', 'Political', 'Hypnotic', 'Communal', 'Energetic', 'Proud', 'Raw', 'Funky']),
  afrobeats: p('Afrobeats uses contemporary West African pop rhythm, melodic vocal space, syncopated percussion and polished cross-genre production.', ['Confident', 'Joyful', 'Groovy', 'Romantic', 'Sunny', 'Celebratory', 'Smooth', 'Energetic']),
  highlife: p('Highlife centers bright interlocking guitars, horn or vocal melody, buoyant dance rhythm and elegant West African ensemble phrasing.', ['Joyful', 'Elegant', 'Groovy', 'Sunny', 'Communal', 'Nostalgic', 'Danceable', 'Warm']),
  amapiano: p('Amapiano combines spacious South African house pulse, log-drum bass movement, jazzy keys and patient groove evolution.', ['Deep', 'Groovy', 'Hypnotic', 'Soulful', 'Late-Night', 'Celebratory', 'Urban', 'Smooth']),
  gnawa: p('Gnawa centers guembri bass, qraqeb metal castanets, call-and-response chant and cyclical ritual trance.', ['Ritual', 'Spiritual', 'Hypnotic', 'Earthy', 'Mystical', 'Communal', 'Deep', 'Transcendent']),
  tarab: p('Tarab is an Arabic art-song practice of expressive maqam development, ornamented vocal or instrumental phrasing and emotional intensification.', ['Ecstatic', 'Passionate', 'Regal', 'Dramatic', 'Longing', 'Spiritual', 'Ornate', 'Intimate']),
  'hindustani classical': p('Hindustani Classical music unfolds a raga through alap, measured development and improvisation within tala, with North Indian ornamentation and phrasing.', ['Meditative', 'Expansive', 'Devotional', 'Intense', 'Contemplative', 'Spiritual', 'Majestic', 'Ecstatic']),
  'carnatic classical': p('Carnatic Classical music emphasizes kriti-based or raga-centered form, dense rhythmic calculation, gamaka ornament and South Indian ensemble dialogue.', ['Devotional', 'Intricate', 'Ecstatic', 'Energetic', 'Spiritual', 'Virtuosic', 'Majestic', 'Focused']),
  qawwali: p('Qawwali builds devotional intensity through lead-and-chorus call-and-response, harmonium, handclaps and escalating melodic repetition.', ['Devotional', 'Ecstatic', 'Communal', 'Spiritual', 'Passionate', 'Transcendent', 'Powerful', 'Joyful']),
  enka: p('Enka uses highly expressive Japanese vocal or lead phrasing, pentatonic-inflected melody, dramatic vibrato and nostalgic orchestration.', ['Nostalgic', 'Melancholic', 'Dramatic', 'Heartfelt', 'Elegant', 'Longing', 'Traditional', 'Intimate']),
  gamelan: p('Gamelan is an interlocking tuned-percussion ensemble practice with cyclical form, layered colotomic structure and non-Western tuning.', ['Ceremonial', 'Hypnotic', 'Communal', 'Shimmering', 'Meditative', 'Ritual', 'Intricate', 'Transcendent']),
  bluegrass: p('Bluegrass uses virtuosic acoustic string interplay, high-lonesome melodic language, driving offbeat rhythm and live ensemble precision.', ['Driving', 'Acoustic', 'Joyful', 'Virtuosic', 'Earthy', 'Communal', 'Bright', 'Nostalgic']),
  flamenco: p('Flamenco requires compas discipline, palmas, expressive cante or lead phrasing, rasgueado and tension specific to the selected palo.', ['Passionate', 'Fiery', 'Raw', 'Dramatic', 'Proud', 'Intimate', 'Rhythmic', 'Tragic']),
  fado: p('Fado is intimate Portuguese song of saudade, led by expressive voice or melody, Portuguese guitar and restrained accompaniment.', ['Saudade', 'Melancholic', 'Intimate', 'Nostalgic', 'Poetic', 'Romantic', 'Dramatic', 'Tender']),
  'neapolitan song': p('Neapolitan Song requires cantabile melody, expressive rubato, romantic cadence and authentic southern Italian acoustic color.', ['Passionate', 'Romantic', 'Nostalgic', 'Heartfelt', 'Dramatic', 'Intimate', 'Melancholic', 'Tender'], {
    instrumentation: 'expressive lead with mandolin, classical guitar, piano, lyrical strings and restrained traditional acoustic colors',
    rhythm: 'human song-led phrasing, flexible accents and natural rubato supporting the melody or voice',
    harmony: 'romantic tonal harmony, memorable cantabile melody and expressive cadences'
  }),
  'neomelodico moderno': p('Modern Neapolitan Neomelodic music combines an unmistakable Neapolitan melodic and vocal identity with contemporary pop production, direct emotional storytelling and a large memorable refrain.', ['Passionate', 'Romantic', 'Heartfelt', 'Modern', 'Dramatic', 'Melodic', 'Intense', 'Urban'], {
    instrumentation: 'expressive lead vocal, piano or modern keyboards, lyrical strings, clean electric or acoustic guitar, controlled electronic drums, rounded bass and tasteful contemporary synth layers',
    rhythm: 'modern Italian pop pulse with clear verse-to-chorus lift, natural vocal breathing and restrained Mediterranean rhythmic color',
    harmony: 'emotionally direct tonal harmony, memorable Neapolitan melodic turns, strong cadences and a highly singable refrain',
    arrangement: 'intimate opening, narrative verse, rising pre-chorus, large emotional refrain, contrasting bridge, final vocal climax and resolved ending',
    production: 'current commercial vocal production with warm low end, clear diction, wide strings and synths, controlled brightness and preserved emotional dynamics'
  }),
  'neomelodico pop': p('Neapolitan Neomelodic Pop places contemporary radio-pop form and polish around expressive Neapolitan melody, language and romantic storytelling.', ['Romantic', 'Catchy', 'Emotional', 'Bright', 'Passionate', 'Modern', 'Heartfelt', 'Uplifting']),
  'neomelodico urban': p('Neapolitan Neomelodic Urban blends authentic Neapolitan singing and melodic drama with contemporary urban drums, deep bass and atmospheric pop textures.', ['Urban', 'Passionate', 'Dark', 'Romantic', 'Intense', 'Modern', 'Atmospheric', 'Confident']),
  'neomelodico trap': p('Neapolitan Neomelodic Trap keeps the vocal melody, Neapolitan identity and emotional song narrative primary while using sparse trap drums, 808 bass and modern nocturnal texture.', ['Urban', 'Dark', 'Romantic', 'Melodic', 'Intense', 'Atmospheric', 'Confident', 'Heartfelt']),
  'ballata neomelodica moderna': p('The Modern Neapolitan Neomelodic Ballad is voice-led and emotionally escalating, with piano, strings, intimate verses and a powerful resolved refrain.', ['Heartfelt', 'Romantic', 'Tender', 'Dramatic', 'Melancholic', 'Intimate', 'Passionate', 'Emotional']),
  'duetto neomelodico': p('The Neapolitan Neomelodic Duet uses two clearly distinct singers in dramatic romantic dialogue, alternating perspectives before joining in intentional harmony.', ['Romantic', 'Dramatic', 'Passionate', 'Heartfelt', 'Intimate', 'Powerful', 'Tender', 'Emotional']),
  'classica barocca': p('Baroque Classical music requires period-aware counterpoint, basso-continuo logic, ornamentation, sequence and articulated acoustic phrasing.', ['Ornate', 'Elegant', 'Regal', 'Devotional', 'Energetic', 'Dramatic', 'Structured', 'Radiant']),
  'classica romantica': p('Romantic Classical music develops lyrical themes, chromatic harmony, expressive rubato and broad dynamic narrative with idiomatic acoustic orchestration.', ['Romantic', 'Passionate', 'Majestic', 'Melancholic', 'Dramatic', 'Lyrical', 'Tender', 'Triumphant']),
  'classica contemporanea': p('Contemporary Classical music uses fully composed acoustic or electroacoustic form, modern harmony, extended color and deliberate thematic or textural development.', ['Contemplative', 'Modern', 'Tense', 'Ethereal', 'Dramatic', 'Intellectual', 'Atmospheric', 'Expressive']),
  baroque: p('Baroque music requires period-aware counterpoint, figured-bass logic, sequence, ornamentation and articulated acoustic phrasing.', ['Ornate', 'Elegant', 'Regal', 'Devotional', 'Energetic', 'Dramatic', 'Structured', 'Radiant']),
  'string quartet': p('String Quartet writing requires four independent voices, idiomatic bowing, chamber dialogue and transparent motivic development.', ['Intimate', 'Elegant', 'Tense', 'Lyrical', 'Contemplative', 'Dramatic', 'Refined', 'Expressive']),
  'film score': p('Film Score uses leitmotif, scene-aware pacing, emotional orchestration and narrative development rather than trailer-form cliches.', ['Cinematic', 'Emotional', 'Narrative', 'Atmospheric', 'Dramatic', 'Tender', 'Mysterious', 'Heroic']),
  'trailer music': p('Trailer Music uses compressed narrative escalation, clear edit points, impact architecture and a decisive final payoff.', ['Epic', 'Massive', 'Heroic', 'Tense', 'Dramatic', 'Powerful', 'Suspenseful', 'Triumphant']),
  chiptune: p('Chiptune composes with limited-channel game-console timbres, arpeggiated harmony and energetic melodic counterpoint.', ['Playful', 'Retro', 'Energetic', 'Nostalgic', 'Digital', 'Heroic', 'Bright', 'Adventurous']),
  'musique concrete': p('Musique Concrete organizes recorded real-world sound through editing, transformation, montage and spatial composition.', ['Abstract', 'Textural', 'Unsettling', 'Experimental', 'Cinematic', 'Tactile', 'Curious', 'Spatial'])
};

const PATH_EXACT: Record<string, Patch> = {
  'electronic dance|house|afro house': p('Afro House in the global house context joins a four-on-the-floor club framework with African-rooted percussion and deep contemporary groove.', ['Deep', 'Percussive', 'Hypnotic', 'Spiritual', 'Groovy', 'Organic', 'Warm', 'Driving']),
  'africa|southern african|afro house': p('Southern African Afro House is rooted in regional club practice, deep percussion, local vocal or melodic phrasing and patient dance-floor evolution.', ['Deep', 'Percussive', 'Soulful', 'Hypnotic', 'Spiritual', 'Urban', 'Warm', 'Communal']),
  'hip hop rap|trap|trap soul': p('Trap Soul in the trap context keeps 808 and programmed-drum architecture primary while adding intimate R&B harmony and melodic vocal space.', ['Dark', 'Intimate', 'Melodic', 'Atmospheric', 'Romantic', 'Late-Night', 'Confident', 'Smooth']),
  'r b soul funk|r b|trap soul': p('Trap Soul in the R&B context keeps intimate singing, harmony and emotional pacing primary while borrowing sparse trap drums and 808 weight.', ['Intimate', 'Romantic', 'Late-Night', 'Melancholic', 'Atmospheric', 'Smooth', 'Confident', 'Dark']),
  'electronic dance|dubstep|future garage': p('Future Garage in the post-dubstep context uses ghosted two-step rhythm, deep bass, fragmented voice and diffuse nocturnal atmosphere.', ['Nocturnal', 'Atmospheric', 'Intimate', 'Deep', 'Shuffled', 'Melancholic', 'Ethereal', 'Urban']),
  'electronic dance|uk garage|future garage': p('Future Garage in the UK Garage lineage abstracts two-step swing into spacious percussion, emotional texture and restrained sub bass.', ['Shuffled', 'Ethereal', 'Nocturnal', 'Soulful', 'Deep', 'Atmospheric', 'Intimate', 'Futuristic']),
  'jazz|jazz fusion|ethio jazz': p('Ethio-Jazz in the jazz-fusion context foregrounds Ethiopian modal melody inside a jazz ensemble with improvisation, horns and grounded electric rhythm.', ['Mystical', 'Groovy', 'Sophisticated', 'Soulful', 'Hypnotic', 'Electric', 'Proud', 'Smoky']),
  'africa|horn of africa|ethio jazz': p('Ethio-Jazz in the Horn of Africa context begins with Ethiopian modal identity and cultural lineage, then integrates jazz harmony and ensemble improvisation.', ['Proud', 'Mystical', 'Soulful', 'Hypnotic', 'Melancholic', 'Groovy', 'Spiritual', 'Sophisticated'])
};

const RULES: Rule[] = [
  { id: 'traditional', pattern: /traditional|old school|golden age|classic|early|first wave|medieval|renaissance/i, identity: 'Respect historically grounded instrumentation, performance practice, form and production character for the named era.', moods: ['Authentic', 'Historic', 'Organic', 'Nostalgic'], blockedMoods: ['Futuristic'], priority: 20 },
  { id: 'deep', pattern: /deep/i, identity: 'Favor low-frequency depth, restraint, patient evolution and immersive space over superficial intensity.', moods: ['Deep', 'Hypnotic', 'Nocturnal', 'Atmospheric'], priority: 18 },
  { id: 'minimal', pattern: /minimal|micro|lowercase/i, identity: 'Use economy, negative space and microscopic change; simplicity must remain intentional and finished.', moods: ['Minimal', 'Focused', 'Understated', 'Hypnotic'], blockedMoods: ['Maximal', 'Orchestral'], priority: 18 },
  { id: 'ambient', pattern: /ambient|drone|space|chill|downtempo|dream|mallsoft/i, identity: 'Prioritize spatial texture, slow transformation, restrained transients and immersive depth.', moods: ['Atmospheric', 'Dreamy', 'Meditative', 'Ethereal'], blockedMoods: ['Peak-Time', 'Party'], priority: 16 },
  { id: 'dark', pattern: /dark|horror|death|black|doom|industrial|harsh|funeral|gothic/i, identity: 'Use darker timbre, tension and weight while preserving the exact rhythmic and cultural grammar.', moods: ['Dark', 'Ominous', 'Intense', 'Tense'], blockedMoods: ['Sunny', 'Carefree'], priority: 14 },
  { id: 'hard', pattern: /hard|hardcore|brutal|raw|uptempo|gabber|schranz|deathcore|metalcore/i, identity: 'Increase impact, speed or aggression with controlled transients and physically credible performance.', moods: ['Aggressive', 'Relentless', 'Raw', 'Peak-Time'], blockedMoods: ['Gentle', 'Relaxed'], priority: 14 },
  { id: 'melodic', pattern: /melodic|romantic|lovers|soul|emotional|ballad|cantabile/i, identity: 'Give melody, expressive harmony and emotionally legible phrasing a central role.', moods: ['Emotional', 'Romantic', 'Soulful', 'Warm'], priority: 12 },
  { id: 'progressive', pattern: /progressive|fusion|experimental|avant|post-|art |math|technical|idm/i, identity: 'Develop motifs, form, harmony, meter or timbre beyond the parent genre while keeping a coherent identity.', moods: ['Adventurous', 'Sophisticated', 'Dynamic', 'Experimental'], priority: 12 },
  { id: 'dance', pattern: /funk|disco|boogie|groove|dance|perreo|soca|salsa|jackin/i, identity: 'Make the rhythm section physically compelling, syncopated and precise with a clear dance function.', moods: ['Groovy', 'Energetic', 'Joyful', 'Confident'], priority: 10 },
  { id: 'acoustic', pattern: /acoustic|chamber|string quartet|piano solo|singer-songwriter|folk|bluegrass/i, identity: 'Preserve human articulation, natural room tone, acoustic dynamics and believable performer interaction.', moods: ['Intimate', 'Organic', 'Elegant', 'Reflective'], blockedMoods: ['Synthetic'], priority: 12 },
  { id: 'cinematic', pattern: /epic|trailer|heroic|symphon|orchestral|score|soundtrack|anime opening/i, identity: 'Use thematic orchestration, large-scale dynamic architecture and a clear narrative payoff.', moods: ['Epic', 'Heroic', 'Dramatic', 'Majestic'], priority: 12 },
  { id: 'regional', pattern: /afro|african|latin|brazil|cuban|colomb|mexican|andean|arab|persian|turkish|indian|punjabi|japanese|korean|chinese|mongolian|thai|vietnam|indones|balkan|celtic|italian|french|german|spanish/i, identity: 'Use country- and tradition-specific rhythm, instrumentation, tuning, phrasing and social function; never replace them with a generic global style.', moods: ['Cultural', 'Proud', 'Authentic', 'Expressive'], priority: 8 }
];

function normalize(value: string): string {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' ').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLocaleLowerCase('en-US');
}

function key(family: string, genre: string, subgenre: string): string {
  return `${normalize(family)}|${normalize(genre)}|${normalize(subgenre)}`;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const clean = String(value || '').trim();
    const id = clean.toLocaleLowerCase('en-US');
    if (!clean || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function sentences(values: Array<string | undefined>): string {
  return unique(values.filter(Boolean).map(value => String(value).trim())).map(value => /[.!?]$/.test(value) ? value : `${value}.`).join(' ');
}

function exactFor(family: string, genre: string, subgenre: string): Patch | undefined {
  const housePatch = getHouseStylePatch(family, genre, subgenre);
  if (housePatch) return housePatch;
  const path = PATH_EXACT[key(family, genre, subgenre)];
  if (path) return path;
  const wanted = normalize(subgenre);
  return Object.entries(EXACT).find(([name]) => normalize(name) === wanted)?.[1];
}

function matchingRules(family: string, genre: string, subgenre: string): Rule[] {
  const value = `${family} ${genre} ${subgenre}`;
  return RULES.filter(rule => rule.pattern.test(value)).sort((a, b) => b.priority - a.priority);
}

function moodList(family: string, genre: string, subgenre: string, exact: Patch | undefined, rules: Rule[]): string[] {
  const blocked = new Set(unique([...(exact?.blockedMoods || []), ...rules.flatMap(rule => rule.blockedMoods || [])]).map(value => value.toLocaleLowerCase('en-US')));
  return unique([
    ...(exact?.moods || []),
    ...rules.flatMap(rule => rule.moods || []),
    ...getBaseAtmospheres(family, genre, subgenre),
    'Authentic', 'Expressive', 'Human', 'Professional', 'Focused', 'Dynamic'
  ]).filter(value => !blocked.has(value.toLocaleLowerCase('en-US'))).slice(0, 12);
}

function hash(value: string): string {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return (output >>> 0).toString(16).padStart(8, '0');
}

export function hasCuratedGenreIdentity(genre: string): boolean {
  return Boolean(getHouseStylePatch('Electronic / Dance', 'House', genre)) || hasBaseGenreIdentity(genre);
}

export function getAtmospheresForSelection(family: string, genre: string, subgenre: string): string[] {
  const exact = exactFor(family, genre, subgenre);
  const rules = matchingRules(family, genre, subgenre);
  return moodList(family, genre, subgenre, exact, rules);
}

export function getMusicStyleProfile(family: string, genre: string, subgenre: string): MusicStyleProfile {
  const base = getBaseProfile(family, genre, subgenre);
  const exact = exactFor(family, genre, subgenre);
  const rules = matchingRules(family, genre, subgenre);
  const taxonomyPath = `${family} > ${genre} > ${subgenre}`;
  return {
    identity: sentences([
      `Professional taxonomy path: ${taxonomyPath}. ${subgenre} is a distinct musical vocabulary, not a cosmetic label`,
      exact?.identity,
      ...rules.map(rule => rule.identity),
      base.identity,
      `The documented instrumentation, rhythm, harmony, phrasing, form, cultural context, era and production conventions of ${subgenre} override generic ${genre} habits`
    ]),
    instrumentation: sentences([exact?.instrumentation, ...rules.map(rule => rule.instrumentation), base.instrumentation, `Every sound must have an authentic ${subgenre} role, credible register, articulation and performance behavior`]),
    rhythm: sentences([exact?.rhythm, ...rules.map(rule => rule.rhythm), base.rhythm, `The groove must identify ${subgenre} before melody or production effects are added`]),
    harmony: sentences([exact?.harmony, ...rules.map(rule => rule.harmony), base.harmony, `Do not force generic pop harmony when ${subgenre} requires another modal, tonal, cyclical or texture-based system`]),
    arrangement: sentences([exact?.arrangement, ...rules.map(rule => rule.arrangement), base.arrangement, `Develop ${subgenre} through authentic phrase lengths, transitions and energy behavior, never by repeating an unchanged loop to fill time`]),
    production: sentences([exact?.production, ...rules.map(rule => rule.production), base.production, `The mix and master must preserve the era, acousticness, dynamics and spatial logic of ${subgenre}`]),
    avoid: sentences([exact?.avoid, ...rules.map(rule => rule.avoid), base.avoid, `Do not substitute generic ${family}, generic ${genre}, pop, cinematic underscore or a neighboring subgenre for ${subgenre}`, 'Do not use culturally unrelated instruments, rhythms, tunings, accents or production cliches']),
    moods: moodList(family, genre, subgenre, exact, rules)
  };
}

export function getMusicTaxonomyAudit(family: string, genre: string, subgenre: string): MusicTaxonomyAudit {
  const exact = exactFor(family, genre, subgenre);
  const rules = matchingRules(family, genre, subgenre);
  const profile = getMusicStyleProfile(family, genre, subgenre);
  const taxonomyPath = `${family} > ${genre} > ${subgenre}`;
  return {
    taxonomyPath,
    specificityScore: Math.min(100, 55 + (exact ? 30 : 0) + Math.min(15, rules.length * 4)),
    exactProfile: Boolean(exact),
    matchedRules: rules.map(rule => rule.id),
    fingerprint: hash([taxonomyPath, profile.identity, profile.instrumentation, profile.rhythm, profile.harmony, profile.arrangement, profile.production, profile.moods.join(',')].join('|')),
    atmosphereSignature: profile.moods.slice(0, 8)
  };
}
