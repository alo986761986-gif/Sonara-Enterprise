import {
  GENRE_FAMILIES,
  houseStylePromptKeywords,
  normalizeGenreName,
  resolveGenreSelection,
  resolveHouseStyleProfile
} from './genreCatalog';

export interface GenreProductionBlueprint {
  canonicalName: string;
  familyId: string;
  familyName: string;
  recommendedBpm: number;
  bpmRange: [number, number];
  timeSignature: string;
  keySignature: string;
  signatureIdentity: string;
  atmosphere: string;
  groove: string;
  bass: string;
  harmony: string;
  soundPalette: string;
  arrangement: string;
  vocalStyle: string;
  bannedKeywords: string[];
  isCatalogEntry: boolean;
  isCuratedSubgenre: boolean;
}

type BlueprintFields = Pick<
  GenreProductionBlueprint,
  'atmosphere' | 'groove' | 'bass' | 'harmony' | 'soundPalette' |
  'arrangement' | 'vocalStyle' | 'bannedKeywords'
>;

const familyBlueprint = (
  atmosphere: string,
  groove: string,
  bass: string,
  harmony: string,
  soundPalette: string,
  arrangement: string,
  vocalStyle: string,
  bannedKeywords: string[]
): BlueprintFields => ({
  atmosphere,
  groove,
  bass,
  harmony,
  soundPalette,
  arrangement,
  vocalStyle,
  bannedKeywords
});

/**
 * Every non-House catalog family gets the same seven production dimensions as
 * the detailed House engine. Subgenre signatures below then provide the exact
 * historical, rhythmic and timbral identity inside that family.
 */
export const GENRE_FAMILY_PRODUCTION_BLUEPRINTS: Record<string, BlueprintFields> = {
  techno: familyBlueprint(
    'hypnotic, futuristic, focused and physically immersive',
    'machine-precise four-on-the-floor pulse, disciplined hats and evolving syncopated percussion',
    'mono-compatible low-frequency pulse, sequenced bass movement and controlled kick rumble relationship',
    'sparse modal tension, repeating tonal cells and timbral development instead of song-form chord changes',
    'analog drum machines, modular sequences, resonant filters, metallic transients and spatial automation',
    'DJ-ready phrase architecture with gradual layer mutation, tension plateaus, breakdown subtraction and decisive re-entry',
    'minimal spoken, processed or textural voice unless the selected subgenre explicitly requires more',
    ['country twang', 'acoustic folk strum', 'gospel piano chorus', 'pop-rock guitar solo']
  ),
  trance: familyBlueprint(
    'hypnotic, emotional, expansive and transportive',
    'driving four-on-the-floor kick, offbeat bass pulse, rolling percussion and precisely escalating energy',
    'clean offbeat or rolling sixteenth-note bass sequence with strong sidechain separation',
    'minor-key emotional movement, suspended resolutions, long harmonic tension and memorable melodic release',
    'arpeggiators, supersaw or acid leads, evolving pads, gated textures, risers and wide delay fields',
    'extended mix-in, progressive build, breakdown, tension ramp, climactic release and harmonically resolved outro',
    'ethereal phrases, anthemic lead vocal or instrumental focus according to the exact subgenre',
    ['boom bap drums', 'reggaeton dembow', 'country instrumentation', 'sludge guitar riff']
  ),
  bass_breaks: familyBlueprint(
    'kinetic, bass-forward, syncopated and high-impact',
    'broken-beat architecture with sharp transient hierarchy, ghost notes, edits and genre-correct swing',
    'deep sub foundation plus a clearly separated signature bass voice with controlled mono low end',
    'riff-led minor harmony, modal tension and concise chord movement that leaves room for rhythmic detail',
    'edited breaks, sub bass, Reese or FM design, resampling, impacts and detailed stereo effects above the low end',
    'tension-and-release blocks, drum edits, bass call-and-response, switch-ups and a distinct second-section development',
    'chopped hooks, MC space, processed phrases or instrumental design according to the selected style',
    ['four-on-the-floor house grid', 'country acoustic strum', 'gospel choir arrangement']
  ),
  garage: familyBlueprint(
    'urban, nocturnal, soulful, agile and rhythmically playful',
    'shuffled two-step or garage-derived drums with syncopated kicks, crisp snares and swung hats',
    'deep mobile sub bass with elastic gaps that answer the drums',
    'R&B, jazz and soul-informed chords with moody minor color and concise hooks',
    'chopped vocals, organ or Rhodes stabs, glossy pads, sampled percussion and tightly controlled sub',
    'vocal or hook-led sections, bass-led dropouts, shuffled transitions and concise club-ready phrase changes',
    'pitched chops, MC cadence or soulful lead depending on the selected garage lineage',
    ['straight techno rumble', 'rock guitar solo', 'hardstyle kick tail']
  ),
  hard_dance: familyBlueprint(
    'extreme, euphoric, confrontational and rave-charged',
    'fast relentless pulse with genre-specific distorted kick rhythm, sharp claps and escalating percussion',
    'kick-derived low end, reverse bass or aggressive sub movement with strict phase control',
    'direct minor-key rave harmony, dramatic tension notes and anthem-ready resolution where appropriate',
    'distorted kicks, rave stabs, hoovers, screeches, supersaws, snare builds and high-energy impacts',
    'rapid build, signature kick reveal, breakdown contrast, forceful drop and intensified final variation',
    'shouted hook, pitched rave phrase, anthemic vocal or instrumental aggression according to subgenre',
    ['lounge jazz', 'soft indie folk', 'bossa nova groove', 'deep house restraint']
  ),
  electronic: familyBlueprint(
    'exploratory, textural, spatial and intentionally designed',
    'style-correct programmed rhythm ranging from beatless evolution to intricate electronic grids',
    'spectrally controlled electronic low end shaped to the selected style rather than a mandatory club bass',
    'timbre-aware harmony, modal or extended voicings and deliberate tension outside conventional pop formulas',
    'synthesis, sampling, granular or spectral processing, field texture and detailed spatial movement',
    'concept-led evolution with recurring motifs, contrast, transformation and a coherent sonic narrative',
    'voice may function as lead, sample, texture or be absent according to the exact electronic subgenre',
    ['generic festival drop', 'unrequested rock solo', 'automatic four-on-the-floor house beat']
  ),
  pop: familyBlueprint(
    'immediate, emotionally legible, polished and memorable',
    'tight contemporary rhythm section with a clear pocket, strong backbeat and hook-supporting dynamics',
    'melodic bass movement that reinforces chord roots while adding concise counter-rhythm',
    'clear functional harmony, memorable pre-chorus lift and chorus resolution with genre-correct color',
    'focused lead hook, polished drums, layered supporting textures and radio-ready ear-candy transitions',
    'concise intro, verse, pre-chorus, chorus, second-cycle development, bridge and final payoff',
    'intelligible lead performance with defined verses, hook, harmonies and tasteful ad-libs',
    ['extended DJ-only intro', 'atonal noise wall', 'unstructured twelve-minute jam']
  ),
  hip_hop: familyBlueprint(
    'confident, narrative, rhythm-centered and sonically focused',
    'genre-authentic kick-snare pocket with expressive hats, swing and intentional negative space for flow',
    'sub, 808 or sampled bass locked to the drum pocket without masking the vocal range',
    'loop-centered harmony, sample-aware voicing and concise melodic motifs that support lyrical cadence',
    'drum samples, sub bass, chops, keys, synth motifs and texture selected for the exact regional lineage',
    'intro, hook and verse cycles with beat drops, turnarounds and evolving details that preserve rapper space',
    'clear rhythmic phrasing space for rap, sung hook or instrumental beat according to the requested format',
    ['four-on-the-floor house kick', 'trance supersaw breakdown', 'country fiddle solo']
  ),
  rnb_soul_funk: familyBlueprint(
    'warm, sensual, expressive, human and groove-rich',
    'deep-pocket drums with nuanced swing, ghost notes and a responsive relationship between rhythm instruments',
    'melodic bass performance with syncopation, slides and dynamic conversation with the kick',
    'extended seventh, ninth and thirteenth voicings, expressive voice leading and gospel, blues or funk color',
    'Rhodes, organ, guitar, clavinet, brass, strings, analog synth and live-feeling percussion as style requires',
    'song-led form with groove development, vocal space, instrumental answers, breakdown and emotional final lift',
    'expressive lead, harmonies, call-and-response and ad-libs matched precisely to the selected tradition',
    ['industrial techno rumble', 'hardstyle kick', 'black-metal blast beat']
  ),
  rock: familyBlueprint(
    'live, dynamic, physical and ensemble-driven',
    'human drum-kit performance with genre-correct backbeat, fills, cymbal energy and push-pull timing',
    'played electric or acoustic bass that connects kick, riff and chord movement',
    'guitar-led functional, modal or riff-based harmony with authentic tension and release',
    'live drums, bass, layered guitars, amps, room sound and keys or effects appropriate to the exact lineage',
    'band-aware intro, verse, chorus or developmental form with dynamic contrast, instrumental passage and decisive ending',
    'characterful lead performance with harmonies, doubles or restraint appropriate to the selected rock style',
    ['EDM drop', 'trap hi-hat roll', 'four-on-the-floor club arrangement']
  ),
  metal: familyBlueprint(
    'intense, heavy, dramatic and physically forceful',
    'acoustic-kit attack with genre-correct double-kick, blast, groove or slow-weight patterns and articulate cymbals',
    'tight low-register bass reinforcing riffs while remaining distinct from guitars and kick',
    'riff-centered modal or chromatic harmony, power-chord architecture and style-correct dissonance or melody',
    'high-gain guitars, acoustic drums, bass, controlled saturation and any symphonic, folk or industrial layer required',
    'riff development, verse or movement contrast, breakdown or solo where authentic, and a deliberate climactic resolution',
    'clean, harsh, screamed, growled or operatic delivery only as defined by the selected metal subgenre',
    ['house kick', 'reggaeton dembow', 'bright bubblegum pop chorus']
  ),
  punk: familyBlueprint(
    'urgent, direct, rebellious and human',
    'fast live drums with decisive backbeat, energetic fills and intentionally unpolished ensemble momentum',
    'driving picked bass that follows or counters the guitar with audible midrange character',
    'concise power-chord harmony, direct melodic movement and tension born from performance energy',
    'raw guitars, live drums, bass, room spill and minimal production layers unless the exact style calls for them',
    'short forceful sections, rapid transitions, hook or gang-vocal payoff and an ending that feels played rather than looped',
    'urgent lead, gang shouts, melodic ache or abrasive scream according to the selected punk lineage',
    ['festival EDM riser', 'smooth lounge production', 'trap 808 pattern']
  ),
  jazz_blues: familyBlueprint(
    'human, expressive, harmonically rich and improvisational',
    'performed swing, shuffle, straight-eighth or blues pocket with interactive dynamics and no rigid quantization',
    'acoustic or electric bass line with voice-leading, walking motion or deep blues pocket as style requires',
    'extended harmony, blues language, substitutions, modal development and authentic tension-resolution practice',
    'natural ensemble instrumentation, room depth, articulations and conversational interplay between soloist and rhythm section',
    'head or theme, developed solos, ensemble responses, dynamic arc and musically resolved return or ending',
    'instrumental improvisation or historically appropriate blues, jazz or R&B vocal phrasing',
    ['EDM drop', 'hardstyle kick', 'machine-locked quantization', 'generic pop autotune']
  ),
  classical_cinematic: familyBlueprint(
    'dramatic, dimensional, thematic and acoustically detailed',
    'performed or score-driven pulse with natural rubato, articulation and meter rather than an imposed club grid',
    'orchestral low strings, low brass, piano or ensemble bass foundation shaped by the exact form',
    'developed thematic harmony, counterpoint, modulation and voice leading appropriate to period or screen function',
    'acoustic instruments, orchestral sections, choir, piano and selective sound design rendered with believable depth',
    'motivic exposition, development, contrast, climax and resolution aligned to the selected classical or cinematic form',
    'operatic, choral or absent unless voice is historically and stylistically required',
    ['automatic pop chorus', 'house kick grid', 'trap hi-hat roll']
  ),
  folk_country: familyBlueprint(
    'organic, intimate, narrative and rooted in human performance',
    'natural acoustic pocket with style-correct strumming, picking, train beat, waltz or ensemble timing',
    'upright, electric or acoustic bass played simply in support of song and ensemble',
    'clear song harmony, modal folk color and cadences grounded in the selected regional tradition',
    'acoustic strings, voice, hand percussion, fiddle, banjo, mandolin, pedal steel or regional instruments as appropriate',
    'story-led verse and refrain with instrumental answers, dynamic growth and an organic ending',
    'natural narrative lead with regional phrasing, harmonies and minimal artificial processing',
    ['EDM festival drop', 'industrial techno rumble', 'trap 808 rolls']
  ),
  reggae: familyBlueprint(
    'warm, spacious, communal and deeply pocketed',
    'offbeat skank, one-drop or dancehall-derived rhythm with relaxed microtiming and percussion conversation',
    'deep rounded melodic bass carrying the harmonic weight with generous space around the kick',
    'simple strong progressions, modal Caribbean color and dub-aware repetition',
    'skank guitar or keys, organ bubble, hand percussion, horns and delay or spring reverb according to exact style',
    'groove-led verse and hook cycles, dub dropouts, instrumental responses and dance-oriented energy development',
    'melodic lead, toast, chant or harmony group matched to the selected Caribbean form',
    ['four-on-the-floor house groove', 'metal guitar wall', 'trance supersaw build']
  ),
  latin: familyBlueprint(
    'passionate, social, dance-centered and rhythmically vivid',
    'clave-aware interlocking percussion with genre-specific accents, tumbao or regional dance pulse',
    'syncopated bass pattern grounded in the exact dance tradition and tightly connected to percussion',
    'regional cadences, montuno or guitar harmony, expressive dominant motion and authentic melodic phrasing',
    'hand percussion, piano, brass, guitar, strings and regional instruments selected for the exact Latin lineage',
    'dance-form sections, calls and responses, instrumental breaks, energy lifts and a culturally coherent ending',
    'Spanish, Portuguese or instrumental phrasing with authentic rhythm and no generic accent imitation',
    ['techno rumble', 'hardstyle kick', 'country-rock guitar solo']
  ),
  african: familyBlueprint(
    'communal, vital, earthy and rhythmically sophisticated',
    'interlocking polyrhythm, call-and-response percussion and style-specific dance pulse with human microtiming',
    'deep melodic bass or log-drum foundation shaped by the exact regional groove',
    'cyclical harmony, modal melody and call-and-response motifs grounded in the selected tradition',
    'regional percussion, guitars, keys, horns, voices and electronic production elements used with specificity',
    'layered groove entrances, vocal or instrumental response, dance-energy development and extended communal release',
    'language-respectful lead, chant, chorus or instrumental focus appropriate to the exact regional style',
    ['generic tribal stereotype', 'hardstyle kick', 'country twang', 'trance supersaw wall']
  ),
  global: familyBlueprint(
    'culturally specific, organic, expressive and spatially natural',
    'regional rhythm and meter preserved without forcing a Western pop, House or Hip Hop grid',
    'traditional or contemporary bass function appropriate to the selected culture and ensemble',
    'authentic modal, scalar, microtonal or functional language with region-correct ornament and cadence',
    'culture-specific instruments, articulations, ensemble roles and acoustic space without generic world-music substitution',
    'form follows the selected tradition: cyclical, narrative, improvisational, dance, devotional or composed as appropriate',
    'language, ornament, call-and-response or instrumental practice respected without invented stereotypes',
    ['generic cinematic exoticism', 'automatic EDM drop', 'unrequested four-on-the-floor beat']
  )
};

const signatureRows = (
  familyId: string,
  entries: Array<[string, string]>
): Array<[string, string]> => entries.map(([name, signature]) => [
  `${familyId}:${normalizeGenreName(name)}`,
  signature
]);

/**
 * Exact signatures cover every non-House subgenre in GENRE_FAMILIES. Keeping
 * these concise lets the seven-dimensional family blueprint remain readable
 * while preventing one subgenre from collapsing into another.
 */
const CURATED_SUBGENRE_SIGNATURES = new Map<string, string>([
  ...signatureRows('techno', [
    ['Techno', 'machine funk, hypnotic repetition, 909 authority and controlled warehouse space'],
    ['Detroit Techno', 'futurist soul chords, syncopated machine funk, melodic sequences and Motor City restraint'],
    ['Minimal Techno', 'reductive micro-events, negative space, dry transients and slow parameter evolution'],
    ['Dub Techno', 'chord stabs submerged in tape delay, deep spatial echoes, soft kick pressure and foggy ambience'],
    ['Acid Techno', 'driving 303 resonance, cutoff slides, hard 909 drums and relentless warehouse momentum'],
    ['Industrial Techno', 'metallic impacts, distorted machinery, dark drones and severe physical percussion'],
    ['Peak Time Techno', 'large controlled rumble, high-tension synth hook, forceful transitions and peak-hour drive'],
    ['Hypnotic Techno', 'polyrhythmic loops, subtle phase movement, deep repetition and immersive tonal restraint'],
    ['Hardgroove', 'fast rolling tribal percussion, funky syncopation, looped swing and powerful but agile kick'],
    ['Schranz', 'very fast distorted kicks, compressed percussion loops, harsh stabs and uncompromising momentum'],
    ['Melodic Techno', 'emotional analog motifs, arpeggiated tension, cinematic pads and a disciplined techno foundation'],
    ['Ambient Techno', 'soft machine pulse, suspended pads, environmental depth and slow-form electronic evolution'],
    ['Electro Techno', 'robotic syncopation, electro bass, sharp machine drums and futuristic modular sequences'],
    ['Ghettotech', 'fast raw drum-machine patterns, booty-bass syncopation, chopped commands and stripped club energy']
  ]),
  ...signatureRows('trance', [
    ['Trance', 'rolling bass, hypnotic arpeggios, wide pads and a long emotional tension-release arc'],
    ['Uplifting Trance', 'soaring supersaw theme, orchestral breakdown emotion, rapid rolling bass and triumphant release'],
    ['Progressive Trance', 'patient layer development, deep rolling groove, understated melody and long seamless transitions'],
    ['Psytrance', 'tight triplet or sixteenth bass, psychedelic FM sequences, intricate percussion and continuous modulation'],
    ['Goa Trance', 'spiraling acid lines, Eastern modal motifs, organic psychedelic layers and long-form narrative motion'],
    ['Tech Trance', 'hard techno-informed drums, dark stabs, driving bass and a concise high-impact trance payoff'],
    ['Vocal Trance', 'clear emotional lead vocal, lyrical breakdown, harmonized chorus and euphoric melodic lift'],
    ['Hard Trance', 'fast hard kick, reverse-bass energy, rave stabs and forceful euphoric lead'],
    ['Acid Trance', 'resonant 303 sequences, rolling trance bass, hypnotic filter automation and psychedelic breakdown'],
    ['Balearic Trance', 'sunset warmth, guitar or piano color, coastal pads and spacious euphoric melody'],
    ['Dream Trance', 'soft piano motif, luminous pads, gentle rolling pulse and nostalgic dreamlike lead']
  ]),
  ...signatureRows('bass_breaks', [
    ['Drum & Bass', '170-plus BPM breakbeat architecture, snare authority, sub pressure and rapid rhythmic detail'],
    ['Liquid Drum & Bass', 'fluid breaks, soulful chords, warm sub, airy pads and emotionally melodic movement'],
    ['Neurofunk', 'technical break edits, evolving Reese bass, dark sci-fi design and surgical transient control'],
    ['Jungle', 'chopped Amen breaks, deep reggae-informed sub, ragga energy and raw sample edits'],
    ['Jump Up', 'bouncy bass call-and-response, direct dancefloor drums, playful hooks and immediate impact'],
    ['Dancefloor Drum & Bass', 'anthemic synth hook, polished rolling breaks, vocal lift and large club-ready drop'],
    ['Breakbeat', 'syncopated broken drums, funk-derived accents, elastic bass and loop-driven electronic hooks'],
    ['Big Beat', 'oversized sampled breaks, rock-energy riffs, acid touches and cinematic sample collisions'],
    ['UK Breaks', 'tight broken beat, rave stabs, sub bass, crisp edits and underground UK club tension'],
    ['Dubstep', '140 BPM half-time weight, deep sub movement, sparse snare architecture and dark spatial design'],
    ['Brostep', 'aggressive modulated bass phrases, metallic growls, dramatic build and maximal midrange drop'],
    ['Riddim', 'minimal repetitive quarter-note bass blocks, clipped drums, negative space and head-nod call-and-response'],
    ['Future Bass', 'luminous detuned chord stacks, pitched vocal chops, elastic drums and emotional pop harmony'],
    ['EDM Trap', 'half-time festival drums, booming 808, fast hat rolls, brass stabs and impact-led drops'],
    ['Bass Music', 'sub-centered hybrid production, broken rhythm, experimental bass design and sound-system physicality'],
    ['Glitch Hop', 'mid-tempo swung breaks, funky bass modulation, granular edits and playful stop-start phrasing'],
    ['Leftfield Bass', 'unconventional rhythm, sculpted sub, abstract texture and deliberately non-formulaic club design'],
    ['Breakcore', 'extreme break slicing, abrupt edits, high-speed contrast and controlled digital chaos']
  ]),
  ...signatureRows('garage', [
    ['UK Garage', 'swinging drums, chopped R&B voice, warm sub and glossy late-night chords'],
    ['2-Step Garage', 'missing-downbeat kick pattern, sharp snare, strong swing and elastic vocal fragments'],
    ['Speed Garage', 'fast shuffled house pressure, warping bass, organ stabs and energetic chopped vocals'],
    ['Bassline', 'bouncy warping low-end hook, sparse swung drums and direct northern UK club energy'],
    ['Grime', 'cold square-wave bass, sparse 140 BPM drums, tense strings and uncompromising MC space'],
    ['Future Garage', 'ghostly vocal fragments, rain-soaked ambience, broken two-step pulse and emotional sub depth'],
    ['UK Funky', 'syncopated house pulse, African and Latin percussion, bright stabs and bass-led London swing'],
    ['Breakstep', 'garage swing fused with breakbeat edits, aggressive sub and sharp urban percussion']
  ]),
  ...signatureRows('hard_dance', [
    ['Hardcore', 'fast distorted kick foundation, rave stabs, urgent synth energy and relentless dance momentum'],
    ['Gabber', 'very hard four-on-the-floor distortion, hoover stabs, raw Rotterdam energy and abrasive drive'],
    ['Hardstyle', 'pitching hard kick, reverse bass, cinematic break and large euphoric or raw lead'],
    ['Rawstyle', 'dark screeches, heavily distorted gated kicks, anti-climax tension and severe rhythmic impact'],
    ['Happy Hardcore', 'fast bouncy kick, bright piano, chipmunk or uplifting vocal and euphoric rave melody'],
    ['Frenchcore', 'fast punchy distorted kick, melodic or orchestral sample, rolling drive and dramatic contrast'],
    ['Uptempo Hardcore', 'extreme-speed piep or distorted kicks, rapid fills and aggressive festival intensity'],
    ['Speedcore', 'ultra-fast kick barrage, noise texture, abrupt edits and deliberately extreme energy'],
    ['Makina', 'fast Spanish rave pulse, bright melodic hooks, bouncing bass and energetic sampled vocals']
  ]),
  ...signatureRows('electronic', [
    ['Electronic', 'purposeful synthesis, precise programmed rhythm and a coherent modern electronic sound world'],
    ['Electronica', 'listening-focused beats, nuanced synthesis, organic-electronic detail and album-oriented development'],
    ['IDM', 'intricate algorithmic rhythm, unusual meter or micro-editing, cerebral harmony and detailed sound design'],
    ['Ambient', 'beatless or softly pulsed space, evolving pads, long decay and immersive environmental depth'],
    ['Downtempo', 'unhurried beat, warm low end, textured harmony and relaxed cinematic progression'],
    ['Chillout', 'soft groove, luminous pads, gentle melodic hooks and calm panoramic production'],
    ['Trip Hop', 'slow dusty breakbeat, noir harmony, deep bass, vinyl texture and intimate vocal atmosphere'],
    ['Synthwave', '1980s analog polysynths, gated drums, arpeggiated bass and neon cinematic nostalgia'],
    ['Vaporwave', 'slowed nostalgic samples, pitch drift, mall-like reverb and surreal consumer-memory ambience'],
    ['Chillwave', 'hazy chorus-soaked synths, soft drum machine, blurred vocal and summer-memory warmth'],
    ['Retrowave', 'driving retro arpeggios, analog bass, gated snares and polished night-drive energy'],
    ['Electro', 'syncopated drum-machine beat, robotic bass, vocoder color and futuristic funk'],
    ['EBM', 'rigid body-music pulse, sequenced bass, shouted vocal and cold industrial synth discipline'],
    ['Industrial', 'mechanical rhythm, noise, metal impacts, distorted electronics and confrontational texture'],
    ['Noise', 'spectral density, feedback, distortion, unstable dynamics and deliberate non-tonal structure'],
    ['Glitch', 'digital errors, clicks, stutters, buffer edits and precise discontinuous rhythm'],
    ['Experimental Electronic', 'nonstandard synthesis, form-breaking transitions and an original internally coherent sonic system'],
    ['New Age', 'serene pads, acoustic or synthesized nature color, slow consonant harmony and meditative flow'],
    ['Drone', 'sustained tones, slow spectral movement, overtone interaction and monumental temporal stillness']
  ]),
  ...signatureRows('pop', [
    ['Pop', 'immediate vocal hook, contemporary drums, clear chorus lift and polished universal songwriting'],
    ['Dance Pop', 'club-ready pulse, bright synth hook, strong vocal chorus and concise dance arrangement'],
    ['Electropop', 'electronic drums, sharp synth motif, processed vocal detail and sleek pop harmony'],
    ['Synthpop', 'analog or digital synth layers, melodic bass sequence, drum-machine pulse and memorable vocal line'],
    ['Indie Pop', 'human-scale drums, jangly or textural instruments, intimate vocal and idiosyncratic hook'],
    ['Dream Pop', 'washed guitars or synths, soft pulse, ethereal vocal and lush suspended harmony'],
    ['Art Pop', 'adventurous form, sophisticated arrangement, distinctive timbre and concept-led vocal performance'],
    ['Hyperpop', 'extreme vocal processing, bright clipped drums, distorted digital bass and rapid maximalist transitions'],
    ['K-Pop', 'precision vocal production, multi-section arrangement, rap and melody contrast and high-impact choreography-ready hooks'],
    ['J-Pop', 'dense melodic writing, bright harmony, energetic rhythm and detailed instrumental counterlines'],
    ['Latin Pop', 'Latin rhythmic color, polished pop chorus, guitar or percussion identity and bilingual-ready phrasing'],
    ['Teen Pop', 'youthful clean vocal, immediate relatable hook, bright production and compact chorus-first form'],
    ['Power Pop', 'compressed live drums, crunchy guitars, melodic bass and huge concise harmony-rich chorus'],
    ['Pop Rock', 'live band drive, polished vocal hook, guitar-supported chorus and radio-ready dynamics'],
    ['Pop EDM', 'pop vocal structure, electronic build, melodic dance drop and clean festival-scale production']
  ]),
  ...signatureRows('hip_hop', [
    ['Hip Hop', 'drum-pocket authority, sample or synth motif, strong low end and clear space for lyrical flow'],
    ['Boom Bap', 'hard kick-snare knock, chopped soul or jazz sample, dusty swing and head-nod bass'],
    ['Trap', 'booming 808, rolling hats, sparse snare, dark melodic loop and half-time vocal pocket'],
    ['Drill', 'sliding 808, syncopated kick, sparse ominous melody and tense triplet-informed drum movement'],
    ['UK Drill', 'gliding bass, clipped percussion, dark piano or string motif and cold spacious vocal pocket'],
    ['Cloud Rap', 'floating pads, hazy bells, soft 808, washed texture and dreamlike melodic flow'],
    ['Lo-fi Hip Hop', 'dusty relaxed drums, vinyl texture, jazz chords and warm unobtrusive bass'],
    ['Jazz Rap', 'live or sampled jazz harmony, articulate boom-bap pocket and intelligent instrumental interplay'],
    ['Conscious Hip Hop', 'lyric-first arrangement, warm sample depth, restrained beat and emotionally supportive hook'],
    ['Gangsta Rap', 'hard deliberate drums, ominous or soulful loop, deep bass and authoritative uncluttered space'],
    ['G-Funk', 'whining lead synth, relaxed West Coast swing, deep funk bass and bright melodic keys'],
    ['Crunk', 'stomping club drums, shouted response hook, aggressive synth motif and high-energy Southern bounce'],
    ['Phonk', 'Memphis vocal fragments, cowbell melody, distorted 808, tape grit and dark drift-ready rhythm'],
    ['Memphis Rap', 'lo-fi cassette grit, eerie sample, rolling Southern drums and raw hypnotic vocal space'],
    ['Alternative Hip Hop', 'unconventional samples, elastic form, distinctive rhythm and non-formulaic lyrical atmosphere'],
    ['Afro Trap', 'trap low end fused with African percussion, melodic guitar or keys and danceable vocal cadence']
  ]),
  ...signatureRows('rnb_soul_funk', [
    ['R&B', 'expressive lead vocal, deep pocket, sophisticated chords and polished intimate production'],
    ['Rhythm and Blues', 'swinging backbeat, horns or piano, blues-rooted harmony and vocal-led danceable groove'],
    ['Contemporary R&B', 'minimal modern drums, sub bass, atmospheric keys and detailed layered vocal production'],
    ['Alternative R&B', 'unconventional texture, moody harmony, fragmented rhythm and intimate experimental voice'],
    ['Neo Soul', 'behind-the-beat pocket, Rhodes voicings, melodic live bass and natural expressive vocal nuance'],
    ['Soul', 'gospel and blues harmony, live rhythm section, emotional lead and responsive instrumental arrangement'],
    ['Motown', 'tambourine backbeat, melodic bass, concise orchestration and energetic call-and-response songcraft'],
    ['Funk', 'syncopated one-centered groove, interlocking bass, guitar and clavinet and tight horn punctuation'],
    ['P-Funk', 'rubbery synth bass, cosmic keyboards, group chants and extended psychedelic funk groove'],
    ['Disco', 'four-on-the-floor pulse, octave bass, strings, rhythm guitar and glamorous soulful vocal lift'],
    ['Nu Disco', 'modern clean low end, analog disco synths, polished funk guitar and contemporary club arrangement'],
    ['Boogie', 'early-1980s drum machines, slap or synth bass, glossy keys and relaxed post-disco funk'],
    ['Quiet Storm', 'slow luxurious groove, electric piano, warm strings or pads and intimate romantic lead vocal'],
    ['Gospel', 'church-rooted piano and organ, choir call-and-response, dynamic spiritual build and powerful lead'],
    ['New Jack Swing', 'swinging programmed drums, punchy synth bass, R&B harmony and energetic vocal-hook choreography']
  ]),
  ...signatureRows('rock', [
    ['Rock', 'live drums, electric guitar riffs, played bass and direct dynamic songcraft'],
    ['Rock and Roll', 'backbeat drive, blues-based guitar, walking or boogie bass and exuberant early-rock energy'],
    ['Classic Rock', 'large live drums, tube-amplified guitars, melodic bass and timeless riff-and-chorus structure'],
    ['Alternative Rock', 'contrasting guitar texture, dynamic quiet-loud movement and distinctive non-mainstream vocal character'],
    ['Indie Rock', 'jangly or angular guitars, human drums, personal vocal and intentionally individual production'],
    ['Psychedelic Rock', 'fuzz guitar, tape effects, modal jams, swirling stereo and consciousness-expanding arrangement'],
    ['Progressive Rock', 'long-form movements, odd meters, thematic development, virtuosic ensemble and harmonic modulation'],
    ['Hard Rock', 'heavy riff, powerful backbeat, driving bass, guitar solo and forceful melodic lead vocal'],
    ['Garage Rock', 'raw room drums, overdriven simple guitar, urgent vocal and deliberately unpolished impact'],
    ['Surf Rock', 'spring-reverb guitar, rapid picking, driving toms and bright instrumental coastal energy'],
    ['Glam Rock', 'stomping beat, theatrical vocal, crunchy guitars and glittering hook-driven arrangement'],
    ['Southern Rock', 'bluesy twin guitars, laid-back groove, organ color and expansive roots-informed soloing'],
    ['Post-Rock', 'instrumental motif growth, delayed guitars, wide dynamics and long cinematic crescendo'],
    ['Shoegaze', 'dense layered guitar wash, buried ethereal vocal, pedal texture and luminous harmonic blur'],
    ['Grunge', 'heavy detuned riff, raw loud-soft dynamics, forceful drums and emotionally abrasive vocal'],
    ['Britpop', 'bright British guitar pop, melodic bass, witty vocal phrasing and anthem-ready chorus']
  ]),
  ...signatureRows('metal', [
    ['Heavy Metal', 'twin-guitar riffs, galloping or driving drums, powerful clean vocal and expressive lead solo'],
    ['Thrash Metal', 'fast palm-muted riffs, aggressive picking, rapid double-kick and shouted rhythmic vocal'],
    ['Death Metal', 'low chromatic riffs, blast or double-kick drums, guttural vocal and extreme precision'],
    ['Black Metal', 'tremolo-picked guitars, blast beats, raw icy atmosphere and harsh distant vocal'],
    ['Doom Metal', 'very slow colossal riffs, sustained low-end weight, dark harmony and mournful spacious vocal'],
    ['Power Metal', 'fast melodic guitars, double-kick drive, heroic harmony and soaring clean chorus'],
    ['Progressive Metal', 'odd-meter riffs, technical ensemble, thematic development and wide clean-to-heavy contrast'],
    ['Symphonic Metal', 'orchestral and choral layers, heavy guitar foundation, dramatic modulation and operatic or powerful lead'],
    ['Metalcore', 'melodic heavy riffs, tight breakdown, double-kick drums and screamed verse with clean hook potential'],
    ['Deathcore', 'downtuned extreme riffs, blast beats, massive breakdown and deep harsh vocal techniques'],
    ['Nu Metal', 'syncopated low riffs, hip-hop-informed groove, electronic texture and raw rhythmic vocal delivery'],
    ['Folk Metal', 'metal rhythm section fused with authentic regional folk melody and traditional instruments'],
    ['Industrial Metal', 'mechanical programmed pulse, high-gain riff, samples and cold repetitive machine texture'],
    ['Sludge Metal', 'slow dirty riff, hardcore abrasion, feedback and oppressive low-mid weight'],
    ['Stoner Metal', 'fuzz-saturated riff, psychedelic groove, warm low tuning and extended hypnotic development'],
    ['Glam Metal', 'bright high-gain guitars, large drums, melodic hooks, gang vocals and virtuosic solo']
  ]),
  ...signatureRows('punk', [
    ['Punk Rock', 'fast power chords, direct backbeat, raw vocal and concise rebellious hook'],
    ['Hardcore Punk', 'very fast drums, shouted vocal, abrasive guitar and short explosive sections'],
    ['Pop Punk', 'bright palm-muted guitars, energetic drums, melodic vocal and huge youthful chorus'],
    ['Post-Punk', 'angular guitar, prominent bass, dry drums, tense minimal harmony and detached artful vocal'],
    ['Ska Punk', 'upstroke guitar, walking bass, horns, fast punk drums and buoyant offbeat energy'],
    ['Emo', 'dynamic guitar interplay, confessional vocal, melodic tension and cathartic chorus'],
    ['Screamo', 'volatile quiet-loud movement, dissonant guitar, frantic drums and intensely screamed expression'],
    ['Crust Punk', 'd-beat or pounding drums, heavily distorted guitars, bleak atmosphere and harsh shouted vocal'],
    ['Oi!', 'stomping street-punk rhythm, simple guitar, gang chorus and direct communal chant'],
    ['Riot Grrrl', 'raw punk attack, feminist directness, urgent vocal and stripped forceful arrangement'],
    ['Post-Hardcore', 'angular heavy guitars, rhythmic complexity, dynamic contrast and mixed melodic or screamed vocal']
  ]),
  ...signatureRows('jazz_blues', [
    ['Jazz', 'interactive ensemble, swing or elastic time, extended harmony and improvised thematic conversation'],
    ['Bebop', 'fast walking bass, ride-cymbal swing, complex substitutions and agile horn improvisation'],
    ['Cool Jazz', 'restrained dynamics, airy phrasing, subtle rhythm section and sophisticated spacious voicings'],
    ['Hard Bop', 'blues and gospel-inflected harmony, hard swing, soulful horn lines and driving rhythm section'],
    ['Modal Jazz', 'open modal harmony, long improvisational development, pedal points and exploratory ensemble space'],
    ['Free Jazz', 'nonfunctional collective improvisation, elastic pulse, extended technique and spontaneous form'],
    ['Jazz Fusion', 'electric instruments, complex groove, extended harmony and virtuosic rock or funk-informed improvisation'],
    ['Smooth Jazz', 'polished laid-back groove, lyrical sax or guitar lead, warm keys and clean accessible harmony'],
    ['Swing', 'four-beat walking pulse, ride pattern, riff-based ensemble writing and buoyant dance energy'],
    ['Big Band', 'sectional brass and reeds, shout choruses, arranged dynamics and powerful swing rhythm section'],
    ['Dixieland', 'collective front-line improvisation, tuba or bass pulse, banjo rhythm and joyful early-jazz polyphony'],
    ['Latin Jazz', 'clave-aware percussion, jazz harmony, montuno motion and improvisation over Afro-Latin groove'],
    ['Acid Jazz', 'funk break, jazz chords, organ or Rhodes, sampled texture and club-aware live groove'],
    ['Blues', 'twelve-bar or blues-derived form, blue notes, call-and-response and emotionally direct phrasing'],
    ['Delta Blues', 'solo or sparse acoustic guitar, bottleneck slide, raw vocal and flexible rural blues pulse'],
    ['Chicago Blues', 'amplified guitar and harmonica, shuffle rhythm section and tough urban call-and-response'],
    ['Electric Blues', 'amplified lead guitar, strong backbeat, expressive bends and driving bass pocket'],
    ['Rhythm and Blues', 'swinging backbeat, horns or piano, blues harmony and vocal-led danceable groove']
  ]),
  ...signatureRows('classical_cinematic', [
    ['Classical', 'balanced acoustic ensemble, thematic clarity, functional development and natural concert dynamics'],
    ['Baroque', 'contrapuntal lines, basso continuo, ornamentation, terraced dynamics and period-informed articulation'],
    ['Romantic', 'expanded chromatic harmony, expressive rubato, sweeping orchestration and intense thematic emotion'],
    ['Contemporary Classical', 'modern extended harmony, novel texture, acoustic detail and concept-driven composed form'],
    ['Minimalism', 'repeating cells, gradual process, additive rhythm and slowly shifting consonant harmony'],
    ['Opera', 'dramatic operatic voice, orchestral support, recitative-to-aria pacing and theatrical emotional arc'],
    ['Chamber Music', 'small acoustic ensemble, intimate room, transparent counterpoint and conversational phrasing'],
    ['Symphony', 'multi-section orchestral development, thematic transformation, full dynamic range and architectural scale'],
    ['Orchestral', 'realistic section voicing, acoustic depth, developed motif and balanced orchestral color'],
    ['Choral', 'blended vocal sections, text-aware phrasing, resonant acoustic space and part-writing clarity'],
    ['Film Score', 'leitmotif, scene-responsive orchestration, emotional pacing and integrated cinematic sound design'],
    ['Soundtrack', 'memorable theme, narrative atmosphere, scene-scale transitions and medium-appropriate production'],
    ['Trailer Music', 'low ostinato, hybrid percussion, rising orchestral layers, braams and timed climactic payoff'],
    ['Epic Music', 'heroic theme, massive orchestral and choir layers, thunderous percussion and sustained climax'],
    ['Waltz', 'three-quarter pulse, accented first beat, elegant melodic turn and balanced dance phrasing'],
    ['Viennese Waltz', 'fast three-quarter sweep, flowing strings, graceful rubato and authentic ballroom lift'],
    ['Neoclassical', 'classical instrumental language fused with modern harmonic, cinematic or electronic restraint']
  ]),
  ...signatureRows('folk_country', [
    ['Folk', 'acoustic storytelling, simple memorable melody, natural voice and region-aware instrumental support'],
    ['Indie Folk', 'intimate vocal, fingerpicked guitar, warm room texture and subtle contemporary arrangement'],
    ['Contemporary Folk', 'traditional acoustic foundation, modern songwriting clarity and polished natural production'],
    ['Traditional Folk', 'region-specific melody, inherited form, authentic acoustic instruments and unforced communal phrasing'],
    ['Celtic Folk', 'fiddle, whistle, pipes or bouzouki, modal melody and jig, reel or ballad-informed rhythm'],
    ['Bluegrass', 'rapid acoustic picking, banjo, mandolin, fiddle, upright bass and high-lonesome harmony'],
    ['Country', 'story lyric, guitar-led rhythm section, fiddle or steel color and direct memorable chorus'],
    ['Americana', 'roots blend of folk, country and blues, weathered instruments and lived-in narrative voice'],
    ['Country Pop', 'country guitar or steel identity, polished drums, modern vocal and concise crossover chorus'],
    ['Outlaw Country', 'lean live band, twang guitar, defiant narrative and rough-edged honky-tonk character'],
    ['Alternative Country', 'roots instrumentation with indie texture, darker harmony and unconventional songwriting detail'],
    ['Western', 'open-range cinematic guitar, cowboy rhythm, fiddle or harmonica and frontier narrative atmosphere'],
    ['Singer-Songwriter', 'voice-and-song priority, intimate accompaniment, lyrical detail and dynamic human performance']
  ]),
  ...signatureRows('reggae', [
    ['Reggae', 'offbeat skank, deep melodic bass, relaxed drum pocket and warm communal vocal'],
    ['Roots Reggae', 'one-drop feel, spiritual or social lyric, organ bubble, horns and deep analog bass'],
    ['Dub', 'bass-and-drum foundation, spring reverb, tape delay, mixer dropouts and evolving studio space'],
    ['Dancehall', 'digital or acoustic riddim, syncopated bass, sharp percussion and deejay-led hook'],
    ['Ska', 'fast offbeat guitar, walking bass, horns and exuberant accented backbeat'],
    ['Rocksteady', 'slower soulful groove, prominent bass, sweet harmony vocal and restrained guitar or organ'],
    ['Lovers Rock', 'romantic lead vocal, smooth reggae pocket, lush keys and warm melodic bass'],
    ['Ragga', 'digital dancehall rhythm, rapid deejay flow, hard bass and energetic sampled accents'],
    ['Calypso', 'lilting syncopation, steelpan or brass color, witty vocal and buoyant Caribbean melody'],
    ['Soca', 'fast carnival pulse, driving percussion, bright synth or brass and ecstatic call-and-response']
  ]),
  ...signatureRows('latin', [
    ['Reggaeton', 'dembow pulse, deep sub or bass, sparse melodic loop and commanding vocal pocket'],
    ['Dembow', 'fast repetitive Dominican dembow rhythm, direct bass, chant hook and raw dance energy'],
    ['Salsa', 'clave, piano montuno, tumbao bass, congas, brass mambos and vocal call-and-response'],
    ['Bachata', 'syncopated requinto guitar, güira, bongos, melodic bass and intimate romantic vocal'],
    ['Merengue', 'fast two-beat dance pulse, güira, tambora, accordion or brass and continuous festive drive'],
    ['Cumbia', 'cumbia pulse, hand percussion, melodic bass and regional accordion, guitar or electronic color'],
    ['Bossa Nova', 'soft syncopated guitar, understated percussion, extended jazz harmony and intimate phrasing'],
    ['Samba', 'layered Brazilian percussion, syncopated cavaquinho or guitar, surdo foundation and communal lift'],
    ['Tango', 'bandoneon-led drama, marcato rhythm, chromatic harmony and sharp expressive phrasing'],
    ['Mambo', 'brass riffs, clave, piano montuno, energetic breaks and tightly arranged dance-band power'],
    ['Bolero', 'slow romantic pulse, guitar or orchestral accompaniment and highly expressive lyrical melody'],
    ['Rumba', 'clave-centered hand drums, call-and-response voice and layered Afro-Cuban rhythmic conversation'],
    ['Flamenco', 'compás accuracy, palmas, nylon guitar, cante expression and authentic modal ornament'],
    ['Mariachi', 'violins, trumpets, vihuela, guitarrón and powerful Mexican ensemble vocal phrasing'],
    ['Regional Mexican', 'style-correct Mexican ensemble, dance rhythm, narrative vocal and regional instrumental identity'],
    ['Latin Jazz', 'Afro-Latin percussion and clave fused with jazz voicings, improvisation and horn interplay'],
    ['Latin Pop', 'Latin rhythmic accent, polished vocal hook, contemporary harmony and crossover-ready production']
  ]),
  ...signatureRows('african', [
    ['Afrobeats', 'syncopated percussion, melodic bass, bright guitar or keys and smooth contemporary vocal hooks'],
    ['Afrobeat', 'extended polyrhythmic groove, interlocking guitars, horns, call-and-response and political funk energy'],
    ['Amapiano', 'log-drum bass, shakers, jazzy keys, spacious South African groove and patient dancefloor development'],
    ['Highlife', 'interlocking bright guitars, horn lines, danceable bass and flowing West African vocal melody'],
    ['Kwaito', 'slowed house-derived beat, deep bass, township vocal cadence and sparse South African groove'],
    ['Gqom', 'dark sparse Durban rhythm, heavy broken kick patterns, chant energy and raw minimal electronic pressure'],
    ['Soukous', 'fast sparkling Congolese guitars, sebene acceleration, lively bass and joyful dance momentum'],
    ['Makossa', 'Cameroonian bass groove, guitar and horn interplay, syncopated percussion and expressive vocal'],
    ['Coupé-Décalé', 'fast Ivorian dance rhythm, bright synth or guitar, shouted calls and celebratory percussion'],
    ['Gnawa', 'guembri bass, qraqeb metal castanets, cyclical chant and trance-inducing Moroccan groove'],
    ['Rai', 'Algerian vocal ornament, gasba or synth color, North African rhythm and modern pop-folk fusion'],
    ['Mbalax', 'sabar drum complexity, rapid Senegalese rhythmic conversation, melodic bass and powerful vocal'],
    ['Bongo Flava', 'Tanzanian pop melody, Swahili vocal flow, Afrobeats or hip-hop rhythm and East African color']
  ]),
  ...signatureRows('global', [
    ['World Music', 'explicitly identified regional instrumentation and rhythm rather than an interchangeable global hybrid'],
    ['Middle Eastern', 'maqam-aware melody, oud or qanun color, hand percussion and ornamented regional phrasing'],
    ['Arabic Music', 'maqam development, quarter-tone-aware ornament, oud, qanun, nay and iqa rhythmic identity'],
    ['Indian Classical', 'raga development, tala cycle, drone, ornament and improvisational dialogue with authentic instruments'],
    ['Carnatic', 'South Indian raga and tala discipline, gamaka ornament, mridangam and composed-improvised development'],
    ['Bollywood', 'cinematic Indian melody, orchestral and electronic fusion, dance rhythm and expressive playback-style vocal'],
    ['Bhangra', 'dhol-driven Punjabi dance pulse, tumbi hook, energetic bass and exuberant call-and-response'],
    ['Qawwali', 'harmonium, tabla, handclaps, devotional lead-and-chorus response and escalating ecstatic repetition'],
    ['Japanese Traditional', 'shamisen, koto, shakuhachi or taiko with Japanese scale, articulation and spatial restraint'],
    ['Chinese Traditional', 'erhu, guzheng, pipa or dizi with pentatonic phrasing, ornament and authentic ensemble space'],
    ['Klezmer', 'clarinet-led ornament, violin, accordion, dance pulse and expressive Ashkenazi modal inflection'],
    ['Balkan Music', 'asymmetrical meter, brass or folk ensemble, rapid ornament and high-energy regional dance phrasing'],
    ['Polka', 'bright two-beat dance rhythm, accordion, tuba or bass and buoyant repeated melodic phrases'],
    ['Fado', 'Portuguese guitar, intimate accompaniment, saudade-rich harmony and intensely expressive lead vocal'],
    ['Celtic Music', 'fiddle, whistle, harp or pipes, modal melody and region-correct reel, jig, air or ballad form']
  ])
]);

interface StyleModifier {
  pattern: RegExp;
  patch: Partial<BlueprintFields>;
}

const STYLE_MODIFIERS: StyleModifier[] = [
  {
    pattern: /\b(?:minimal|minimalism|micro)\b/,
    patch: {
      atmosphere: 'reductive, spacious, focused and built around microscopic change',
      arrangement: 'slow additive and subtractive evolution, precise negative space and no oversized generic climax'
    }
  },
  {
    pattern: /\b(?:progressive|symphony|symphonic|post-rock)\b/,
    patch: {
      arrangement: 'long-form thematic development, clearly earned transitions, escalating contrast and a resolved final arc'
    }
  },
  {
    pattern: /\b(?:ambient|drone|chillout|downtempo|dream|future garage)\b/,
    patch: {
      atmosphere: 'spacious, immersive, patient and rich in environmental depth',
      arrangement: 'slow spectral and textural evolution with soft phrase transitions instead of compulsory drops'
    }
  },
  {
    pattern: /\b(?:acid)\b/,
    patch: {
      soundPalette: 'resonant acid sequencing with authentic cutoff, resonance, accent and slide behavior integrated into the family sound'
    }
  },
  {
    pattern: /\b(?:industrial|ebm|noise)\b/,
    patch: {
      atmosphere: 'cold, mechanical, confrontational and texturally severe',
      soundPalette: 'metal impacts, machinery, controlled distortion, noise and intentionally hard electronic surfaces'
    }
  },
  {
    pattern: /\b(?:liquid|smooth|cool|quiet storm|lovers rock|chillwave)\b/,
    patch: {
      atmosphere: 'fluid, warm, refined and emotionally relaxed',
      harmony: 'smooth extended voicings, lyrical movement and consonant emotional resolution'
    }
  },
  {
    pattern: /\b(?:hard|hardcore|rawstyle|gabber|schranz|speedcore|uptempo|thrash|death|black|crust)\b/,
    patch: {
      atmosphere: 'intense, uncompromising and physically forceful while remaining faithful to the exact selected style'
    }
  },
  {
    pattern: /\b(?:vocal|opera|gospel|singer-songwriter|fado|qawwali)\b/,
    patch: {
      vocalStyle: 'the lead voice is structurally central, clearly intelligible or traditionally ornamented, and supported by authentic harmonies and responses'
    }
  },
  {
    pattern: /\b(?:jazz|soul|gospel|bop|fusion|blues)\b/,
    patch: {
      harmony: 'extended voicings, voice leading, blues or gospel color and human harmonic tension appropriate to the exact selected lineage'
    }
  },
  {
    pattern: /\b(?:traditional|classical|folk|celtic|bluegrass|flamenco|mariachi|gnawa|carnatic)\b/,
    patch: {
      soundPalette: 'historically and regionally authentic acoustic instruments, articulations and ensemble roles with no generic substitution'
    }
  }
];

const GENERIC_BLUEPRINT = familyBlueprint(
  'coherent, intentional and faithful to the exact user-selected style',
  'genre-correct rhythm, meter, accents, microtiming and performance feel',
  'genre-correct low-end function with clean separation and authentic movement',
  'genre-correct harmonic language, scale, cadence and melodic ornament',
  'authentic instrumentation, timbre, articulation and production technique for the selected genre',
  'style-correct form, phrase length, transitions, energy arc and ending',
  'voice, language, phrasing and processing only where authentic to the selected genre',
  ['unrequested genre fusion', 'generic style substitution']
);

function curatedSignature(familyId: string, canonicalName: string): string | null {
  return CURATED_SUBGENRE_SIGNATURES.get(
    `${familyId}:${normalizeGenreName(canonicalName)}`
  ) || null;
}

export function hasCuratedGenreSignature(value: string): boolean {
  const house = resolveHouseStyleProfile(value);
  if (house) return true;
  const selection = resolveGenreSelection(value);
  const canonicalName = selection.matchedGenre || selection.requestedGenre;
  return Boolean(curatedSignature(selection.familyId, canonicalName));
}

export function resolveGenreProductionBlueprint(value: string): GenreProductionBlueprint {
  const house = resolveHouseStyleProfile(value);
  if (house) {
    return {
      canonicalName: house.name,
      familyId: 'house',
      familyName: 'House',
      recommendedBpm: house.recommendedBpm,
      bpmRange: house.bpmRange,
      timeSignature: '4/4',
      keySignature: house.keySignature,
      signatureIdentity: `exact ${house.name}: ${house.soundPalette}`,
      atmosphere: house.atmosphere,
      groove: house.groove,
      bass: house.bass,
      harmony: house.harmony,
      soundPalette: house.soundPalette,
      arrangement: house.arrangement,
      vocalStyle: house.vocalStyle,
      bannedKeywords: house.bannedKeywords,
      isCatalogEntry: true,
      isCuratedSubgenre: true
    };
  }

  const selection = resolveGenreSelection(value);
  const canonicalName = selection.matchedGenre || selection.requestedGenre;
  const signature = curatedSignature(selection.familyId, canonicalName);
  const family = GENRE_FAMILIES.find(item => item.id === selection.familyId);
  const base = GENRE_FAMILY_PRODUCTION_BLUEPRINTS[selection.familyId] || GENERIC_BLUEPRINT;
  const normalizedName = normalizeGenreName(canonicalName);
  const modifiers = STYLE_MODIFIERS.filter(modifier => modifier.pattern.test(normalizedName));
  const merged = modifiers.reduce<BlueprintFields>((current, modifier) => ({
    ...current,
    ...modifier.patch,
    bannedKeywords: Array.from(new Set([
      ...current.bannedKeywords,
      ...(modifier.patch.bannedKeywords || [])
    ]))
  }), { ...base, bannedKeywords: [...base.bannedKeywords] });

  return {
    canonicalName,
    familyId: selection.familyId,
    familyName: selection.familyName,
    recommendedBpm: selection.recommendedBpm,
    bpmRange: selection.bpmRange,
    timeSignature: selection.timeSignature,
    keySignature: selection.keySignature,
    signatureIdentity: signature || `exact ${canonicalName}: preserve its documented rhythm, instrumentation, harmony, form and cultural context without substitution`,
    atmosphere: merged.atmosphere,
    groove: merged.groove,
    bass: merged.bass,
    harmony: merged.harmony,
    soundPalette: signature
      ? `${signature}; ${merged.soundPalette}`
      : merged.soundPalette,
    arrangement: merged.arrangement,
    vocalStyle: merged.vocalStyle,
    bannedKeywords: merged.bannedKeywords,
    isCatalogEntry: selection.isCatalogEntry || Boolean(family?.subgenres.includes(canonicalName)),
    isCuratedSubgenre: Boolean(signature)
  };
}

export function genreProductionPromptKeywords(
  blueprint: GenreProductionBlueprint
): string[] {
  if (blueprint.familyId === 'house') {
    const house = resolveHouseStyleProfile(blueprint.canonicalName);
    if (house) {
      return [
        `SIGNATURE_IDENTITY: ${blueprint.signatureIdentity}`,
        ...houseStylePromptKeywords(house)
      ];
    }
  }

  return [
    `SIGNATURE_IDENTITY: ${blueprint.signatureIdentity}`,
    `ATMOSPHERE: ${blueprint.atmosphere}`,
    `GROOVE: ${blueprint.groove}`,
    `BASS_IDENTITY: ${blueprint.bass}`,
    `HARMONIC_LANGUAGE: ${blueprint.harmony}`,
    `SIGNATURE_PALETTE: ${blueprint.soundPalette}`,
    `ARRANGEMENT_ARC: ${blueprint.arrangement}`,
    `VOCAL_DIRECTION: ${blueprint.vocalStyle}`
  ];
}

export function countCuratedCatalogSubgenres(): number {
  return GENRE_FAMILIES.reduce((count, family) =>
    count + family.subgenres.filter(name => hasCuratedGenreSignature(name)).length,
  0);
}
