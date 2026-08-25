export interface MusicStyleProfile {
  identity: string;
  instrumentation: string;
  rhythm: string;
  harmony: string;
  arrangement: string;
  production: string;
  avoid: string;
  moods: string[];
}

type ProfileCore = Omit<MusicStyleProfile, 'identity' | 'avoid' | 'moods'>;
type SubgenreOverride = Partial<ProfileCore> & {
  identity: string;
  moods?: string[];
};

const FAMILY_PROFILES: Record<string, ProfileCore> = {
  'Electronic / Dance': {
    instrumentation: 'genre-correct electronic drums, bass synthesis, purposeful synth or sampled layers and functional spatial effects',
    rhythm: 'a precise dance-floor pulse with disciplined low-end interaction, detailed percussion and controlled energy movement',
    harmony: 'focused electronic harmony and memorable motifs that support the groove without stylistic drift',
    arrangement: 'a functional intro, progressive build, main section, contrast or breakdown, controlled climax and clean outro',
    production: 'club-capable transients, mono-compatible low end, controlled stereo width and clear automation'
  },
  'Hip-Hop / Rap': {
    instrumentation: 'authoritative drums, a convincing bass foundation, coherent sampled or played musical material and deliberate space for the lead',
    rhythm: 'a humanized pocket with genre-correct swing, clear kick-snare hierarchy and purposeful rhythmic variation',
    harmony: 'compact tonal material and memorable loops that support the vocal or instrumental lead',
    arrangement: 'a concise intro, defined verse and hook contrast, purposeful breaks and a decisive ending',
    production: 'punchy drums, controlled sub bass, present midrange and vocal-ready headroom'
  },
  Pop: {
    instrumentation: 'a polished, hook-focused palette combining contemporary rhythm-section elements with memorable melodic layers',
    rhythm: 'an immediate, accessible pulse with clean transitions, controlled variation and strong chorus lift',
    harmony: 'clear tonal movement, concise motifs and memorable melodic hooks',
    arrangement: 'fast engagement, distinct verses, pre-chorus lift, undeniable chorus, bridge contrast and concise ending',
    production: 'radio-ready clarity, controlled brightness, strong vocal space and consistent translation across devices'
  },
  Rock: {
    instrumentation: 'believable live drums, electric guitars, bass and performance-driven supporting instruments',
    rhythm: 'human drum-and-bass interaction with genre-correct accents, fills and section-to-section dynamics',
    harmony: 'riff-led or chord-led writing with memorable melodic movement and natural performance tension',
    arrangement: 'a performed introduction, developed song sections, contrasting bridge or break, strong climax and natural ending',
    production: 'amp character, live impact, controlled cymbals and energetic but believable dynamics'
  },
  Metal: {
    instrumentation: 'tightly performed distorted guitars, articulate bass, powerful acoustic drums and subgenre-correct supporting textures',
    rhythm: 'precise riff-and-drum synchronization, authoritative accents, convincing double-kick or groove choices and purposeful tempo feel',
    harmony: 'subgenre-correct riff language, tension, modal or chromatic movement and memorable heavy motifs',
    arrangement: 'strong riff exposition, escalation, contrast, breakdown or solo space and a conclusive heavy ending',
    production: 'dense but separated guitars, audible bass, controlled aggression, clear drums and preserved impact'
  },
  'R&B / Soul / Funk': {
    instrumentation: 'expressive bass, pocket-focused drums, rich keys or guitar and tasteful soulful supporting layers',
    rhythm: 'deep human pocket, syncopation, expressive ghost notes and conversational bass-drum interaction',
    harmony: 'extended chords, voice leading, soulful melody and emotionally responsive accompaniment',
    arrangement: 'song-led development, memorable refrain, instrumental responses, dynamic lift and a satisfying close',
    production: 'warm transients, present bass, intimate midrange and polished but musical dynamics'
  },
  Jazz: {
    instrumentation: 'a believable jazz ensemble with natural acoustic or subgenre-required electric tone, clear player separation and conversational interplay',
    rhythm: 'human time, authentic swing or subgenre-specific pulse, expressive accents and interactive comping',
    harmony: 'credible jazz harmony, voice leading, melodic development and improvisational language',
    arrangement: 'a clear head or theme, developed ensemble conversation, purposeful solo space, return and resolved ending',
    production: 'natural dynamics, realistic room depth, preserved articulation and honest ensemble balance'
  },
  Blues: {
    instrumentation: 'expressive guitar or piano, grounded bass, human drums and authentic regional blues colors',
    rhythm: 'a convincing shuffle, straight blues pocket or regional groove with human push and pull',
    harmony: 'blues form, expressive dominant harmony, bends, call-and-response and emotionally direct phrasing',
    arrangement: 'a clear statement, vocal or instrumental exchanges, developed solos and a performed turnaround ending',
    production: 'warm tone, touch-sensitive dynamics, believable room sound and restrained polish'
  },
  'Reggae / Jamaican': {
    instrumentation: 'deep bass, genre-correct drums, offbeat guitar or keys, percussion and Jamaican studio textures',
    rhythm: 'authentic one-drop, steppers, rockers, ska or dancehall placement with spacious interlocking parts',
    harmony: 'concise chord movement, memorable vocal or horn responses and groove-serving melodic language',
    arrangement: 'groove-first development, selective drops, call-and-response, dub-aware space and a complete ending',
    production: 'deep controlled bass, spring or tape-inspired space, selective delay and clear rhythmic separation'
  },
  'Latin America': {
    instrumentation: 'culturally coherent regional percussion, bass, harmonic accompaniment and melodic instruments for the selected style',
    rhythm: 'authentic clave, tumbao, dembow, samba, cumbia or regional dance language as required by the subgenre',
    harmony: 'regionally appropriate harmony, melodic phrasing and call-and-response without generic tropical substitution',
    arrangement: 'layered rhythmic development, memorable main section, dynamic ensemble contrast and a resolved ending',
    production: 'clear percussion hierarchy, defined bass, lively transients and natural or modern spatial treatment appropriate to the style'
  },
  Africa: {
    instrumentation: 'regionally coherent percussion, bass, guitars, keys, voices and traditional instruments specific to the selected subgenre',
    rhythm: 'authentic interlocking rhythmic language, polyrhythmic movement and human dance feel',
    harmony: 'regional melodic modes, cyclical harmony and call-and-response used only where historically appropriate',
    arrangement: 'layered ensemble entrances, rhythmic development, memorable communal or lead section and a natural close',
    production: 'clear interlocking parts, strong but controlled low end and a balance between organic performance and subgenre-correct modern sonics'
  },
  Caribbean: {
    instrumentation: 'island-specific percussion, bass, guitars, keyboards, horns or traditional instruments required by the selected style',
    rhythm: 'authentic Caribbean syncopation and dance feel without collapsing distinct island traditions into one generic groove',
    harmony: 'style-specific chord cycles, melodic hooks and call-and-response',
    arrangement: 'rhythmic introduction, layered ensemble development, memorable refrain, dynamic break and celebratory or resolved ending',
    production: 'lively percussion, deep bass, open mids and spatial treatment faithful to the selected tradition'
  },
  'Middle East / North Africa': {
    instrumentation: 'regionally appropriate strings, winds, percussion, voices and modern instruments for the selected tradition',
    rhythm: 'authentic iqa or regional rhythmic cycles, ornamentation and phrasing where appropriate',
    harmony: 'maqam or tradition-specific modal language, microtonal inflection where required and expressive melodic development',
    arrangement: 'measured introduction, thematic development, ornamented lead passages, dynamic ensemble lift and complete cadence',
    production: 'detailed acoustic timbre, respectful modern integration and preserved modal expression'
  },
  'South Asia': {
    instrumentation: 'tradition-specific melodic instruments, drone, percussion, voices and modern layers only where the subgenre requires them',
    rhythm: 'authentic tala or regional popular groove with correct accents and human phrasing',
    harmony: 'raga-aware or song-specific melodic language, ornamentation and drone relationships without forced Western harmony',
    arrangement: 'alap-like development, cyclical form or popular song structure according to the selected subgenre',
    production: 'clear ornamentation, natural percussion detail and a culturally coherent acoustic-modern balance'
  },
  'East Asia': {
    instrumentation: 'country- and subgenre-specific traditional or contemporary instruments with authentic articulation',
    rhythm: 'style-correct popular, ceremonial or traditional pulse with precise phrasing and accents',
    harmony: 'regional melodic vocabulary and subgenre-appropriate contemporary harmony without generic exoticism',
    arrangement: 'form and energy curve authentic to the selected regional style, with a complete musical ending',
    production: 'clean detail, preserved instrumental character and era-appropriate modern or traditional sonics'
  },
  'Southeast Asia': {
    instrumentation: 'regionally specific ensembles, percussion, tuned instruments, voices or popular-band elements required by the subgenre',
    rhythm: 'authentic interlocking, cyclical or popular groove language with human timing',
    harmony: 'regional tuning, melodic contours and accompaniment practices respected throughout',
    arrangement: 'tradition-specific cyclical development or a coherent regional pop form with a resolved ending',
    production: 'clear ensemble layers, preserved tuning character and culturally coherent spatial depth'
  },
  'Country / Americana': {
    instrumentation: 'acoustic or electric guitars, bass, human drums and subgenre-correct fiddle, banjo, mandolin, pedal steel or piano',
    rhythm: 'a believable country, bluegrass, roots or Americana pocket with natural ensemble timing',
    harmony: 'direct tonal writing, memorable storytelling melody and idiomatic instrumental responses',
    arrangement: 'song-led verses and refrain, tasteful instrumental feature, emotional lift and performed ending',
    production: 'organic transients, intelligible vocal space, warm instruments and era-appropriate polish'
  },
  'Folk / Traditional Europe': {
    instrumentation: 'regionally appropriate acoustic instruments, natural ensemble balance and authentic performance techniques',
    rhythm: 'tradition-specific dance or song pulse, phrasing and accents with human timing',
    harmony: 'culturally coherent modal or tonal language and memorable traditional melodic contour',
    arrangement: 'narrative or dance-led development, instrumental dialogue, dynamic lift and complete acoustic ending',
    production: 'honest acoustic tone, natural room, preserved articulation and minimal artificial gloss'
  },
  'Neomelodica Napoletana': {
    instrumentation: 'expressive lead voice, piano or modern keyboards, lyrical strings, guitar, rounded bass, controlled contemporary drums and tasteful synth layers',
    rhythm: 'song-led modern Italian pop pulse with natural vocal breathing, clear refrain lift and restrained Mediterranean rhythmic color',
    harmony: 'emotionally direct tonal harmony, unmistakable Neapolitan melodic turns, strong cadences and memorable refrains',
    arrangement: 'intimate narrative verse, rising pre-chorus, large emotional refrain, contrasting bridge, final vocal climax and resolved ending',
    production: 'current commercial vocal clarity, warm low end, wide melodic layers and polished dynamics without losing Neapolitan identity'
  },
  'Classical / Art Music': {
    instrumentation: 'credible period- or form-appropriate acoustic forces with realistic articulation, voicing and orchestral balance',
    rhythm: 'score-led timing, expressive rubato and form-appropriate pulse rather than loop-based repetition',
    harmony: 'period- and movement-correct counterpoint, harmony, thematic development and cadential logic',
    arrangement: 'a composed formal arc with motivic development, contrast, climax and fully resolved cadence',
    production: 'realistic concert depth, wide natural dynamics and no pop-style limiting or synthetic orchestral shortcuts'
  },
  'Gospel / Spiritual': {
    instrumentation: 'tradition-correct voices, organ or keys, rhythm section, choir and devotional instruments as appropriate',
    rhythm: 'communal pulse, expressive pushes, claps or devotional cycles specific to the selected style',
    harmony: 'uplifting or contemplative sacred harmony, call-and-response and emotionally purposeful modulation',
    arrangement: 'testimony or devotional build, lead-and-ensemble exchange, collective climax and resolved close',
    production: 'powerful but natural voices, clear ensemble layers and preserved emotional dynamics'
  },
  'Cinematic / Media': {
    instrumentation: 'scene-appropriate orchestral, electronic, hybrid or game-era sound sources with purposeful thematic roles',
    rhythm: 'picture-aware pacing, motif-driven momentum and controlled transitions rather than arbitrary loops',
    harmony: 'clear thematic identity, emotional harmonic direction and tension-release matched to the selected medium',
    arrangement: 'a narrative cue arc with setup, escalation, turning point, climax and usable ending or loop point',
    production: 'wide cinematic depth, controlled impact, detailed automation and clear stems-ready separation'
  },
  'Experimental / Avant-Garde': {
    instrumentation: 'purposefully chosen acoustic, electronic, found-sound or extended-technique sources',
    rhythm: 'intentional pulse, instability, silence or stochastic behavior according to the selected practice',
    harmony: 'a coherent experimental system involving texture, spectrum, tuning, noise or nontraditional form',
    arrangement: 'a deliberate conceptual trajectory with meaningful transformations and a non-accidental ending',
    production: 'high-detail texture, controlled extremes and a clear artistic rationale for every sonic disruption'
  },
  'Easy Listening / Lounge': {
    instrumentation: 'smooth rhythm section, elegant keys or guitar, tasteful orchestral color and restrained melodic features',
    rhythm: 'relaxed, polished pocket with gentle syncopation and unobtrusive movement',
    harmony: 'warm extended harmony, graceful melody and low-friction transitions',
    arrangement: 'immediate atmosphere, subtle development, tasteful feature section and soft resolved ending',
    production: 'silky transients, warm mids, controlled dynamics and spacious but unobtrusive polish'
  },
  'Children / Novelty / Spoken': {
    instrumentation: 'clear, age- or format-appropriate instruments and sound cues that support intelligibility and purpose',
    rhythm: 'simple, memorable pulse or speech-supportive timing with clear repetition and transitions',
    harmony: 'accessible melodic material or minimal underscore aligned with the selected format',
    arrangement: 'clear beginning, easy-to-follow development, repeated anchor and unmistakable ending',
    production: 'excellent intelligibility, safe dynamics, uncluttered spectrum and format-appropriate sound design'
  }
};

const GENRE_SIGNATURES: Record<string, string> = {
  House: 'Four-on-the-floor house architecture, syncopated bass, offbeat hats and groove-led repetition.',
  Techno: 'Machine-focused repetition, evolving timbre, disciplined pulse and tension built through incremental change.',
  Trance: 'Rolling propulsion, arpeggiated or sustained harmony, long tension curves and emotionally decisive releases.',
  'Drum & Bass': 'Fast broken drums, strong sub-bass logic, syncopated edits and high-energy bass-drum conversation.',
  Dubstep: 'Half-time weight, sub pressure, negative space and bass timbre as a compositional voice.',
  'UK Garage': 'Shuffled drums, clipped vocal or chord gestures, elastic bass and distinctly UK swing.',
  Breakbeat: 'Broken-beat momentum, syncopated kick placement and loop variation that never becomes four-on-the-floor house.',
  'Hard Dance': 'High-intensity pulse, hard transient design, forceful bass or kick movement and dramatic energy control.',
  Electro: 'Syncopated drum-machine funk, robotic bass, angular synth motifs and crisp programmed articulation.',
  'Ambient Electronic': 'Texture, space, slow spectral movement and atmosphere take priority over conventional song hooks.',
  'IDM / Experimental Electronic': 'Detailed edits, unusual rhythmic systems, experimental synthesis and deliberate structural surprise.',
  Synthwave: 'Retro synthesizers, drum-machine drive, cinematic nostalgia and 1980s-informed melodic design.',
  'Hip-Hop': 'Beat-led form, strong pocket, sample-aware phrasing and space for rap or an instrumental lead.',
  Trap: 'Programmed hi-hat language, deep 808 movement, sparse harmony and sharp section contrast.',
  Drill: 'Sliding bass, tense minor language, clipped percussion and a cold, forward-driving pocket.',
  'Regional Rap': 'The documented regional drum swing, bass language, sampling and vocal space must define the beat.',
  'Global Rap': 'Rap structure combined with the selected culture’s authentic rhythmic and melodic vocabulary.',
  Pop: 'Immediate hooks, clear tonal storytelling and disciplined verse-to-chorus energy.',
  'Modern Pop': 'Contemporary sound design, concise hooks, bold contrast and current vocal-production space.',
  'Asian Pop': 'High-detail pop arrangement shaped by the exact selected national and subgenre conventions.',
  'European Pop': 'Melodic clarity and production choices tied to the selected European scene rather than generic global pop.',
  'Latin Pop': 'Pop hook discipline integrated with authentic Latin rhythmic and linguistic phrasing.',
  Rock: 'Live-band interaction, guitar-led identity, human dynamics and memorable riffs or chord movement.',
  'Alternative Rock': 'Distinctive guitar texture, non-mainstream song form and expressive dynamic contrast.',
  Punk: 'Direct performance energy, concise harmony, urgent rhythm and an intentionally unpolished human edge.',
  'Rock & Roll': 'Backbeat drive, blues-derived movement, danceable guitar or piano figures and lively ensemble interplay.',
  'Heavy Metal': 'Authoritative riffs, powerful drums, melodic or dramatic weight and classic metal performance language.',
  'Extreme Metal': 'Extreme timbre and intensity controlled by precise subgenre-specific riff, vocal and drum vocabulary.',
  'Modern Metal': 'Tight low-tuned rhythm, contemporary impact and exact alignment between riffs, bass and drums.',
  'R&B': 'Intimate vocal space, deep pocket, modern low end and sophisticated but economical harmony.',
  Soul: 'Emotion-led singing or lead phrasing, warm ensemble responses and gospel- or blues-informed harmony.',
  Funk: 'Interlocking syncopation, bass authority, percussive guitar or keys and strict commitment to the pocket.',
  Jazz: 'Improvisational conversation, sophisticated harmony, human time and a clearly stated thematic identity.',
  'Jazz Fusion': 'Jazz improvisation and extended harmony fused with electric instrumentation, rock or funk rhythm-section power and virtuosic development.',
  'Vocal Jazz': 'The singer’s phrasing, lyric clarity, harmonic interpretation and intimate ensemble response lead the arrangement.',
  Blues: 'Expressive blues phrasing, call-and-response, authentic form and touch-sensitive human timing.',
  Reggae: 'Deep bass, offbeat accompaniment and the exact one-drop, rockers, steppers or modern pulse requested.',
  Dancehall: 'Jamaican riddim logic, vocal space, digital or live groove identity and bass-led movement.',
  Ska: 'Upstroke rhythm, walking or active bass, horn-ready accents and the tempo feel of the selected ska era.',
  Reggaeton: 'Dembow hierarchy, controlled low end, sparse hook space and exact old-school or modern perreo character.',
  Salsa: 'Clave authority, tumbao, interlocking percussion, montuno and call-and-response ensemble development.',
  Cumbia: 'Cumbia’s cyclical dance pulse, regional percussion and melodic instrumentation specific to the selected tradition.',
  Brazilian: 'The precise Brazilian groove, Portuguese-informed phrasing and regional instrumentation of the selected subgenre.',
  'Caribbean Latin': 'The exact island-derived dance rhythm, percussion and ensemble vocabulary of the selected style.',
  'Mexican / Regional': 'Region-specific acoustic or amplified ensemble, vocal storytelling and authentic dance or corrido pulse.',
  'South American': 'Country- and tradition-specific rhythmic, melodic and instrumental language without pan-Latin generalization.',
  'West African': 'Interlocking rhythm, guitar or keyboard cycles, call-and-response and the selected West African groove lineage.',
  'Southern African': 'The exact township, club or traditional groove, bass logic and percussion language of the selected scene.',
  'Central / East African': 'Region-specific guitar cycles, percussion, bass and dance phrasing with authentic ensemble motion.',
  'North African': 'Maghrebi or Egyptian modal phrasing, regional percussion and the selected acoustic-modern balance.',
  'Horn of Africa': 'Horn-specific modal melody, rhythmic phrasing and instrumentation, especially the selected Ethiopian, Somali or Eritrean tradition.',
  'Francophone African': 'The selected Francophone scene’s exact guitar, percussion, bass, vocal and dance-arrangement language.',
  Caribbean: 'The selected island tradition determines percussion, bass, tempo feel, language and ensemble behavior.',
  'Arabic Music': 'Maqam-aware melody, ornamentation, regional percussion and form appropriate to the exact Arabic subgenre.',
  'Persian Music': 'Persian modal and melodic phrasing, ornamentation and instrumentation appropriate to classical or modern context.',
  'Turkish Music': 'Turkish modal color, ornamented melody, rhythmic cycles and exact folk, classical or popular instrumentation.',
  'Israeli / Hebrew': 'The selected Hebrew, Mizrahi or Mediterranean tradition defines rhythm, melody, instrumentation and vocal phrasing.',
  'Indian Classical': 'Raga development, tala discipline, drone relationship and authentic improvisational grammar.',
  'Indian Popular': 'Indian melodic and rhythmic identity integrated with the exact film, pop, bhangra, hip-hop or electronic format.',
  'South Asian Folk': 'Tradition-specific vocal delivery, percussion, melodic instruments and ceremonial or narrative form.',
  'Pakistan / Bangladesh / Sri Lanka': 'Country-specific popular or traditional phrasing, rhythm and instrumentation without generic South Asian substitution.',
  Japanese: 'The exact Japanese popular or traditional style determines form, melody, harmony, instrumentation and production era.',
  Korean: 'The selected Korean scene’s arrangement density, rhythm, vocal space and production conventions lead.',
  Chinese: 'The selected Chinese-language or traditional scene defines melodic contour, instrumentation, form and production.',
  Mongolian: 'Mongolian rhythmic, modal and vocal or instrumental identity is explicit and culturally specific.',
  'Southeast Asian Popular': 'Country-specific popular groove, language-aware melody and authentic local instrumentation or production.',
  'Traditional Southeast Asia': 'Traditional tuning, ensemble roles, cyclical form and performance technique take priority over Western defaults.',
  Country: 'Story-led song form, idiomatic string instruments, human pocket and exact country-era production.',
  Americana: 'Roots-oriented acoustic ensemble, narrative depth, organic dynamics and regional American character.',
  'European Folk': 'The selected European tradition’s exact instruments, meters, modes, ornamentation and social function lead.',
  'Contemporary Folk': 'Songwriting intimacy and organic instruments shaped by the exact indie, progressive or experimental folk subgenre.',
  'Neomelodica Napoletana Moderna': 'Authentic Neapolitan language, emotionally direct melody and dramatic vocal storytelling shaped with contemporary pop or urban production.',
  'Canzone Napoletana Contemporanea': 'Modern songwriting and production built around unmistakable Neapolitan melody, diction, romantic expression and Mediterranean musical character.',
  'Musica Classica': 'Historically and stylistically correct acoustic composition, counterpoint, orchestration, articulation and formal development for the selected period.',
  'Western Classical': 'Period-correct harmony, counterpoint, articulation, form and acoustic instrumentation.',
  'Orchestral / Chamber': 'Realistic ensemble voicing, motivic development and formal balance appropriate to the exact forces.',
  Opera: 'Dramatic vocal writing, language-aware phrasing, orchestral support and the selected operatic period or form.',
  Gospel: 'Lead-and-choir exchange, sacred emotional build, organ or rhythm-section support and authentic gospel harmony.',
  'Spiritual / Devotional': 'The exact faith tradition determines text treatment, melodic mode, instruments, repetition and devotional intensity.',
  Soundtrack: 'Narrative theme, scene-aware pacing, emotional orchestration and a usable cinematic cue shape.',
  'Game Music': 'Interactive-feeling thematic design, era-appropriate sound palette and a clear loop or gameplay arc.',
  'Anime / Media': 'Japanese media-song or score conventions, high-impact thematic identity and exact opening, ending or underscore form.',
  Experimental: 'A defined compositional concept controls sound source, structure, silence, texture and transformation.',
  'Easy Listening': 'Elegant, unobtrusive melody, smooth harmony and polished low-intensity arrangement.',
  Children: 'Age-appropriate melody, repetition, rhythm, vocabulary and safe, clear production.',
  'Spoken / Novelty': 'Speech or concept remains intelligible and structurally central, with music serving the selected format.'
};

const FAMILY_MOODS: Record<string, string[]> = {
  'Electronic / Dance': ['Energetic', 'Hypnotic', 'Driving', 'Euphoric', 'Dark', 'Groovy', 'Futuristic', 'Atmospheric'],
  'Hip-Hop / Rap': ['Confident', 'Gritty', 'Dark', 'Reflective', 'Aggressive', 'Laid-Back', 'Triumphant', 'Atmospheric'],
  Pop: ['Uplifting', 'Emotional', 'Energetic', 'Romantic', 'Bright', 'Nostalgic', 'Dreamy', 'Confident'],
  Rock: ['Energetic', 'Raw', 'Anthemic', 'Rebellious', 'Emotional', 'Dark', 'Nostalgic', 'Driving'],
  Metal: ['Aggressive', 'Dark', 'Epic', 'Intense', 'Ominous', 'Melancholic', 'Triumphant', 'Atmospheric'],
  'R&B / Soul / Funk': ['Soulful', 'Warm', 'Groovy', 'Intimate', 'Romantic', 'Confident', 'Smooth', 'Emotional'],
  Jazz: ['Sophisticated', 'Swinging', 'Intimate', 'Adventurous', 'Soulful', 'Smoky', 'Playful', 'Late-Night'],
  Blues: ['Soulful', 'Raw', 'Melancholic', 'Earthy', 'Defiant', 'Intimate', 'Smoky', 'Driving'],
  'Reggae / Jamaican': ['Laid-Back', 'Uplifting', 'Deep', 'Conscious', 'Romantic', 'Sunny', 'Rebellious', 'Hypnotic'],
  'Latin America': ['Passionate', 'Festive', 'Romantic', 'Energetic', 'Sensual', 'Nostalgic', 'Proud', 'Dramatic'],
  Africa: ['Celebratory', 'Groovy', 'Spiritual', 'Energetic', 'Communal', 'Hypnotic', 'Soulful', 'Proud'],
  Caribbean: ['Festive', 'Sunny', 'Romantic', 'Energetic', 'Laid-Back', 'Joyful', 'Sensual', 'Communal'],
  'Middle East / North Africa': ['Passionate', 'Mystical', 'Dramatic', 'Romantic', 'Celebratory', 'Spiritual', 'Melancholic', 'Regal'],
  'South Asia': ['Devotional', 'Joyful', 'Romantic', 'Meditative', 'Celebratory', 'Dramatic', 'Spiritual', 'Energetic'],
  'East Asia': ['Elegant', 'Energetic', 'Nostalgic', 'Dramatic', 'Dreamy', 'Playful', 'Serene', 'Heroic'],
  'Southeast Asia': ['Ceremonial', 'Joyful', 'Meditative', 'Romantic', 'Festive', 'Nostalgic', 'Playful', 'Serene'],
  'Country / Americana': ['Heartfelt', 'Nostalgic', 'Earthy', 'Hopeful', 'Melancholic', 'Rebellious', 'Warm', 'Reflective'],
  'Folk / Traditional Europe': ['Authentic', 'Earthy', 'Nostalgic', 'Festive', 'Melancholic', 'Romantic', 'Communal', 'Mystical'],
  'Neomelodica Napoletana': ['Passionate', 'Romantic', 'Heartfelt', 'Dramatic', 'Melodic', 'Modern', 'Intense', 'Urban'],
  'Classical / Art Music': ['Elegant', 'Dramatic', 'Serene', 'Majestic', 'Melancholic', 'Triumphant', 'Contemplative', 'Tense'],
  'Gospel / Spiritual': ['Uplifting', 'Devotional', 'Joyful', 'Powerful', 'Hopeful', 'Spiritual', 'Reflective', 'Triumphant'],
  'Cinematic / Media': ['Epic', 'Dramatic', 'Suspenseful', 'Emotional', 'Heroic', 'Mysterious', 'Atmospheric', 'Tender'],
  'Experimental / Avant-Garde': ['Abstract', 'Unsettling', 'Curious', 'Tense', 'Meditative', 'Chaotic', 'Futuristic', 'Minimal'],
  'Easy Listening / Lounge': ['Relaxed', 'Elegant', 'Warm', 'Romantic', 'Nostalgic', 'Dreamy', 'Sophisticated', 'Sunny'],
  'Children / Novelty / Spoken': ['Playful', 'Cheerful', 'Gentle', 'Curious', 'Educational', 'Funny', 'Imaginative', 'Comforting']
};

const GENRE_MOODS: Record<string, string[]> = {
  House: ['Groovy', 'Hypnotic', 'Warm', 'Driving', 'Uplifting', 'Deep', 'Late-Night', 'Soulful'],
  Techno: ['Hypnotic', 'Driving', 'Dark', 'Industrial', 'Futuristic', 'Raw', 'Peak-Time', 'Deep'],
  Trance: ['Euphoric', 'Uplifting', 'Dreamy', 'Emotional', 'Hypnotic', 'Cosmic', 'Driving', 'Melodic'],
  'Drum & Bass': ['Energetic', 'Futuristic', 'Dark', 'Liquid', 'Aggressive', 'Atmospheric', 'Driving', 'Euphoric'],
  Dubstep: ['Dark', 'Heavy', 'Futuristic', 'Aggressive', 'Atmospheric', 'Melodic', 'Tense', 'Deep'],
  'UK Garage': ['Shuffled', 'Urban', 'Soulful', 'Energetic', 'Late-Night', 'Playful', 'Deep', 'Futuristic'],
  Breakbeat: ['Energetic', 'Funky', 'Driving', 'Raw', 'Futuristic', 'Playful', 'Dark', 'Progressive'],
  'Hard Dance': ['Intense', 'Euphoric', 'Aggressive', 'Peak-Time', 'Dark', 'Triumphant', 'Relentless', 'Energetic'],
  Electro: ['Funky', 'Robotic', 'Futuristic', 'Energetic', 'Playful', 'Urban', 'Dark', 'Retro'],
  'Ambient Electronic': ['Atmospheric', 'Meditative', 'Dreamy', 'Serene', 'Dark', 'Cosmic', 'Introspective', 'Ethereal'],
  'IDM / Experimental Electronic': ['Abstract', 'Futuristic', 'Glitchy', 'Playful', 'Unsettling', 'Cerebral', 'Dreamy', 'Chaotic'],
  Synthwave: ['Nostalgic', 'Cinematic', 'Driving', 'Neon', 'Dark', 'Dreamy', 'Heroic', 'Romantic'],
  'Hip-Hop': ['Confident', 'Laid-Back', 'Gritty', 'Reflective', 'Triumphant', 'Dark', 'Soulful', 'Raw'],
  Trap: ['Dark', 'Confident', 'Aggressive', 'Atmospheric', 'Melodic', 'Luxurious', 'Intense', 'Ethereal'],
  Drill: ['Menacing', 'Cold', 'Aggressive', 'Dark', 'Tense', 'Gritty', 'Melodic', 'Defiant'],
  'Regional Rap': ['Authentic', 'Confident', 'Gritty', 'Proud', 'Laid-Back', 'Energetic', 'Dark', 'Soulful'],
  'Global Rap': ['Proud', 'Energetic', 'Confident', 'Cultural', 'Dark', 'Melodic', 'Defiant', 'Celebratory'],
  Pop: ['Uplifting', 'Emotional', 'Romantic', 'Energetic', 'Bright', 'Nostalgic', 'Confident', 'Dreamy'],
  'Modern Pop': ['Bold', 'Futuristic', 'Emotional', 'Playful', 'Dark', 'Intimate', 'Energetic', 'Experimental'],
  'Asian Pop': ['Energetic', 'Polished', 'Romantic', 'Playful', 'Dramatic', 'Dreamy', 'Bold', 'Uplifting'],
  'European Pop': ['Melodic', 'Uplifting', 'Romantic', 'Nostalgic', 'Elegant', 'Energetic', 'Dramatic', 'Bright'],
  'Latin Pop': ['Romantic', 'Passionate', 'Energetic', 'Sunny', 'Sensual', 'Uplifting', 'Nostalgic', 'Confident'],
  Rock: ['Energetic', 'Anthemic', 'Raw', 'Driving', 'Nostalgic', 'Rebellious', 'Emotional', 'Triumphant'],
  'Alternative Rock': ['Introspective', 'Raw', 'Dreamy', 'Melancholic', 'Rebellious', 'Atmospheric', 'Dark', 'Cathartic'],
  Punk: ['Rebellious', 'Urgent', 'Raw', 'Aggressive', 'Defiant', 'Energetic', 'Chaotic', 'Anthemic'],
  'Rock & Roll': ['Joyful', 'Energetic', 'Playful', 'Rebellious', 'Danceable', 'Retro', 'Driving', 'Carefree'],
  'Heavy Metal': ['Powerful', 'Epic', 'Aggressive', 'Triumphant', 'Dark', 'Dramatic', 'Anthemic', 'Driving'],
  'Extreme Metal': ['Brutal', 'Dark', 'Ominous', 'Aggressive', 'Chaotic', 'Atmospheric', 'Relentless', 'Desolate'],
  'Modern Metal': ['Intense', 'Aggressive', 'Futuristic', 'Dark', 'Tense', 'Groovy', 'Atmospheric', 'Cathartic'],
  'R&B': ['Intimate', 'Smooth', 'Romantic', 'Atmospheric', 'Confident', 'Melancholic', 'Sensual', 'Late-Night'],
  Soul: ['Soulful', 'Warm', 'Emotional', 'Uplifting', 'Romantic', 'Powerful', 'Intimate', 'Joyful'],
  Funk: ['Groovy', 'Playful', 'Energetic', 'Confident', 'Sexy', 'Joyful', 'Raw', 'Celebratory'],
  Jazz: ['Sophisticated', 'Swinging', 'Intimate', 'Playful', 'Smoky', 'Adventurous', 'Soulful', 'Late-Night'],
  'Jazz Fusion': ['Electric', 'Virtuosic', 'Dynamic', 'Groovy', 'Adventurous', 'Sophisticated', 'Futuristic', 'Intense'],
  'Vocal Jazz': ['Intimate', 'Romantic', 'Elegant', 'Warm', 'Smoky', 'Nostalgic', 'Playful', 'Soulful'],
  Blues: ['Soulful', 'Raw', 'Melancholic', 'Earthy', 'Defiant', 'Intimate', 'Smoky', 'Driving'],
  Reggae: ['Laid-Back', 'Uplifting', 'Deep', 'Conscious', 'Romantic', 'Sunny', 'Rebellious', 'Hypnotic'],
  Dancehall: ['Energetic', 'Confident', 'Party', 'Gritty', 'Sensual', 'Dark', 'Playful', 'Triumphant'],
  Ska: ['Upbeat', 'Joyful', 'Energetic', 'Rebellious', 'Playful', 'Brassy', 'Nostalgic', 'Driving'],
  Reggaeton: ['Sensual', 'Confident', 'Party', 'Romantic', 'Dark', 'Energetic', 'Urban', 'Intense'],
  Salsa: ['Festive', 'Passionate', 'Energetic', 'Romantic', 'Joyful', 'Dramatic', 'Proud', 'Danceable'],
  Cumbia: ['Festive', 'Danceable', 'Nostalgic', 'Joyful', 'Romantic', 'Earthy', 'Hypnotic', 'Communal'],
  Brazilian: ['Joyful', 'Relaxed', 'Soulful', 'Festive', 'Romantic', 'Groovy', 'Nostalgic', 'Sunny'],
  'Caribbean Latin': ['Passionate', 'Festive', 'Romantic', 'Danceable', 'Joyful', 'Sensual', 'Dramatic', 'Nostalgic'],
  'Mexican / Regional': ['Proud', 'Heartfelt', 'Festive', 'Romantic', 'Defiant', 'Nostalgic', 'Dramatic', 'Earthy'],
  'South American': ['Passionate', 'Nostalgic', 'Earthy', 'Festive', 'Romantic', 'Proud', 'Dramatic', 'Communal'],
  'West African': ['Groovy', 'Celebratory', 'Communal', 'Hypnotic', 'Joyful', 'Soulful', 'Proud', 'Energetic'],
  'Southern African': ['Deep', 'Groovy', 'Energetic', 'Hypnotic', 'Celebratory', 'Urban', 'Soulful', 'Raw'],
  'Central / East African': ['Danceable', 'Joyful', 'Energetic', 'Communal', 'Hypnotic', 'Proud', 'Romantic', 'Celebratory'],
  'North African': ['Passionate', 'Mystical', 'Celebratory', 'Dramatic', 'Raw', 'Spiritual', 'Urban', 'Melancholic'],
  'Horn of Africa': ['Soulful', 'Mystical', 'Proud', 'Melancholic', 'Groovy', 'Spiritual', 'Nostalgic', 'Celebratory'],
  'Francophone African': ['Energetic', 'Celebratory', 'Groovy', 'Proud', 'Joyful', 'Urban', 'Communal', 'Danceable'],
  Caribbean: ['Festive', 'Sunny', 'Romantic', 'Energetic', 'Laid-Back', 'Joyful', 'Sensual', 'Communal'],
  'Arabic Music': ['Passionate', 'Mystical', 'Dramatic', 'Romantic', 'Celebratory', 'Spiritual', 'Melancholic', 'Regal'],
  'Persian Music': ['Elegant', 'Melancholic', 'Romantic', 'Mystical', 'Dramatic', 'Reflective', 'Passionate', 'Nostalgic'],
  'Turkish Music': ['Passionate', 'Dramatic', 'Melancholic', 'Festive', 'Romantic', 'Mystical', 'Proud', 'Nostalgic'],
  'Israeli / Hebrew': ['Celebratory', 'Romantic', 'Spiritual', 'Energetic', 'Nostalgic', 'Proud', 'Melancholic', 'Communal'],
  'Indian Classical': ['Meditative', 'Devotional', 'Serene', 'Intense', 'Spiritual', 'Majestic', 'Contemplative', 'Ecstatic'],
  'Indian Popular': ['Romantic', 'Energetic', 'Dramatic', 'Joyful', 'Festive', 'Emotional', 'Heroic', 'Playful'],
  'South Asian Folk': ['Devotional', 'Earthy', 'Celebratory', 'Romantic', 'Spiritual', 'Communal', 'Melancholic', 'Joyful'],
  'Pakistan / Bangladesh / Sri Lanka': ['Romantic', 'Proud', 'Energetic', 'Nostalgic', 'Soulful', 'Festive', 'Dramatic', 'Joyful'],
  Japanese: ['Elegant', 'Energetic', 'Nostalgic', 'Dramatic', 'Dreamy', 'Playful', 'Serene', 'Heroic'],
  Korean: ['Polished', 'Energetic', 'Romantic', 'Dramatic', 'Confident', 'Dreamy', 'Playful', 'Intense'],
  Chinese: ['Elegant', 'Romantic', 'Heroic', 'Serene', 'Nostalgic', 'Dramatic', 'Proud', 'Energetic'],
  Mongolian: ['Epic', 'Earthy', 'Spiritual', 'Proud', 'Vast', 'Raw', 'Heroic', 'Meditative'],
  'Southeast Asian Popular': ['Joyful', 'Romantic', 'Energetic', 'Nostalgic', 'Playful', 'Festive', 'Dreamy', 'Dramatic'],
  'Traditional Southeast Asia': ['Ceremonial', 'Meditative', 'Mystical', 'Serene', 'Communal', 'Dramatic', 'Spiritual', 'Hypnotic'],
  Country: ['Heartfelt', 'Nostalgic', 'Hopeful', 'Rebellious', 'Romantic', 'Earthy', 'Melancholic', 'Upbeat'],
  Americana: ['Earthy', 'Reflective', 'Nostalgic', 'Warm', 'Melancholic', 'Hopeful', 'Intimate', 'Haunting'],
  'European Folk': ['Authentic', 'Earthy', 'Nostalgic', 'Festive', 'Melancholic', 'Romantic', 'Communal', 'Mystical'],
  'Contemporary Folk': ['Intimate', 'Reflective', 'Organic', 'Melancholic', 'Hopeful', 'Dreamy', 'Earthy', 'Experimental'],
  'Neomelodica Napoletana Moderna': ['Passionate', 'Romantic', 'Heartfelt', 'Modern', 'Dramatic', 'Melodic', 'Intense', 'Urban'],
  'Canzone Napoletana Contemporanea': ['Romantic', 'Heartfelt', 'Modern', 'Mediterranean', 'Passionate', 'Melodic', 'Warm', 'Dramatic'],
  'Musica Classica': ['Elegant', 'Dramatic', 'Serene', 'Majestic', 'Melancholic', 'Triumphant', 'Contemplative', 'Tense'],
  'Western Classical': ['Elegant', 'Dramatic', 'Serene', 'Majestic', 'Melancholic', 'Triumphant', 'Contemplative', 'Tense'],
  'Orchestral / Chamber': ['Majestic', 'Intimate', 'Dramatic', 'Elegant', 'Tense', 'Tender', 'Triumphant', 'Contemplative'],
  Opera: ['Dramatic', 'Passionate', 'Tragic', 'Romantic', 'Regal', 'Comic', 'Heroic', 'Intense'],
  Gospel: ['Uplifting', 'Joyful', 'Powerful', 'Hopeful', 'Soulful', 'Devotional', 'Triumphant', 'Communal'],
  'Spiritual / Devotional': ['Devotional', 'Meditative', 'Spiritual', 'Serene', 'Ecstatic', 'Reflective', 'Hopeful', 'Communal'],
  Soundtrack: ['Epic', 'Dramatic', 'Suspenseful', 'Emotional', 'Heroic', 'Mysterious', 'Atmospheric', 'Tender'],
  'Game Music': ['Adventurous', 'Heroic', 'Tense', 'Playful', 'Mysterious', 'Epic', 'Atmospheric', 'Triumphant'],
  'Anime / Media': ['Energetic', 'Heroic', 'Emotional', 'Playful', 'Dramatic', 'Dreamy', 'Epic', 'Romantic'],
  Experimental: ['Abstract', 'Unsettling', 'Curious', 'Tense', 'Meditative', 'Chaotic', 'Futuristic', 'Minimal'],
  'Easy Listening': ['Relaxed', 'Elegant', 'Warm', 'Romantic', 'Nostalgic', 'Dreamy', 'Sophisticated', 'Sunny'],
  Children: ['Playful', 'Cheerful', 'Gentle', 'Curious', 'Educational', 'Imaginative', 'Comforting', 'Joyful'],
  'Spoken / Novelty': ['Witty', 'Dramatic', 'Playful', 'Intimate', 'Satirical', 'Mysterious', 'Educational', 'Theatrical']
};

const SUBGENRE_OVERRIDES: Record<string, SubgenreOverride> = {
  'tech house': {
    identity: 'Tech House must be a stripped, groove-dominant club tool: short bass phrases, shuffled percussion, restrained stabs and DJ-functional tension.',
    instrumentation: 'tight electronic drums, a short punchy kick, elastic mono bass, syncopated percussion, restrained synth stabs and functional club effects',
    rhythm: 'locked four-on-the-floor with disciplined kick-bass interaction, shuffled hats, concise fills and controlled forward motion',
    harmony: 'minimal repetitive harmony with small timbral changes that never distract from the groove',
    arrangement: 'DJ-friendly intro, gradual groove build, main drop, tension breakdown, stronger return and clean mixable outro',
    moods: ['Groovy', 'Driving', 'Hypnotic', 'Underground', 'Dark', 'Peak-Time', 'Raw', 'Minimal']
  },
  'deep house': {
    identity: 'Deep House must feel warm, spacious, soulful and hypnotic rather than aggressive or festival-sized.',
    instrumentation: 'rounded deep bass, warm electric piano or organ chords, soft defined house drums, subtle pads, restrained motifs and spacious effects',
    rhythm: 'steady four-on-the-floor with a warm pocket, lightly syncopated percussion and smooth bass movement',
    harmony: 'soulful extended chords, gentle voice leading and understated melodic language',
    arrangement: 'spacious intro, gradual layering, emotionally focused main section, restrained breakdown, warm final lift and clean outro',
    moods: ['Deep', 'Warm', 'Hypnotic', 'Soulful', 'Late-Night', 'Atmospheric', 'Intimate', 'Groovy']
  },
  'boom bap': {
    identity: 'Boom Bap requires a hard kick-snare conversation, dusty human swing and loop-focused head-nod authority.',
    instrumentation: 'hard kick and snare, dusty chopped drums, grounded bass, coherent sample-like phrases and sparse supporting textures',
    rhythm: 'convincing head-nod pocket with human swing, authoritative backbeat, ghost notes and deliberate space',
    moods: ['Gritty', 'Confident', 'Raw', 'Nostalgic', 'Soulful', 'Laid-Back', 'Street', 'Defiant']
  },
  'bossa nova': {
    identity: 'Bossa Nova requires intimate Brazilian restraint, nylon-guitar syncopation and sophisticated harmony, never generic Latin percussion.',
    instrumentation: 'nylon-string guitar, soft acoustic bass, understated percussion, light piano and optional restrained woodwind or strings',
    rhythm: 'authentic bossa guitar and percussion pattern with relaxed syncopation, human timing and elegant dynamics',
    harmony: 'rich jazz-influenced chords, smooth voice leading and lyrical melodic phrasing',
    arrangement: 'intimate introduction, clear melodic statement, subtle development, tasteful contrast and natural acoustic ending',
    moods: ['Intimate', 'Relaxed', 'Elegant', 'Romantic', 'Warm', 'Nostalgic', 'Sunny', 'Sophisticated']
  },
  'neapolitan song': {
    identity: 'Neapolitan Song requires cantabile melody, expressive rubato, romantic cadence and authentic southern Italian acoustic color.',
    instrumentation: 'expressive lead with mandolin, classical guitar, piano, lyrical strings and restrained traditional acoustic colors',
    rhythm: 'human song-led phrasing, flexible accents and natural rubato supporting the melody or voice',
    harmony: 'romantic tonal harmony, memorable cantabile melody and expressive cadences',
    arrangement: 'intimate opening, narrative verse, stronger refrain, controlled climax and resolved acoustic conclusion',
    moods: ['Passionate', 'Romantic', 'Nostalgic', 'Heartfelt', 'Dramatic', 'Intimate', 'Melancholic', 'Tender']
  },
  'jazz fusion': {
    identity: 'Jazz Fusion must combine advanced jazz improvisation and extended harmony with the electric power, rhythmic precision and long-form development of funk or rock.',
    instrumentation: 'Rhodes or electric piano, analog or digital synthesizers, articulate electric bass, electric guitar, powerful acoustic drums and optional brass or reeds',
    rhythm: 'tight funk- or rock-informed groove with syncopated bass, interactive drums, metric displacement, odd meters where musical and fluid transitions',
    harmony: 'extended jazz chords, modal interchange, chromatic movement, sophisticated voice leading and thematic improvisation',
    arrangement: 'strong composed theme, developed electric ensemble passages, purposeful virtuosic solos, rhythmic contrast, return and decisive ending',
    production: 'wide but coherent electric ensemble, articulate bass, present drums, controlled guitar and keyboard layers and preserved solo dynamics',
    moods: ['Electric', 'Virtuosic', 'Dynamic', 'Groovy', 'Adventurous', 'Sophisticated', 'Futuristic', 'Intense']
  },
  'jazz-funk': {
    identity: 'Jazz-Funk prioritizes an unbreakable funk pocket while retaining jazz harmony, horn or keyboard sophistication and improvisational development.',
    instrumentation: 'electric bass, tight drums, clavinet or Rhodes, clean rhythmic guitar, horns and selective synthesizer color',
    rhythm: 'deep syncopated funk pocket with ghost notes, active bass, precise ensemble hits and human swing',
    moods: ['Groovy', 'Electric', 'Confident', 'Playful', 'Sophisticated', 'Energetic', 'Urban', 'Joyful']
  },
  'acid jazz': {
    identity: 'Acid Jazz blends jazz harmony and live funk or soul musicianship with club-era groove, sampling awareness and urban polish.',
    instrumentation: 'Rhodes, organ, live bass, breakbeat-aware drums, funk guitar, horns and restrained sample or turntable textures',
    rhythm: 'danceable funk-soul pocket with breakbeat influence and live human interaction',
    moods: ['Groovy', 'Urban', 'Soulful', 'Sophisticated', 'Late-Night', 'Confident', 'Warm', 'Energetic']
  },
  'nu jazz': {
    identity: 'Nu Jazz reframes improvisation and jazz harmony through contemporary electronic rhythm, sampling and sound design.',
    instrumentation: 'acoustic jazz lead instruments integrated with electronic drums, synthesis, sampled texture and processed keys',
    rhythm: 'broken or programmed contemporary groove with enough human elasticity for improvisational dialogue',
    moods: ['Futuristic', 'Sophisticated', 'Atmospheric', 'Groovy', 'Experimental', 'Late-Night', 'Urban', 'Dreamy']
  },
  'electro jazz': {
    identity: 'Electro Jazz makes electronic sound design and programmed rhythm equal partners with credible jazz improvisation and harmony.',
    instrumentation: 'synthesizers, drum machines, electric keys, processed brass or reeds and articulate electric bass',
    moods: ['Electric', 'Futuristic', 'Groovy', 'Sophisticated', 'Atmospheric', 'Dynamic', 'Urban', 'Experimental']
  },
  'smooth jazz': {
    identity: 'Smooth Jazz requires lyrical lead phrasing, polished contemporary harmony and a relaxed pocket without fusion aggression or free-jazz abstraction.',
    instrumentation: 'lyrical saxophone or guitar lead, polished electric piano, restrained bass, soft drums and smooth supporting pads',
    rhythm: 'relaxed contemporary pocket with clean backbeat, gentle syncopation and no harsh accents',
    moods: ['Smooth', 'Relaxed', 'Romantic', 'Warm', 'Elegant', 'Late-Night', 'Sunny', 'Intimate']
  },
  'latin jazz': {
    identity: 'Latin Jazz must unite authentic Latin percussion and clave with jazz harmony, ensemble hits and improvisation.',
    instrumentation: 'piano, bass, drums, congas, timbales, bongos, brass or reeds with culturally correct percussion roles',
    rhythm: 'clave-led interaction, tumbao, cascara or style-specific Latin pulse supporting jazz improvisation',
    moods: ['Fiery', 'Sophisticated', 'Festive', 'Passionate', 'Groovy', 'Energetic', 'Dynamic', 'Joyful']
  },
  'afro-cuban jazz': {
    identity: 'Afro-Cuban Jazz requires explicit clave alignment, tumbao, layered Cuban percussion, jazz voicings and interactive solos.',
    instrumentation: 'piano, upright or electric bass, congas, timbales, bongos, drum kit and brass or reed section',
    rhythm: '2-3 or 3-2 clave-consistent groove with tumbao and interlocking percussion',
    moods: ['Fiery', 'Festive', 'Sophisticated', 'Energetic', 'Passionate', 'Groovy', 'Proud', 'Dynamic']
  },
  'ethio-jazz': {
    identity: 'Ethio-Jazz requires Ethiopian modal language, distinctive melodic intervals and phrasing fused with a grounded jazz ensemble groove.',
    instrumentation: 'horns, electric or acoustic keys, bass, drums, regional percussion and optional Ethiopian traditional timbres',
    rhythm: 'repetitive hypnotic pocket with Ethiopian phrasing and restrained jazz-funk interaction',
    moods: ['Mystical', 'Hypnotic', 'Soulful', 'Smoky', 'Proud', 'Melancholic', 'Groovy', 'Spiritual']
  }
};

const SUBGENRE_MODIFIERS: Array<{ pattern: RegExp; detail: string; moods: string[] }> = [
  { pattern: /ambient|drone|chill|downtempo|dream|space/i, detail: 'Prioritize spacious texture, slow evolution, restrained transients and immersive depth.', moods: ['Atmospheric', 'Dreamy', 'Meditative', 'Ethereal'] },
  { pattern: /dark|horror|death|black|doom|industrial|harsh|funeral/i, detail: 'Use darker timbre, tension and weight while preserving the exact genre grammar.', moods: ['Dark', 'Ominous', 'Intense', 'Tense'] },
  { pattern: /hard|hardcore|brutal|raw|uptempo|gabber|schranz/i, detail: 'Increase impact, speed or aggression with controlled transients and no loss of stylistic detail.', moods: ['Aggressive', 'Relentless', 'Raw', 'Peak-Time'] },
  { pattern: /melodic|romantic|lovers|soul|emotional|ballad/i, detail: 'Give melody, expressive harmony and emotional phrasing a central role.', moods: ['Emotional', 'Romantic', 'Soulful', 'Warm'] },
  { pattern: /progressive|fusion|experimental|avant|post-|art |math|technical/i, detail: 'Develop motifs, form, harmony or meter beyond the parent genre while keeping a coherent identity.', moods: ['Adventurous', 'Sophisticated', 'Dynamic', 'Experimental'] },
  { pattern: /funk|disco|boogie|groove|dance|perreo|soca|salsa/i, detail: 'Make the rhythm section physically compelling, syncopated and precise with clear dance function.', moods: ['Groovy', 'Energetic', 'Joyful', 'Confident'] },
  { pattern: /traditional|folk|roots|classical|old school|golden age|early|first wave/i, detail: 'Respect period-correct instrumentation, performance practice, form and production character.', moods: ['Authentic', 'Nostalgic', 'Earthy', 'Organic'] },
  { pattern: /modern|future|nu |neo-|contemporary|cyber|digital|electro/i, detail: 'Use current or futuristic production only where it reinforces the named subgenre rather than replacing it.', moods: ['Futuristic', 'Polished', 'Bold', 'Dynamic'] },
  { pattern: /vocal|crooner|scat|spoken|poetry|opera|choral|choir/i, detail: 'Shape accompaniment around intelligible lead phrasing, breathing, register and meaningful call-and-response.', moods: ['Intimate', 'Expressive', 'Dramatic', 'Human'] },
  { pattern: /acoustic|chamber|string quartet|piano solo|singer-songwriter/i, detail: 'Preserve human articulation, natural room tone, acoustic dynamics and believable performer interaction.', moods: ['Intimate', 'Organic', 'Elegant', 'Reflective'] },
  { pattern: /epic|trailer|heroic|symphon|orchestral|score|soundtrack/i, detail: 'Use thematic orchestration, large-scale dynamic architecture and a clear narrative payoff.', moods: ['Epic', 'Heroic', 'Dramatic', 'Majestic'] },
  { pattern: /lo-fi|lowercase|minimal|micro/i, detail: 'Use restraint, negative space and small deliberate detail; do not confuse simplicity with unfinished production.', moods: ['Minimal', 'Intimate', 'Hypnotic', 'Understated'] }
];

const DEFAULT_PROFILE: ProfileCore = {
  instrumentation: 'instruments, timbres and performance techniques that are specifically authentic to the selected subgenre',
  rhythm: 'a subgenre-correct rhythmic foundation with believable accents, variation and human musical movement',
  harmony: 'harmonic and melodic language characteristic of the selected subgenre rather than generic substitutes',
  arrangement: 'a focused introduction, progressive development, clear main section, meaningful contrast, climax and complete outro',
  production: 'clear separation, musical dynamics, stable imaging and a professional master appropriate to the selected style'
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function matchingModifiers(genre: string, subgenre: string) {
  const value = `${genre} ${subgenre}`;
  return SUBGENRE_MODIFIERS.filter(item => item.pattern.test(value));
}

export function hasCuratedGenreIdentity(genre: string): boolean {
  return Boolean(GENRE_SIGNATURES[genre]);
}

export function getAtmospheresForSelection(genreFamily: string, genre: string, subgenre: string): string[] {
  const exact = SUBGENRE_OVERRIDES[subgenre.toLowerCase()]?.moods || [];
  const modifierMoods = matchingModifiers(genre, subgenre).flatMap(item => item.moods);
  return unique([
    ...exact,
    ...modifierMoods,
    ...(GENRE_MOODS[genre] || []),
    ...(FAMILY_MOODS[genreFamily] || []),
    'Authentic',
    'Expressive'
  ]).slice(0, 12);
}

export function getMusicStyleProfile(genreFamily: string, genre: string, subgenre: string): MusicStyleProfile {
  const family = FAMILY_PROFILES[genreFamily] || DEFAULT_PROFILE;
  const genreIdentity = GENRE_SIGNATURES[genre] || `Use the documented musical language of ${genre}.`;
  const exact = SUBGENRE_OVERRIDES[subgenre.toLowerCase()];
  const modifiers = matchingModifiers(genre, subgenre);
  const modifierDetail = modifiers.map(item => item.detail).join(' ');
  const identity = exact?.identity || [
    `${genreIdentity}`,
    `For ${subgenre}, prioritize its exact instrumentation, rhythmic feel, harmony, phrasing, form, era and production conventions over generic ${genre} habits.`,
    modifierDetail
  ].filter(Boolean).join(' ');
  const genericParents = genreFamily === genre
    ? `generic ${genre}`
    : `generic ${genreFamily} or generic ${genre}`;

  return {
    identity,
    instrumentation: exact?.instrumentation || family.instrumentation,
    rhythm: exact?.rhythm || family.rhythm,
    harmony: exact?.harmony || family.harmony,
    arrangement: exact?.arrangement || family.arrangement,
    production: exact?.production || family.production,
    avoid: `Do not substitute ${genericParents}, pop, cinematic underscore or a neighboring subgenre for ${subgenre}.`,
    moods: getAtmospheresForSelection(genreFamily, genre, subgenre)
  };
}
