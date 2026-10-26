export interface MusicFamilyProfile {
  identity: string;
  instrumentation: string;
  rhythm: string;
  harmony: string;
  arrangement: string;
  production: string;
  avoid: string;
}

export const MUSIC_FAMILY_DNA_VERSION = 'sonara-family-dna-v1';

export const MUSIC_FAMILY_PROFILES: Record<string, MusicFamilyProfile> = {
  'Electronic / Dance': {
    identity: 'Electronic sound generation, sequencing, sampling, synthesis, sound design or electronic processing must remain a primary part of the musical language; club, breakbeat and beatless branches stay distinct according to the selected genre.',
    instrumentation: 'Use synthesizers, drum machines, samplers, electronic bass, processed percussion, controllers and effects as genre-appropriate primary colors; acoustic instruments may appear only when they support the selected electronic style.',
    rhythm: 'The rhythmic grammar must come from the selected electronic branch: four-on-the-floor, broken beat, halftime, fast breaks, sequenced pulse or intentionally beatless motion; never impose one universal dance pattern on every electronic genre.',
    harmony: 'Harmony may be modal, tonal, loop-based, textural or minimal, but it must be voiced and developed through the electronic language of the selected genre rather than generic band or cinematic writing.',
    arrangement: 'Use electronic phrase logic, automation, layering, drops, breakdowns, textural development or ambient evolution only where authentic to the selected genre and subgenre.',
    production: 'Electronic timbre, transient design, low-end architecture, modulation, spatial effects and automation must sound deliberate, controlled and style-specific rather than like preset auditioning.',
    avoid: 'Do not let the result default to generic pop, generic rock, orchestral underscore or acoustic-band writing; do not force EDM festival conventions onto ambient, experimental or non-club electronic subgenres.'
  },
  'Hip-Hop / Rap': {
    identity: 'Beat, pocket, flow space, rhythmic phrasing and hip-hop production lineage must remain central whether the track is vocal, instrumental, classic, trap, drill, regional or experimental.',
    instrumentation: 'Use drums, bass or 808, samples, turntable-derived texture, keys, synths, live instruments or regional colors according to the selected branch, always leaving intentional rhythmic space for rap or hip-hop phrasing.',
    rhythm: 'Kick, snare, hats, swing, subdivision, syncopation and bass placement must create a recognizable hip-hop pocket; the exact pocket follows the selected subgenre rather than a generic dance pulse.',
    harmony: 'Harmony is often loop-centered, sample-derived, modal, soulful, sparse or atmospheric; it must support groove and phrasing without turning the track into unrelated pop, EDM or rock.',
    arrangement: 'Use verse, hook, cypher, beat-switch, intro, bridge or instrumental development in a way that preserves hip-hop pacing and bar logic.',
    production: 'Prioritize drum authority, bass translation, vocal space, sample or synth character and controlled impact with the texture appropriate to the era and subgenre.',
    avoid: 'Do not replace the hip-hop pocket with four-on-the-floor EDM, generic pop backing, rock-band default writing or unrelated cinematic scoring; regional rap branches must keep their own local rhythmic and production language.'
  },
  Pop: {
    identity: 'Pop must prioritize memorable melodic communication, hook clarity, accessible song architecture and intentional contemporary or era-specific polish while preserving the exact selected pop branch.',
    instrumentation: 'Use vocals, drums, bass, keys, guitars, synths, strings or regional instruments as needed, but every layer must serve the main melody, hook and section contrast rather than distract from the song.',
    rhythm: 'Rhythm must support hook delivery and section lift with a stable, readable pocket; dance, urban, acoustic and regional pop branches keep their own groove instead of sharing one generic pop beat.',
    harmony: 'Use clear functional, modal or modern pop harmony with strong voice leading and memorable melodic support, while allowing the selected subgenre to define sophistication and color.',
    arrangement: 'Build immediate identity, verse or exposition, lift, memorable refrain or hook, contrast and a resolved final section with disciplined section length and clear musical payoff.',
    production: 'Deliver focused lead elements, controlled low end, polished transients, intelligible vocals, deliberate width and competitive clarity without flattening the musical dynamics.',
    avoid: 'Do not let pop become a reason to erase the selected regional, electronic, rock, R&B or experimental branch; avoid generic radio templates that replace the requested subgenre identity.'
  },
  Rock: {
    identity: 'Rock must retain the physical interaction, riff or song energy and amplified band language associated with guitars, bass, drums and live performance, adjusted to the selected rock branch.',
    instrumentation: 'Electric or acoustic guitars, bass, live drums, vocals, keyboards and effects should behave like interacting performers with credible amplifier, room, articulation and dynamic behavior.',
    rhythm: 'The groove must feel performed by a rock rhythm section with genre-correct backbeat, drive, swing, subdivision or asymmetry rather than quantized electronic default timing.',
    harmony: 'Riffs, chord movement, modal language, melodic hooks and tension-release must follow the selected rock tradition, from roots forms to progressive or alternative vocabulary.',
    arrangement: 'Use band-led sections, riffs, verses, refrains, instrumental passages, dynamic builds and performed transitions with genuine interaction and energy changes.',
    production: 'Preserve amplifier texture, drum impact, bass-guitar relationship, room energy and human dynamics with the degree of polish appropriate to the selected era and subgenre.',
    avoid: 'Do not turn ordinary rock into generic EDM, programmed pop or cinematic underscore; do not add metal-level heaviness, extreme vocals or double-kick language unless the selected rock subgenre genuinely calls for it.'
  },
  Metal: {
    identity: 'Metal must maintain weight, riff authority, intensity and the performance vocabulary of its selected branch, whether fast, extreme, progressive, atmospheric, doom-oriented or modern.',
    instrumentation: 'Distorted or heavy guitars, bass, powerful acoustic or hybrid drums, vocals and genre-specific keyboards or orchestration must retain realistic heavy-performance articulation and register.',
    rhythm: 'Riff and drum interaction must carry metal identity through palm-muted precision, gallop, blast, double-kick, syncopation, odd meter, slow monolithic weight or other branch-specific behavior.',
    harmony: 'Use riff-centered tonal, modal, chromatic or dissonant language appropriate to the selected metal branch, with tension and resolution matching its emotional weight.',
    arrangement: 'Develop riffs, thematic returns, breakdowns, solos, atmospheric passages, tempo contrasts or long-form structures according to the chosen subgenre, never as random heaviness.',
    production: 'Maintain controlled low-end mass, guitar definition, drum impact, vocal presence and dynamic density without collapsing into clipping, plastic samples or undifferentiated distortion.',
    avoid: 'Do not soften metal into generic rock or pop, and do not apply the same extreme-metal vocabulary to every branch; heaviness, speed, vocal style and production must follow the exact selected subgenre.'
  },
  'R&B / Soul / Funk': {
    identity: 'Pocket, expressive phrasing, bass movement, vocal or melodic nuance and Black American R&B, soul or funk lineage must remain audible while the selected branch controls era and production style.',
    instrumentation: 'Use expressive vocals or lead lines, bass, drums, electric piano, organ, guitar, synths, horns, strings and percussion according to the branch, with responsive ensemble interaction.',
    rhythm: 'Prioritize deep pocket, syncopation, swing, subdivision and bass-drum conversation; funk may be more percussive, soul more song-led and R&B more spacious or programmed.',
    harmony: 'Use soulful voice leading, extended chords, blues-derived movement, chromatic color or modern sparse harmony according to the selected style.',
    arrangement: 'Let groove and vocal or melodic narrative develop through verses, refrains, vamps, breaks, call-and-response, instrumental answers and dynamic lifts appropriate to the branch.',
    production: 'Preserve warmth, intimacy, transient control, low-end groove, vocal detail and the acoustic/electronic balance of the selected era rather than applying generic pop polish.',
    avoid: 'Do not replace pocket with rigid EDM timing, generic trap unless the subgenre explicitly requires it, rock-band default writing or over-compressed pop production that erases soul and groove.'
  },
  Jazz: {
    identity: 'Jazz must preserve interactive musicianship, improvisational or improvisation-informed phrasing, sophisticated rhythmic conversation and the harmonic or modal language of the selected jazz branch.',
    instrumentation: 'Use acoustic or electric jazz ensembles such as drums, bass, piano or Rhodes, guitar, brass, reeds, vibraphone, voice and branch-specific electronic instruments with credible live interaction.',
    rhythm: 'Swing, straight-eighth, Latin, funk, free, odd-meter or ballad time must be articulated through interactive time feel, comping and phrase response rather than static quantized loops.',
    harmony: 'Extended harmony, substitutions, modal development, chromatic voice leading, blues language or free-harmonic practice must follow the selected branch and support real musical conversation.',
    arrangement: 'Use heads, themes, solos, ensemble passages, backgrounds, trades, development and returns as appropriate, with form awareness and responsive dynamics.',
    production: 'Preserve instrument separation, room realism, transient detail, dynamic range and ensemble depth, from intimate acoustic recording to polished electric fusion.',
    avoid: 'Do not collapse jazz into cocktail background music, generic pop chords, static loops or random complexity; the exact jazz branch must define swing, harmony, instrumentation and degree of improvisation.'
  },
  Blues: {
    identity: 'Blues must preserve blues phrasing, call-and-response, expressive pitch inflection, groove and emotional directness rooted in the selected regional or electric/acoustic branch.',
    instrumentation: 'Use voice, guitar, harmonica, piano or organ, bass, drums and branch-specific ensemble colors with believable bends, slides, attacks, space and interaction.',
    rhythm: 'Use shuffle, straight, slow, jump, boogie or regional blues feel with human pocket and phrase response rather than generic rock or programmed pop timing.',
    harmony: 'Blues form, dominant-function color, turnarounds, modal blues language and expressive melodic tension must remain recognizable even when the branch expands beyond twelve-bar form.',
    arrangement: 'Develop vocal or instrumental statements, responses, solos, turnarounds and dynamic lifts with live-performance logic and room for expressive phrasing.',
    production: 'Keep amplifier, room, vocal, string and drum character appropriate to the era, from raw acoustic intimacy to controlled modern electric blues.',
    avoid: 'Do not replace blues language with generic rock riffs, jazz complexity for its own sake, pop chord loops or over-produced electronic textures unless explicitly part of the selected branch.'
  },
  'Reggae / Jamaican': {
    identity: 'Jamaican rhythmic and sound-system lineage must remain central through bass authority, offbeat or dancehall phrasing, drum feel, space and branch-specific vocal or instrumental delivery.',
    instrumentation: 'Use deep bass, drums, skank guitar or keyboards, organ, percussion, horns, vocals, samples and dub processing where appropriate to the selected Jamaican branch.',
    rhythm: 'One-drop, rockers, steppers, ska, rocksteady, dancehall or related Jamaican grooves must be executed distinctly with authentic placement, swing and bass-drum relationship.',
    harmony: 'Harmony is often cyclical and song-focused, leaving space for groove, bass and vocal phrasing; chord color and melodic language must follow the selected branch.',
    arrangement: 'Use riddim development, vocal sections, instrumental answers, drops, dub space, horn passages or dancehall structure as appropriate rather than generic verse-chorus automation.',
    production: 'Prioritize bass translation, drum pocket, offbeat clarity and authentic use of spring, delay, filtering, sampling or modern digital production according to the era.',
    avoid: 'Do not confuse Jamaican styles with generic tropical, Latin, Afrobeat or EDM music; ska, roots, dub, rocksteady and dancehall must keep their own rhythmic and production identities.'
  },
  'Latin America': {
    identity: 'Latin American family identity must come from the specific regional dance, song and rhythmic tradition selected, with culturally grounded pulse, phrasing and ensemble behavior rather than a generic Latin label.',
    instrumentation: 'Use percussion, guitars, bass, piano, brass, strings, accordion, bandoneon and regional instruments only where authentic to the selected country, genre and subgenre.',
    rhythm: 'Clave, tumbao, dembow, samba-derived cells, cumbia pulse, bachata, tango, corrido, Andean or other regional rhythmic systems must remain distinct and must never be blended indiscriminately.',
    harmony: 'Harmony and melody must follow the selected regional practice, from jazz-rich Brazilian language to tonal romantic song, montuno-based movement, modal folk or contemporary urban harmony.',
    arrangement: 'Respect the form and ensemble logic of the chosen tradition: dance cycles, coro-pregon, song form, instrumental dialogue, regional breaks, dramatic tango phrasing or modern urban structure as appropriate.',
    production: 'Preserve percussion separation, groove hierarchy, acoustic or electronic regional color and culturally appropriate vocal phrasing while using modern polish only when the selected branch supports it.',
    avoid: 'Do not reduce Latin America to generic salsa percussion, reggaeton dembow, tropical presets or EDM drops; never import a defining rhythm or instrument from a different Latin tradition without the selected subgenre supporting it.'
  },
  Africa: {
    identity: 'African family identity must respect the specific regional lineage selected, using authentic rhythmic, melodic, vocal and ensemble relationships rather than treating the continent as one generic sound.',
    instrumentation: 'Use guitars, bass, drums, percussion, keyboards, horns, voices, electronic production and traditional instruments only as appropriate to the selected West, East, Central, Southern, North or diasporic-linked branch.',
    rhythm: 'Polyrhythm, interlocking parts, log-drum movement, highlife pulse, Afrobeat groove, gqom weight, gnawa cycle or other regional systems must remain distinct and accurately prioritized.',
    harmony: 'Use the tonal, modal, cyclical, pentatonic, jazz-derived or contemporary harmonic language of the selected style with melody and call-and-response appropriate to its lineage.',
    arrangement: 'Let groove evolve through interlocking parts, vocal response, horn or guitar conversation, percussion development, dance-floor progression or ritual repetition according to the selected genre.',
    production: 'Balance rhythmic clarity, bass movement, vocal presence, live ensemble character and contemporary African electronic production without flattening regional differences.',
    avoid: 'Do not use a generic tribal stereotype, interchangeable hand-drum loop or pan-African preset; never substitute one regional African groove, language or instrumentation for another merely because both belong to Africa.'
  },
  Caribbean: {
    identity: 'Caribbean family identity must preserve the selected island or regional dance and song lineage through syncopation, bass movement, percussion, melodic phrasing and social dance energy.',
    instrumentation: 'Use drums, hand percussion, bass, guitars, keyboards, horns, steelpan, accordion, electronic instruments or regional colors only when appropriate to calypso, soca, kompa, zouk, chutney and related branches.',
    rhythm: 'Each Caribbean style must keep its own rhythmic cell, subdivision and bass-percussion relationship rather than borrowing Jamaican reggae or Latin American grooves by default.',
    harmony: 'Use bright, cyclical, song-oriented or creole-influenced harmony and melody as appropriate, preserving the selected tradition and language context.',
    arrangement: 'Build dance and song forms through groove development, vocal hooks, instrumental responses, horn or synth passages and culturally appropriate transitions.',
    production: 'Keep percussion definition, bass propulsion, vocal clarity and the acoustic/electronic balance of the selected island style with energetic but controlled mastering.',
    avoid: 'Do not collapse Caribbean music into reggae, reggaeton, salsa or generic tropical pop; the selected Caribbean tradition must remain identifiable without relying on stereotypes.'
  },
  'Middle East / North Africa': {
    identity: 'Middle Eastern and North African family identity must preserve the selected Arabic, Persian, Turkish, Hebrew, Maghrebi or related modal, rhythmic and performance lineage rather than a generic exotic color.',
    instrumentation: 'Use oud, qanun, ney, darbuka, frame drums, strings, regional lutes, keyboards, electric instruments and modern production only where appropriate to the exact selected tradition.',
    rhythm: 'Regional iqa or usul-derived cycles, dabke drive, chaabi pulse, raï groove, mahraganat programming and other branch-specific rhythms must remain distinct.',
    harmony: 'Maqam, dastgah, makam, modal ornamentation, microtonal inflection or modern tonal harmony must be used according to the selected genre and cultural context.',
    arrangement: 'Respect taqsim, song, dance, ensemble, orchestral, pop or electronic form appropriate to the selected branch, with authentic ornamentation and tension development.',
    production: 'Preserve melodic ornament, percussion articulation, vocal diction, acoustic resonance and modern regional production language without forcing Western pop equalization onto every branch.',
    avoid: 'Do not use generic oriental scales, stock belly-dance percussion or interchangeable Middle Eastern presets; never flatten distinct Arabic, Persian, Turkish, Israeli or North African traditions into one sound.'
  },
  'South Asia': {
    identity: 'South Asian family identity must preserve the selected classical, devotional, folk, film or contemporary regional lineage through melodic ornament, rhythmic organization, vocal phrasing and cultural context.',
    instrumentation: 'Use tabla, dhol, mridangam, sitar, sarod, veena, harmonium, bansuri, strings, guitars, synths, electronic drums and regional instruments only where appropriate to the selected branch.',
    rhythm: 'Tala, bhangra or dhol-derived patterns, film grooves, folk cycles and contemporary programmed rhythms must remain distinct and should not be reduced to one Bollywood beat.',
    harmony: 'Raga-based melodic development, drones, modal systems, devotional repetition, folk melody or modern tonal harmony must follow the selected genre rather than generic Western chord progression.',
    arrangement: 'Use alap and development, kriti or song form, qawwali escalation, film-song architecture, folk cycles or modern pop structure according to the selected branch.',
    production: 'Preserve ornamentation, percussion transients, vocal clarity, drone or bass support and the acoustic/electronic balance authentic to the chosen South Asian style.',
    avoid: 'Do not label every South Asian result Bollywood; never mix Hindustani, Carnatic, Punjabi, Bengali, Pakistani, Sri Lankan or devotional practices indiscriminately when the selected style is more specific.'
  },
  'East Asia': {
    identity: 'East Asian family identity must preserve the specific Japanese, Korean, Chinese, Taiwanese, Hong Kong or Mongolian context selected; regional pop, rock, hip-hop and traditional forms must remain culturally distinct.',
    instrumentation: 'Use contemporary band, electronic and orchestral palettes or regional traditional instruments only where appropriate to the selected country, genre and era.',
    rhythm: 'Rhythmic behavior may range from polished pop and rock to hip-hop, trot, city pop or traditional meter, but it must follow the selected regional style rather than a generic Asian preset.',
    harmony: 'Use the melodic, tonal, pentatonic, jazz-influenced, modal or contemporary harmonic language appropriate to the selected branch, with authentic phrasing and cadence.',
    arrangement: 'Respect the section density, hook strategy, instrumental form, vocal pacing and dramatic development characteristic of the selected East Asian genre.',
    production: 'Match the selected regional production culture in vocal treatment, transient precision, synth or band balance, stereo detail and dynamic shape without erasing its identity.',
    avoid: 'Do not treat East Asian music as one interchangeable sound; never replace Japanese, Korean, Chinese or Mongolian characteristics with another country merely because the broad family is shared.'
  },
  'Southeast Asia': {
    identity: 'Southeast Asian family identity must preserve the exact Indonesian, Thai, Vietnamese, Filipino, Malaysian, Cambodian, Lao, Burmese or related tradition selected, whether popular or traditional.',
    instrumentation: 'Use regional tuned percussion, gongs, strings, winds, drums, guitars, keyboards, synths and modern pop instrumentation only where authentic to the selected tradition.',
    rhythm: 'Gamelan interlock, dangdut pulse, luk thung or mor lam groove, pop rhythm and other regional systems must remain distinct rather than being replaced by generic East Asian or South Asian patterns.',
    harmony: 'Regional tuning, cyclical melody, pentatonic or modal language and modern tonal harmony must follow the selected branch and its ensemble practice.',
    arrangement: 'Use cyclical ensemble form, vocal song architecture, dance structure or contemporary pop development according to the selected tradition and performance context.',
    production: 'Preserve tuning character, percussion detail, vocal diction, ensemble balance and regional modern production aesthetics rather than homogenizing the family.',
    avoid: 'Do not conflate Southeast Asian traditions with Chinese, Japanese, Indian or generic tropical music; the selected country or tradition must remain identifiable.'
  },
  'Country / Americana': {
    identity: 'Country and Americana must preserve roots-oriented storytelling, string-instrument interaction, songcraft and the live or studio performance language of the selected American branch.',
    instrumentation: 'Use acoustic or electric guitar, pedal steel, fiddle, banjo, mandolin, upright or electric bass, drums, piano, dobro and vocal harmony as appropriate to the selected style.',
    rhythm: 'Two-step, train beat, shuffle, straight country pocket, bluegrass drive, western swing or roots-rock feel must follow the selected branch with human time and ensemble interaction.',
    harmony: 'Use clear roots harmony, modal folk color, blues influence, country cadences and melodic voice leading appropriate to the selected era and subgenre.',
    arrangement: 'Let storytelling, verse-refrain form, instrumental fills, solos, harmony vocals and dynamic band changes develop naturally with a performed ending.',
    production: 'Keep strings, vocals, drums and room or amplifier character believable, from raw acoustic Americana to polished modern country without losing roots identity.',
    avoid: 'Do not turn country into generic pop or rock unless the selected crossover style requires it; avoid synthetic EDM rhythm, cinematic orchestration or unrelated urban production replacing the roots core.'
  },
  'Folk / Traditional Europe': {
    identity: 'European folk and traditional music must preserve the selected regional song, dance, modal, linguistic and instrumental practice rather than applying a generic old-world or Celtic surface.',
    instrumentation: 'Use fiddle, pipes, accordion, regional guitars and lutes, bouzouki, mandolin, frame drums, flutes, voices and other local instruments only where appropriate to the selected tradition.',
    rhythm: 'Dance meters, rubato song phrasing, drones, asymmetric Balkan cycles, flamenco compas, folk-rock pulse or other regional timing must remain specific to the chosen style.',
    harmony: 'Use modal, drone-based, tonal, ornamented or regional harmonic language according to the tradition, with authentic cadence and melodic contour.',
    arrangement: 'Respect ballad, dance, ensemble, call-and-response, solo-song or contemporary folk form and the phrase lengths of the selected regional practice.',
    production: 'Preserve acoustic resonance, ensemble space, vocal language and instrument articulation; modern production may support but must not erase regional character.',
    avoid: 'Do not make every European folk style Celtic, medieval or cinematic; never substitute instruments, meters or ornamentation from another European tradition without stylistic justification.'
  },
  'Neomelodica Napoletana': {
    identity: 'Neapolitan neomelodic music must keep expressive Neapolitan melodic identity, direct romantic or dramatic storytelling, vocal centrality and recognizable southern Italian phrasing even when modern pop, urban or dance production is used.',
    instrumentation: 'Use expressive lead voice, piano or keyboards, lyrical strings, clean guitar, bass, drums and tasteful synth or urban layers while preserving a clearly Neapolitan melodic and vocal center.',
    rhythm: 'Rhythm must support sung phrasing and emotional section lift; modern pop, trap, Latin or dance elements remain secondary to the Neapolitan song identity.',
    harmony: 'Use memorable tonal harmony, strong cadences, emotive modulation or contemporary color that supports cantabile Neapolitan melody and a highly singable refrain.',
    arrangement: 'Build narrative verses, rising transitions, large emotional refrains, instrumental or vocal contrast and a resolved final climax with clear dramatic storytelling.',
    production: 'Keep the lead voice intimate and intelligible, strings and keys emotionally supportive, low end controlled and modern polish warm rather than synthetic or anonymous.',
    avoid: 'Do not let generic Italian pop, reggaeton, trap, EDM or cinematic production erase Neapolitan melody, language, phrasing and emotional song structure; modern hybrid elements must remain subordinate.'
  },
  'Classical / Art Music': {
    identity: 'Classical and art music must prioritize composed form, thematic or textural development, idiomatic acoustic or electroacoustic writing and deliberate large-scale musical architecture.',
    instrumentation: 'Use orchestral, chamber, solo, choral, operatic or electroacoustic forces with realistic ranges, articulation, balance and ensemble behavior appropriate to the selected period or movement.',
    rhythm: 'Meter, rubato, counterpoint, pulse, rhythmic motive and temporal freedom must follow the selected period or compositional language rather than a pop or loop-based default.',
    harmony: 'Tonal counterpoint, functional harmony, chromaticism, modality, impressionism, serialism, minimalism or contemporary language must match the chosen classical branch.',
    arrangement: 'Develop motifs, themes, movements, recitative and aria, chamber dialogue, orchestral form or textural process with genuine compositional continuity and resolved structure.',
    production: 'Preserve acoustic depth, dynamic range, orchestral or chamber perspective, realistic resonance and score-like balance unless an electroacoustic branch explicitly requires another approach.',
    avoid: 'Do not force verse-chorus pop form, loop repetition, trailer cliches or synthetic orchestral shortcuts onto classical writing; period and ensemble practice must remain specific.'
  },
  'Gospel / Spiritual': {
    identity: 'Gospel and spiritual music must preserve devotional purpose, communal or contemplative expression and the specific religious or cultural performance lineage selected rather than imposing one faith tradition on all branches.',
    instrumentation: 'Use voice, choir, organ, piano, rhythm section, handclaps, harmonium, regional percussion, drones, acoustic instruments or restrained electronic support only where appropriate to the selected devotional tradition.',
    rhythm: 'Gospel pocket, congregational pulse, handclap drive, chant cycle, devotional tala, nasheed pacing or meditative repetition must follow the selected branch and its worship context.',
    harmony: 'Use gospel harmony, drones, modal devotional melody, call-and-response, hymn language or tradition-specific melodic systems according to the selected style.',
    arrangement: 'Build testimony, refrain, choir response, chant escalation, devotional repetition, meditative development or worship lift in a way authentic to the chosen branch.',
    production: 'Preserve vocal sincerity, communal space, intelligibility, dynamic rise and the acoustic or modern production language appropriate to the selected tradition.',
    avoid: 'Do not apply Christian gospel choir language to non-Christian devotional styles, and do not turn devotional music into generic pop, cinematic uplift or dance music unless the selected branch explicitly supports it.'
  },
  'Cinematic / Media': {
    identity: 'Cinematic and media music must serve narrative, scene, character, edit or interactive function through deliberate motif, pacing, orchestration and sound design appropriate to the selected medium.',
    instrumentation: 'Use orchestra, chamber ensemble, synths, sound design, percussion, guitars, choir, game-console timbres or hybrid layers according to the selected score, trailer, game or media branch.',
    rhythm: 'Pulse, ostinato, free timing, action rhythm, edit-point architecture or ambient pacing must follow narrative function rather than generic song or club groove.',
    harmony: 'Leitmotif, thematic harmony, modal color, tension, dissonance, tonal resolution or textural harmony must support story and emotional arc.',
    arrangement: 'Develop cue-like form with setup, evolution, contrast, hit points, climax, release or loopability as required by the selected media context.',
    production: 'Create depth, scale, transient control, orchestral realism, synth integration and edit-ready dynamics without masking thematic content.',
    avoid: 'Do not substitute generic trailer bombast for film score, generic pop song form for underscore or cinematic pads for every media genre; the selected medium and cue type must determine structure.'
  },
  'Experimental / Avant-Garde': {
    identity: 'Experimental and avant-garde music must use deliberate exploration of sound, form, process, texture, performance or technology as the central compositional idea rather than accidental incoherence.',
    instrumentation: 'Use acoustic instruments, electronics, field recordings, found sound, noise, extended techniques, synthesis, tape or digital processing according to the selected experimental practice.',
    rhythm: 'Rhythm may be metric, fractured, stochastic, textural, pulse-free or process-driven, but it must follow a coherent artistic system rather than random timing.',
    harmony: 'Pitch organization may be tonal, atonal, microtonal, spectral, noise-based, drone-based or absent; the chosen method must remain internally consistent.',
    arrangement: 'Use process, transformation, montage, accumulation, reduction, spatial movement, improvisation or conceptual form with an intentional beginning, development and ending.',
    production: 'Treat texture, dynamics, noise, space, recording artifacts and signal processing as compositional parameters with controlled technical execution.',
    avoid: 'Do not force conventional pop, EDM or cinematic structure onto experimental music, but also do not confuse experimentation with arbitrary noise, broken audio, clipping or directionless randomness.'
  },
  'Easy Listening / Lounge': {
    identity: 'Easy Listening and Lounge must remain smooth, elegant, relaxed and intentionally accessible, with polished ensemble color and restrained emotional intensity appropriate to background or focused listening.',
    instrumentation: 'Use soft rhythm section, piano, electric piano, guitar, strings, brass, woodwinds, light percussion and tasteful synths according to the selected lounge or easy-listening branch.',
    rhythm: 'Keep grooves relaxed, controlled and danceable or gently flowing without aggressive transient density, extreme syncopation or heavy club pressure unless the branch requires it.',
    harmony: 'Use warm tonal or jazz-influenced harmony, smooth voice leading and melodic clarity with enough color to remain sophisticated but not intrusive.',
    arrangement: 'Develop concise themes, instrumental answers, soft section contrast and graceful transitions with controlled dynamics and no unnecessary dramatic escalation.',
    production: 'Favor warm balance, soft transients, clean mids, elegant stereo space and comfortable loudness while retaining live-instrument or period character.',
    avoid: 'Do not turn lounge into aggressive EDM, hard rock, metal, extreme jazz or trailer music; intensity, distortion and rhythmic pressure must remain subordinate to the selected relaxed identity.'
  },
  'Children / Novelty / Spoken': {
    identity: 'This family is purpose-led: children music must be clear and age-appropriate, novelty music must communicate its comic or unusual concept, and spoken forms must prioritize intelligible narrative, poetry or dramatic delivery.',
    instrumentation: 'Use simple or imaginative acoustic, electronic and orchestral colors that directly support the selected purpose, voice, story, humor or educational function without unnecessary sonic density.',
    rhythm: 'Keep pulse and phrasing readable for the selected audience or spoken cadence; comedy and novelty may use deliberate contrast, while spoken word follows language rhythm rather than forced beat.',
    harmony: 'Use clear memorable harmony for children material, concept-supporting harmony for novelty songs and restrained or textural support for spoken forms according to the selected branch.',
    arrangement: 'Structure the piece around story, learning goal, refrain, comedic setup and payoff, poem, monologue or audio-drama scene so that every musical section supports communication.',
    production: 'Prioritize intelligibility, safe dynamics, clean speech or singing, clear effects and an inviting tonal balance appropriate to the selected audience and format.',
    avoid: 'Do not apply adult aggressive, frightening or explicit aesthetics to children material; do not bury spoken content under dense music, and do not force conventional song form onto poetry or audio drama.'
  }
};

const FALLBACK_PROFILE: MusicFamilyProfile = {
  identity: 'Preserve the selected musical family as the outer stylistic boundary before applying genre and subgenre details.',
  instrumentation: 'Use instrumentation that belongs to the selected family and exact subgenre rather than unrelated default sounds.',
  rhythm: 'Use the rhythmic grammar of the selected family and exact subgenre without cross-family drift.',
  harmony: 'Use harmonic and melodic language that belongs to the selected family and exact subgenre.',
  arrangement: 'Use phrase structure and form authentic to the selected family and exact subgenre.',
  production: 'Use production conventions appropriate to the selected family and exact subgenre.',
  avoid: 'Do not substitute another musical family, generic pop, generic EDM, generic cinematic music or unrelated cultural vocabulary.'
};

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

export function getMusicFamilyProfile(family: unknown): MusicFamilyProfile {
  const requested = normalize(family);
  const exact = Object.entries(MUSIC_FAMILY_PROFILES).find(([name]) => normalize(name) === requested);
  return exact?.[1] || FALLBACK_PROFILE;
}

export function hasMusicFamilyProfile(family: unknown): boolean {
  const requested = normalize(family);
  return Object.keys(MUSIC_FAMILY_PROFILES).some(name => normalize(name) === requested);
}

export default {
  MUSIC_FAMILY_DNA_VERSION,
  MUSIC_FAMILY_PROFILES,
  getMusicFamilyProfile,
  hasMusicFamilyProfile
};
