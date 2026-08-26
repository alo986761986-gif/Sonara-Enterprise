export interface HouseStylePatch {
  identity: string;
  moods: string[];
  instrumentation?: string;
  rhythm?: string;
  harmony?: string;
  arrangement?: string;
  production?: string;
  avoid?: string;
  blockedMoods?: string[];
}

type HouseProfile = HouseStylePatch & {
  bpm: string;
};

const house = (bpm: string, profile: HouseStylePatch): HouseProfile => ({ bpm, ...profile });

const HOUSE_PROFILES: Record<string, HouseProfile> = {
  house: house('120–126 BPM', {
    identity: 'House is groove-first dance music rooted in Chicago: a steady four-on-the-floor pulse, syncopated bass, off-beat hats, claps or snares on 2 and 4, soulful or sample-based hooks and repetitive tension-release designed for dancing.',
    moods: ['Groovy', 'Soulful', 'Uplifting', 'Warm', 'Club', 'Hypnotic', 'Joyful', 'Driving'],
    instrumentation: '909/707-style house drums, rounded syncopated bass, piano or organ stabs, sampled or synthesized chord hooks, restrained vocal phrases and functional club effects',
    rhythm: 'four-on-the-floor kick with clear 2-and-4 clap/snare, off-beat open hats, shuffled closed hats and percussion, syncopated bass answering the kick and small fills at phrase boundaries',
    harmony: 'simple but soulful chord cycles, often using sevenths, ninths, piano or organ voicings, with memorable short hooks rather than cinematic harmonic development',
    arrangement: 'brief DJ-readable opening, groove establishment, hook or vocal section, tension release, breakdown or subtractive passage, return and clean outro with changes in 8-, 16- or 32-bar phrases',
    production: 'punchy but not over-limited club mix, mono-compatible low end, warm midrange, crisp hats, audible groove swing and controlled sidechain rather than exaggerated EDM pumping',
    avoid: 'No trance supersaws, no festival big-room drop, no techno rumble dominance, no trap half-time drums and no long cinematic intro.'
  }),
  'classic house': house('118–124 BPM', {
    identity: 'Classic House recreates the late-1980s/early-1990s house vocabulary with drum-machine swing, sampled soul/disco DNA, piano or organ riffs and raw club warmth rather than modern EDM polish.',
    moods: ['Classic', 'Warm', 'Soulful', 'Raw', 'Uplifting', 'Nostalgic', 'Groovy', 'Club'],
    instrumentation: 'TR-909/707/808-derived drums, sampled vocal or disco fragments, M1-style piano or organ, simple analog bass, strings or pads used sparingly and period-aware effects',
    rhythm: 'straight four-on-floor foundation with humanized swing, clap/snare on 2 and 4, off-beat open hat and loose sampled percussion',
    harmony: 'gospel, disco and soul-informed piano/organ progressions with short memorable chord riffs and uncomplicated tonal movement',
    arrangement: 'DJ-functional 8/16-bar layering, early hook introduction, sample or vocal-led middle, breakdown and return without modern festival build-drop grammar',
    production: 'raw-to-warm period character, modest saturation, limited stereo excess, punchy drum-machine transients and sampler-era texture',
    avoid: 'No modern future-house bass design, no melodic-techno cinematic arpeggios, no huge EDM risers and no hyper-clean festival master.'
  }),
  'chicago house': house('118–125 BPM', {
    identity: 'Chicago House is raw, jacking and soulful, centered on drum-machine swing, repetitive bass or piano figures, gospel/disco/boogie influence and direct body-moving energy.',
    moods: ['Jacking', 'Raw', 'Soulful', 'Warehouse', 'Groovy', 'Classic', 'Hypnotic', 'Energetic'],
    instrumentation: '909/707/808 drum machines, punchy mono bass, piano/organ chords, chopped soul or disco samples, short vocal commands and optional restrained 303 only when musically appropriate',
    rhythm: 'jacking four-on-floor with strong clap/snare, off-beat hats, syncopated toms or percussion and audible swing that creates push-pull around the kick',
    harmony: 'repetitive soulful chord vamp, blues/gospel/disco inflection and compact hooks that support rhythmic hypnosis',
    arrangement: 'raw groove-led blocks, quick addition and subtraction of percussion and samples, short breakdowns and functional club transitions',
    production: 'dry-to-gritty drum machines, sampler crunch, analog saturation and limited polish while retaining strong low-end definition',
    avoid: 'No glossy progressive-house pads, no festival supersaw drop, no modern tech-house white-noise build obsession and no generic EDM sidechain wash.'
  }),
  'deep house': house('118–124 BPM', {
    identity: 'Deep House is warm, introspective, soulful and hypnotic, with Chicago-rooted house rhythm softened by jazzy harmony, deep bass, spacious pads and understated emotional movement.',
    moods: ['Deep', 'Warm', 'Hypnotic', 'Soulful', 'Late-Night', 'Atmospheric', 'Intimate', 'Groovy'],
    instrumentation: 'rounded sub/analog bass, Rhodes or warm electric piano, organ or muted chord stabs, soft 909-style drums, subtle pads, understated vocal fragments and spacious dub-like effects',
    rhythm: 'steady four-on-floor with relaxed pocket, soft but defined kick, lightly swung hats and percussion, syncopated bass phrases and restrained fills',
    harmony: 'minor-seventh, ninth, suspended and jazz/soul-informed voicings with smooth voice leading, modal color and understated melodic motifs',
    arrangement: 'short atmospheric setup, early groove and harmonic identity, patient layering, emotionally focused middle, restrained breakdown, warm return and clean outro',
    production: 'warm low-mid body, smooth transients, deep controlled sub, natural width, subtle saturation, long but uncluttered reverbs and no aggressive loudness',
    avoid: 'No tech-house one-note bass domination, no festival supersaws, no oversized EDM drop, no hard techno kick and no two-minute ambient prelude.',
    blockedMoods: ['Aggressive', 'Relentless', 'Brutal']
  }),
  'tech house': house('124–130 BPM', {
    identity: 'Tech House is a stripped, groove-dominant club style between house swing and techno economy: kick-bass interaction, shuffled percussion, short hooks and DJ-functional tension are primary.',
    moods: ['Groovy', 'Driving', 'Hypnotic', 'Underground', 'Dark', 'Peak-Time', 'Raw', 'Minimal'],
    instrumentation: 'tight short kick, elastic mono sub/bass phrase, crisp clap, shuffled hats, shakers and percussion, clipped vocal hook, restrained stabs, impacts and white-noise effects used only for transitions',
    rhythm: 'locked four-on-floor with precise kick-bass pocket, pronounced 16th-note shuffle, syncopated percussion, rolling hat movement and concise fills; the groove must work with almost no melody',
    harmony: 'minimal one- or two-chord language, short stabs or tonal hooks and timbral automation rather than lush chord progressions',
    arrangement: 'brief DJ intro, bass/groove entry, hook tease, main groove/drop, short tension breakdown, stronger return and clean mixable outro in disciplined 8/16/32-bar phrases',
    production: 'tight mono low end, punchy transient-focused drums, controlled saturation, dry upfront percussion, sparse stereo effects and strong club translation',
    avoid: 'No lush deep-house jazz progression, no melodic-techno cinematic lead, no trance supersaws, no big-room snare-roll drop and no long atmospheric opening.',
    blockedMoods: ['Dreamy', 'Pastoral', 'Orchestral']
  }),
  'progressive house': house('122–128 BPM', {
    identity: 'Progressive House is long-form, layered and continuously evolving house built on rolling groove, repeating melodic motifs and gradual tension-release; progression must come from cumulative musical change rather than a single EDM drop.',
    moods: ['Progressive', 'Driving', 'Expansive', 'Hypnotic', 'Emotional', 'Evolving', 'Uplifting', 'Nocturnal'],
    instrumentation: 'deep rolling bass, clean four-on-floor drums, layered percussion, evolving pads, arpeggios, delayed plucks, restrained lead motifs and textural effects',
    rhythm: 'steady club pulse with rolling bass movement, subtle percussion changes and phrase-scale automation that keeps propulsion continuous',
    harmony: 'repeating minor or modal progressions, suspended tones, evolving voicings and melodic motifs developed through layering, inversion and timbral change',
    arrangement: 'short functional opening followed by long arcs of 16/32-bar development, motif introduction, gradual lift, controlled breakdown, rebuild, emotional peak and extended DJ-readable resolution',
    production: 'deep clean low end, wide evolving atmosphere, precise automation, long delays/reverbs kept out of the kick-bass pocket and smooth dynamic escalation',
    avoid: 'No static tech-house loop, no three-minute cinematic intro, no one-note big-room drop, no hard techno rumble and no abrupt pop verse-chorus switching.'
  }),
  'melodic house': house('120–126 BPM', {
    identity: 'Melodic House keeps a genuine house groove underneath emotionally legible chords, arpeggios and lead motifs; melody is central but the track must remain warmer and more house-led than melodic techno or trance.',
    moods: ['Melodic', 'Emotional', 'Atmospheric', 'Warm', 'Hypnotic', 'Uplifting', 'Nocturnal', 'Cinematic'],
    instrumentation: 'round house kick and bass, crisp percussion, warm pads, plucks, arpeggiators, expressive synth lead, occasional piano and restrained vocal textures',
    rhythm: 'four-on-floor house pulse with smooth syncopated bass, restrained off-beat hats and enough groove to remain danceable under melodic layers',
    harmony: 'clear minor/major modal progressions, suspended and added-note voicings, arpeggiated chord tones and memorable emotional motifs',
    arrangement: 'short opening, early motif, layered development, melodic expansion, concise breakdown, rebuilt groove and emotional final peak without trance-style overextension',
    production: 'polished deep mix, smooth sidechain, wide atmospheric layers, controlled low end and detailed automation without overly hard techno transients',
    avoid: 'No industrial techno kick, no trance supersaw wall, no big-room festival drop, no two-minute pad-only intro and no melody-free tech-house structure.'
  }),
  'afro house': house('115–125 BPM', {
    identity: 'Afro House combines a house pulse with African-rooted polyrhythmic practice, layered percussion, deep groove, organic timbres and often spiritually or communally charged vocal/melodic phrasing; rhythmic authenticity must lead the production.',
    moods: ['Deep', 'Percussive', 'Hypnotic', 'Spiritual', 'Groovy', 'Organic', 'Warm', 'Driving'],
    instrumentation: 'deep electronic bass, grounded four-on-floor kick, layered shakers, hand percussion and drums with culturally coherent roles, organic plucks or mallets, atmospheric chords and optional African-language or call-response vocal material when provided',
    rhythm: 'interlocking syncopated percussion and polyrhythmic layers around a steady house pulse, with evolving accents, call-and-response patterns and humanized groove rather than one generic tribal loop',
    harmony: 'deep modal or soulful chord cycles, pentatonic or regionally informed melodic cells where appropriate, spacious call-and-response and restrained harmonic density',
    arrangement: 'brief rhythmic opening, early groove identity, progressive percussion layering, vocal/melodic focal passage, subtractive break, rebuilt polyrhythmic peak and resolved outro',
    production: 'warm deep low end, detailed transients across many percussion layers, organic room/air, careful spectral separation and dynamic movement without crushing the groove',
    avoid: 'No Amapiano log-drum dominance unless explicitly requested, no generic Hollywood “tribal” stereotype, no Latin-clave substitution, no festival EDM supersaws and no percussion pasted randomly without an interlocking rhythmic function.'
  }),
  'tribal house': house('123–130 BPM', {
    identity: 'Tribal House is percussion-forward club house built from toms, congas, hand drums, shakers and repetitive rhythmic motifs; it is a club-production tradition and must not be treated as a generic substitute for Afro House.',
    moods: ['Percussive', 'Driving', 'Hypnotic', 'Raw', 'Underground', 'Ritual', 'Groovy', 'Peak-Time'],
    instrumentation: 'punchy house kick, rolling bass, layered congas/toms/bongos/shakers, sparse stabs, drones, short chants only when supplied and functional FX',
    rhythm: 'dense interlocking percussion over four-on-floor, syncopated tom and hand-drum phrases, strong 16th-note movement and evolving accent patterns',
    harmony: 'very sparse tonal center, drones, one-note stabs or short modal motifs so percussion remains dominant',
    arrangement: 'rapid groove establishment, progressive percussion layers, rhythmic dropouts, tension build, full percussion return and DJ-friendly outro',
    production: 'dry and punchy percussion close to the listener, controlled room ambience, heavy but clean low end and strong transient separation',
    avoid: 'No lush deep-house chord bed, no generic Afro vocal stereotype, no melodic-techno arpeggio narrative and no oversized EDM breakdown.'
  }),
  'soulful house': house('118–125 BPM', {
    identity: 'Soulful House places gospel, soul and R&B musicianship inside house rhythm: expressive vocals or lead melody, rich keyboards, live-feeling bass and uplifting harmonic movement are essential.',
    moods: ['Soulful', 'Uplifting', 'Warm', 'Joyful', 'Emotional', 'Groovy', 'Spiritual', 'Celebratory'],
    instrumentation: 'Rhodes, acoustic/electric piano, Hammond-style organ, warm bass, 909-informed drums, live guitar or brass touches, gospel/soul vocal layers when present and tasteful strings',
    rhythm: 'steady house kick with humanized percussion, syncopated bass, handclaps and groove supporting vocal phrasing rather than dominating it',
    harmony: 'gospel/soul seventh, ninth and extended chords, passing dominants, strong voice leading and uplifting cadences',
    arrangement: 'brief musical intro, verse or lead exposition, rising harmonic section, memorable soulful refrain, instrumental or breakdown contrast and emotionally strong final return',
    production: 'warm vocal-forward mix, natural keyboard dynamics, rounded bass, polished but organic drums, spacious backing vocals and preserved dynamic expression',
    avoid: 'No minimal tech-house one-note bass loop, no harsh electro bass, no cold industrial textures and no anonymous pop harmony that removes gospel/soul character.'
  }),
  'funky house': house('123–128 BPM', {
    identity: 'Funky House turns disco, funk and soul syncopation into an upbeat house groove with prominent bass, guitar or horn chops, rhythmic samples and bright dance-floor momentum.',
    moods: ['Funky', 'Joyful', 'Groovy', 'Bright', 'Party', 'Confident', 'Uplifting', 'Disco'],
    instrumentation: 'syncopated electric or sampled bass, funk guitar chops, brass/string stabs, disco/soul sample fragments, punchy house drums, piano/organ and vocal hooks',
    rhythm: 'four-on-floor with strong swing, syncopated bass/guitar interplay, busy but controlled hats and percussion and funk-informed anticipations',
    harmony: 'major/minor seventh funk and disco vamps, dominant color, rhythmic chord stabs and catchy sample-derived hooks',
    arrangement: 'fast groove entry, filter/sample tease, full funky hook, breakdown with sample or vocal focus, energetic return and mixable outro',
    production: 'bright punchy drums, saturated samples, tight bass, tasteful filter automation and lively transient detail',
    avoid: 'No dark tech-house minimalism, no slow deep-house haze, no cinematic melodic-techno build and no generic EDM lead.'
  }),
  'french house': house('120–128 BPM', {
    identity: 'French House is disco-sample-driven, heavily filtered and compressed house with elastic sidechain pump, saturated drums, loop-based hooks and a glossy yet gritty late-1990s/2000s French-touch character.',
    moods: ['Funky', 'Filtered', 'Disco', 'Energetic', 'Stylish', 'Nostalgic', 'Groovy', 'Bright'],
    instrumentation: 'chopped disco/funk samples, filtered strings/guitar/keys, 909-style drums, warm bass, vocoder or talkbox only when appropriate and resonant filter sweeps',
    rhythm: 'steady four-on-floor with punchy kick, open-hat lift and looped disco syncopation shaped by strong but musical pump',
    harmony: 'sample-derived disco seventh/dominant harmony, short looped chord cycles and filter movement creating harmonic tension',
    arrangement: 'short filtered introduction, progressive opening of sample spectrum, full compressed groove, breakdown/filter reset, euphoric return and filtered outro',
    production: 'signature sidechain compression, bus saturation, resonant filtering, crunchy sampling and cohesive glue without modern brickwall loudness',
    avoid: 'No generic modern future-house bass drop, no unfiltered clean disco reproduction, no trance lead and no sterile ultra-clean mix that removes French-touch pump.'
  }),
  'filter house': house('122–128 BPM', {
    identity: 'Filter House builds its musical narrative from repeated house/disco loops transformed by resonant low-pass/high-pass filtering, sample chops and automation; the filter movement itself is structural.',
    moods: ['Filtered', 'Groovy', 'Hypnotic', 'Funky', 'Building', 'Club', 'Energetic', 'Nostalgic'],
    instrumentation: 'sampled disco/funk/chord loops, 909 house drums, simple bass reinforcement, vocal chops and resonant filter/drive processing',
    rhythm: 'four-on-floor with loop-derived swing, consistent club pulse and percussion that supports filter automation rather than competing with it',
    harmony: 'short sample-based harmonic loop with tension created through spectral filtering, mutes and reintroduction more than chord changes',
    arrangement: 'filtered opening, staged frequency reveal, full-loop payoff, subtractive filter breakdown, re-opening climax and filter-down outro',
    production: 'audible resonant filter sweeps, controlled saturation, pumping dynamics and sample cohesion while avoiding harsh resonance peaks',
    avoid: 'No unrelated cinematic chord progression, no tech-house bass-only drop, no static filter setting and no arrangement that ignores spectral build/release.'
  }),
  'disco house': house('120–128 BPM', {
    identity: 'Disco House preserves disco musicianship and celebratory orchestration while reinforcing it with house drums, looping and club arrangement.',
    moods: ['Disco', 'Celebratory', 'Joyful', 'Funky', 'Glamorous', 'Uplifting', 'Groovy', 'Warm'],
    instrumentation: 'disco bass or bass sample, rhythm guitar, strings, brass, piano, handclaps, vocal hooks and house kick/hat reinforcement',
    rhythm: 'four-on-floor with disco syncopation, open hats, claps, live-feeling percussion and bass/guitar interplay',
    harmony: 'soul/disco seventh and ninth chords, chromatic passing movement, uplifting cadences and melodic string/brass hooks',
    arrangement: 'brief DJ opening, instrumental groove, disco hook/vocal lift, orchestral or filter breakdown, celebratory return and mixable outro',
    production: 'warm sample/live blend, crisp club drums, polished strings/brass, controlled sidechain and natural funk dynamics',
    avoid: 'No aggressive electro bass, no stripped tech-house arrangement, no hard techno kick and no generic festival build-drop.'
  }),
  'jackin house': house('124–130 BPM', {
    identity: 'Jackin House is energetic Chicago-descended house with rugged swung drums, elastic groove and chopped funk, jazz, hip-hop, R&B or disco sampling used rhythmically.',
    moods: ['Jacking', 'Funky', 'Raw', 'Swinging', 'Energetic', 'Groovy', 'Playful', 'Underground'],
    instrumentation: 'hard-snapping house drums, chopped funk/jazz/disco/R&B samples, filtered stabs, booming or elastic bass, vocal snippets and percussion accents',
    rhythm: 'pronounced swing, snapping snares/claps, shuffling hats, syncopated sample cuts and a bassline that physically jacks against the kick',
    harmony: 'sample-derived short vamps, blues/funk/jazz fragments and rhythmic chord chops rather than long melodic progressions',
    arrangement: 'quick beat introduction, sample tease, full jacking groove, cut-up break, filter or drum transition, stronger return and DJ outro',
    production: 'rugged drum transients, sample crunch, resonant filters, warm saturation and strong groove without excessive polish',
    avoid: 'No smooth deep-house wash, no melodic-techno arpeggio arc, no trap beat and no straight quantized groove with zero swing.'
  }),
  'acid house': house('120–130 BPM', {
    identity: 'Acid House is defined by the Roland TB-303 vocabulary: a sequenced resonant bassline whose cutoff, resonance, envelope and accents evolve against raw Chicago-rooted house drums.',
    moods: ['Acid', 'Hypnotic', 'Raw', 'Psychedelic', 'Warehouse', 'Jacking', 'Dark', 'Energetic'],
    instrumentation: 'TB-303-style mono acid bass as a primary voice, 808/909 drums, clap, hats, sparse stabs, short vocal samples and minimal supporting synths',
    rhythm: 'four-on-floor house pulse with jacking hats/percussion and a syncopated accented 303 sequence that mutates without losing the groove',
    harmony: 'minimal tonal framework; musical motion comes mainly from the evolving 303 sequence, accent pattern and filter resonance rather than lush chord changes',
    arrangement: 'short drum/303 setup, progressive acid modulation, full groove, stripped acid break, resonance/cutoff climax and raw outro',
    production: 'authentic squelchy resonant 303 behavior, analog-style saturation, punchy drum machines and controlled resonance so the acid line stays musical',
    avoid: 'No generic saw bass pretending to be a 303, no lush progressive-house chord bed, no trance supersaw lead and no big-room festival drop.'
  }),
  'electro house': house('125–130 BPM', {
    identity: 'Electro House is punchy mid-2000s/early-2010s club house with distorted or sharply synthesized mid-bass, big drums, aggressive hooks and concise build/drop contrast.',
    moods: ['Energetic', 'Aggressive', 'Electro', 'Peak-Time', 'Bold', 'Driving', 'Edgy', 'Festival'],
    instrumentation: 'large punchy kick, distorted saw/square bass, bright synth stabs or lead, snare/clap layers, risers, impacts and short vocal hooks',
    rhythm: 'straight four-on-floor with heavy kick, off-beat or syncopated electro bass and tight high-frequency percussion',
    harmony: 'simple minor-key or power-chord-like synth movement supporting a dominant bass/lead riff',
    arrangement: 'short intro, hook tease, compact build, forceful electro drop, breakdown, second intensified drop and clean ending',
    production: 'forward midrange bass, clipped/distorted character controlled for clarity, strong kick-bass sidechain and loud but defined club transients',
    avoid: 'No deep-house softness, no microhouse minimal detail, no trance-length breakdown and no modern bass-house identity replacing the electro riff vocabulary.'
  }),
  'future house': house('124–128 BPM', {
    identity: 'Future House uses a clean modern house frame with bouncy metallic/plucky bass design, bright chord or vocal hooks and compact polished drops associated with the mid-2010s future-house sound.',
    moods: ['Bouncy', 'Bright', 'Energetic', 'Modern', 'Catchy', 'Uplifting', 'Club', 'Playful'],
    instrumentation: 'tight kick, layered clap, bright hats, pitch-modulated/plucky future-house bass, chord stabs, vocal chops and glossy transition effects',
    rhythm: 'four-on-floor with bouncy syncopated bass notes, sharp off-beat accents and clean quantized percussion with controlled swing',
    harmony: 'catchy major/minor pop-house chord cycle, bright stabs and simple vocal-friendly topline space',
    arrangement: 'short intro, vocal/chord hook, concise build, bass-led future-house drop, short breakdown and second polished drop',
    production: 'clean bright transients, pronounced but controlled sidechain pump, layered bass harmonics and polished stereo effects',
    avoid: 'No raw Chicago sampler grit, no long progressive-house journey, no hard bass-house aggression and no generic big-room supersaw drop.'
  }),
  'bass house': house('124–130 BPM', {
    identity: 'Bass House keeps house four-on-floor structure but makes sub and aggressive syncopated bass sound design the central hook, drawing from UK bass/garage energy without abandoning the house pulse.',
    moods: ['Heavy', 'Bass-Driven', 'Dark', 'Energetic', 'Edgy', 'Club', 'Driving', 'Aggressive'],
    instrumentation: 'heavy kick, sub bass plus distorted/wavetable mid-bass layers, clipped vocal chops, crisp hats, percussion and short rave/garage-influenced stabs',
    rhythm: 'four-on-floor kick with syncopated bass call-and-response, sharp gaps, occasional garage-like rhythmic accents and compact drum fills',
    harmony: 'minimal dark tonal center or short chord stab so bass movement remains the main musical event',
    arrangement: 'brief intro, bass motif tease, compact build, syncopated bass drop, breakdown, redesigned second bass drop and direct outro',
    production: 'powerful mono sub, controlled multiband bass distortion, precise kick-bass separation and loud transient impact without muddying the low mids',
    avoid: 'No future-house light pluck identity, no dubstep half-time drop, no big-room supersaw lead and no soft deep-house bass.'
  }),
  'big room house': house('126–132 BPM', {
    identity: 'Big Room House is deliberately maximal festival house: huge four-on-floor kick, sparse high-impact drop motif, dramatic build and instantly legible crowd-scale tension-release.',
    moods: ['Massive', 'Festival', 'Peak-Time', 'Energetic', 'Anthemic', 'Triumphant', 'Bold', 'Explosive'],
    instrumentation: 'oversized kick, broad supersaw or simple festival lead, sub/bass reinforcement, snare-roll build, risers, impacts, crowd-scale FX and minimal drop layers',
    rhythm: 'straight forceful four-on-floor with highly simplified drop rhythm and build percussion increasing density toward impact',
    harmony: 'anthemic simple chord progression or single-note festival motif, often emphasizing root/fifth clarity and large tonal payoff',
    arrangement: 'short intro, recognizable hook, escalating build, sparse huge drop, melodic/breakdown reset, second build and larger final drop',
    production: 'very wide high-impact mix, massive kick transient, aggressive sidechain and clean sub while leaving deliberate space in the drop',
    avoid: 'No subtle deep-house pocket, no minimal tech-house groove focus, no long organic percussion development and no dense chord voicings that weaken the drop.'
  }),
  'organic house': house('108–122 BPM', {
    identity: 'Organic House is deeper, slower-burning and meditative house that blends electronic pulse with acoustic/organic instrumentation, hand percussion and evolving naturalistic texture.',
    moods: ['Organic', 'Warm', 'Meditative', 'Deep', 'Earthy', 'Mystical', 'Atmospheric', 'Journeying'],
    instrumentation: 'soft deep kick, rounded bass, hand percussion, acoustic/plucked strings, mallets, piano, flute or other culturally coherent organic instruments, warm pads and field-texture ambience',
    rhythm: 'gentle four-on-floor or softened house pulse with layered human percussion, subtle syncopation and breathing microtiming',
    harmony: 'modal, minor or suspended progressions with open voicings, acoustic motifs and gradual melodic development',
    arrangement: 'brief atmospheric cue then early groove, patient instrumental layering, organic motif development, meditative break, warm rebuild and long resolved release',
    production: 'natural room depth, soft transients, warm low end, detailed acoustic textures and spacious reverbs without washing out the rhythmic pulse',
    avoid: 'No aggressive tech-house bass, no festival supersaws, no hard techno kick, no random “world music” stereotypes and no two-minute beatless intro.'
  }),
  'latin house': house('122–128 BPM', {
    identity: 'Latin House combines house four-on-floor with authentic Latin rhythmic vocabulary: syncopated percussion, clave/tumbao-informed phrasing and culturally coherent piano, brass, guitar or vocal material.',
    moods: ['Latin', 'Percussive', 'Festive', 'Groovy', 'Warm', 'Passionate', 'Joyful', 'Danceable'],
    instrumentation: 'house kick and bass with congas, bongos, timbales, claves, cowbells, shakers or guiro as appropriate, plus piano montuno-like figures, brass/guitar or Latin vocal hooks when stylistically coherent',
    rhythm: 'interlocking syncopated Latin percussion around four-on-floor, clave-aware accents and tumbao-like bass/piano interaction rather than arbitrary percussion layering',
    harmony: 'Latin/soul/jazz-informed piano chords, dominant movement, rhythmic stabs and memorable vocal or brass motifs',
    arrangement: 'short percussion intro, groove establishment, piano/vocal/brass hook, percussion-focused break, energetic return and DJ-friendly outro',
    production: 'crisp acoustic percussion, warm house low end, clear transient placement and natural room color without flattening the rhythmic detail',
    avoid: 'No generic “Spanish guitar equals Latin” shortcut, no Afro-house substitution, no reggaeton dembow unless explicitly requested and no EDM big-room drop.'
  }),
  'minimal house': house('122–128 BPM', {
    identity: 'Minimal House reduces house to kick, bass, micro-percussion, tiny stabs and negative space; interest comes from precise groove, timbre and microscopic changes rather than dense arrangement.',
    moods: ['Minimal', 'Hypnotic', 'Underground', 'Focused', 'Dry', 'Groovy', 'Subtle', 'Late-Night'],
    instrumentation: 'short dry kick, compact mono bass, clicks, rimshots, tiny hats/shakers, micro vocal cuts and sparse synth or chord stabs',
    rhythm: 'tight four-on-floor with nuanced swing, syncopated bass and extremely deliberate micro-percussion placement; small timing differences carry the groove',
    harmony: 'one tonal center or very short chord fragment with timbral changes and silence replacing conventional harmonic development',
    arrangement: 'quick groove establishment, incremental one-element changes across 8/16 bars, subtractive breaks and restrained returns designed for long DJ blends',
    production: 'dry close transients, deep clean sub, lots of negative space, subtle saturation and microscopic automation',
    avoid: 'No lush pads, no cinematic breakdown, no big chord progression, no supersaw lead and no cluttered percussion stack.'
  }),
  microhouse: house('118–125 BPM', {
    identity: 'Microhouse is a microscopic, sample-fragmented branch of minimal house: clicks, tiny edits, sliced vocals, glitch artifacts and soft house pulse form an intricate but restrained groove.',
    moods: ['Microscopic', 'Minimal', 'Warm', 'Glitchy', 'Hypnotic', 'Intimate', 'Abstract', 'Groovy'],
    instrumentation: 'soft kick, sub bass, clicks, pops, vinyl/digital fragments, sliced micro-vocals, tiny chord grains and short percussion samples',
    rhythm: 'subtle four-on-floor reference with highly detailed micro-syncopation, clipped ghost events and shuffled fragments around the pulse',
    harmony: 'fragmentary chord grains, sampled micro-loops and understated tonal ambiguity rather than full sustained pads',
    arrangement: 'small-scale transformations every few bars, sample mutation, dropouts and recontextualized fragments instead of conventional build/drop drama',
    production: 'high-detail close-microscopic sound field, controlled low end, intentional digital artifacts and delicate stereo placement',
    avoid: 'No big-room drums, no full disco loop left untouched, no lush progressive pad wall and no generic minimal-techno rumble.'
  }),
  'lo-fi house': house('115–124 BPM', {
    identity: 'Lo-Fi House combines house groove with deliberately degraded sampler/tape texture, dusty drums, detuned chords and nostalgic imperfection while remaining fully danceable and intentionally mixed.',
    moods: ['Lo-Fi', 'Dusty', 'Nostalgic', 'Warm', 'Dreamy', 'Raw', 'Late-Night', 'Groovy'],
    instrumentation: 'soft distorted kick, dusty hats/claps, warm sub/bass, detuned piano or synth chords, vinyl/tape noise, chopped vocal or soul samples and hazy pads',
    rhythm: 'relaxed four-on-floor with loose swing, softened transients, syncopated bass and imperfect sampled percussion timing',
    harmony: 'detuned seventh/ninth chords, nostalgic minor/major vamps and simple melodic fragments softened by filtering or tape instability',
    arrangement: 'brief texture cue, immediate dusty groove, sample/chord development, low-key breakdown, warm return and imperfect but composed outro',
    production: 'intentional tape/sampler saturation, bandwidth reduction, wow/flutter and noise kept musical; low end remains controlled despite degraded texture',
    avoid: 'No accidental clipping masquerading as lo-fi, no pristine future-house polish, no festival lead and no beatless ambient drift.'
  }),
  'g-house': house('120–126 BPM', {
    identity: 'G-House combines dark house groove with hip-hop attitude: weighty bass, sparse minor-key stabs and rap/spoken vocal chops create swagger without turning into trap.',
    moods: ['Dark', 'Swaggering', 'Bass-Driven', 'Urban', 'Confident', 'Groovy', 'Raw', 'Nightclub'],
    instrumentation: 'deep distorted house bass, punchy four-on-floor kick, dry clap/hats, short dark synth stabs, rap/spoken vocal chops and restrained siren/FX accents',
    rhythm: 'house four-on-floor with syncopated bass, sparse hip-hop-influenced vocal rhythm and swung percussion while retaining dance-floor pulse',
    harmony: 'minimal minor-key stabs, bluesy or chromatic bass movement and short hook motifs',
    arrangement: 'short dark intro, vocal/bass tease, full swagger groove, vocal or FX break, heavier bass return and compact outro',
    production: 'heavy mono low end, gritty saturation, dry drums and upfront vocal chops with controlled club loudness',
    avoid: 'No half-time trap drum conversion, no huge EDM supersaw, no soulful deep-house chord bed and no bass-house sound-design overload that erases the hip-hop attitude.'
  }),
  'garage house': house('120–128 BPM', {
    identity: 'Garage House is soulful US house descended from New York/New Jersey club tradition, emphasizing powerful gospel/R&B vocals, organ/piano, warm bass and swung house drums; it is not UK two-step garage.',
    moods: ['Soulful', 'Garage', 'Uplifting', 'Warm', 'Vocal', 'Groovy', 'Classic', 'Emotional'],
    instrumentation: 'strong soulful lead/backing vocals when present, organ, piano, warm bass, 909-style kick/clap/hats, strings and occasional guitar/brass accents',
    rhythm: 'four-on-floor with pronounced swing, lively hats and percussion, syncopated bass and handclaps supporting gospel/R&B phrasing',
    harmony: 'gospel and R&B seventh/ninth voicings, passing chords, organ movement and emotionally clear cadences',
    arrangement: 'short club intro, vocal or keyboard exposition, verse/refrain or hook cycles, gospel-style lift, breakdown and strong final vocal/harmonic return',
    production: 'warm vocal-forward club mix, deep but musical bass, natural keyboard dynamics and spacious backing vocals',
    avoid: 'No UK 2-step beat, no speed-garage wobble bass, no minimal tech-house loop and no festival EDM lead.'
  }),
  'hard house': house('135–150 BPM', {
    identity: 'Hard House is fast, forceful rave-oriented house with hard kicks, off-beat or driving bass, hoover/stab energy, sharp builds and relentless four-on-floor momentum, distinct from hardstyle and hardcore.',
    moods: ['Hard', 'Rave', 'Relentless', 'Peak-Time', 'Energetic', 'Raw', 'Aggressive', 'Euphoric'],
    instrumentation: 'hard punchy kick, driving/off-beat bass, rave stabs, hoover-like synths, snare rolls, open hats, short vocal shouts and energetic FX',
    rhythm: 'fast straight four-on-floor with forceful kick, off-beat bass or rapid rolling bass and high-energy hats/percussion',
    harmony: 'simple rave minor/major motifs, short stabs and tension notes built for impact rather than lush harmonic detail',
    arrangement: 'very short intro, immediate drive, build, hard groove/drop, brief rave break, intensified second section and decisive ending',
    production: 'hard transient punch, bright aggressive mids, tightly controlled sub/bass and loud club master without gabber-style clipping',
    avoid: 'No slow deep-house groove, no hardstyle reverse-bass/gated-kick identity, no hardcore gabber distortion and no long melodic trance breakdown.'
  }),
  'piano house': house('120–128 BPM', {
    identity: 'Piano House makes an upfront rhythmic house-piano riff or chord progression the defining hook, supported by soulful bass, four-on-floor drums and uplifting vocal or instrumental energy.',
    moods: ['Piano', 'Uplifting', 'Joyful', 'Soulful', 'Anthemic', 'Warm', 'Energetic', 'Celebratory'],
    instrumentation: 'bright acoustic/M1-style house piano, punchy house kick, clap, open hats, warm bass, optional organ/strings and soulful vocal hook',
    rhythm: 'steady four-on-floor with off-beat hats, handclaps and syncopated piano chord attacks interacting tightly with the bass',
    harmony: 'strong piano-led major/minor seventh or gospel-influenced chord cycle with memorable inversions, rhythmic stabs and uplifting cadence',
    arrangement: 'brief drum/piano tease, early full piano hook, vocal or melodic development, concise breakdown spotlighting piano, large joyful return and clean outro',
    production: 'piano kept bright and wide but not harsh, kick/bass centered, controlled sidechain and vocal-friendly midrange',
    avoid: 'No generic supersaw replacing the piano hook, no tech-house minimal bass-only drop, no dark techno rumble and no long intro before the piano identity appears.'
  })
};

function normalize(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

export function getHouseStylePatch(family: string, genre: string, subgenre: string): HouseStylePatch | undefined {
  if (normalize(family) !== 'electronic dance' || normalize(genre) !== 'house') return undefined;
  const profile = HOUSE_PROFILES[normalize(subgenre)];
  if (!profile) return undefined;
  const { bpm, ...patch } = profile;
  return {
    ...patch,
    identity: `${patch.identity} Authentic tempo territory: ${bpm}; if the creator explicitly locks another BPM, preserve the requested BPM but keep every other ${subgenre} rhythmic and production convention intact.`
  };
}

export function getHouseStyleBpmRange(subgenre: string): string | null {
  return HOUSE_PROFILES[normalize(subgenre)]?.bpm || null;
}

export const HOUSE_SUBGENRE_PROFILE_COUNT = Object.keys(HOUSE_PROFILES).length;
