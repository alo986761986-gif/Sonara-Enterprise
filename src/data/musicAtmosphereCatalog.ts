export interface MusicAtmosphere {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export interface MusicAtmosphereGroup {
  id: string;
  label: string;
  atmospheres: MusicAtmosphere[];
}

const atmosphere = (
  id: string,
  name: string,
  description: string,
  prompt: string
): MusicAtmosphere => ({ id, name, description, prompt });

export const MUSIC_ATMOSPHERE_CATALOG: MusicAtmosphereGroup[] = [
  {
    id: 'deep-intimate',
    label: 'Deep / Intime / Notturne',
    atmospheres: [
      atmosphere('deep-relaxed', 'Profonda e Rilassata', 'Calda, avvolgente, ipnotica, elegante e notturna.', 'deep warm enveloping hypnotic nighttime elegance, intimate lounge feeling, electric piano chords, soft pads, restrained soulful textures'),
      atmosphere('night-elegant', 'Notturna ed Elegante', 'Raffinata, urbana, sofisticata e da club tardivo.', 'sophisticated late-night club atmosphere, polished warm low end, elegant chord voicings, subtle sensual movement, refined urban mood'),
      atmosphere('intimate', 'Intima e Ravvicinata', 'Piccola, personale, delicata e vicina all’ascoltatore.', 'intimate close-up atmosphere, soft dynamics, warm detailed textures, gentle groove, personal emotional proximity'),
      atmosphere('warm-soulful', 'Calda e Soulful', 'Morbida, umana, ricca di armonie soul e calore analogico.', 'warm soulful atmosphere, rich electric piano harmony, rounded bass, expressive human phrasing, smooth analog warmth'),
      atmosphere('dreamy', 'Sognante', 'Fluttuante, morbida, sospesa e immaginifica.', 'dreamy floating atmosphere, blurred soft synth pads, airy harmonics, gentle motion, spacious reverberant dreamscape'),
      atmosphere('sensual', 'Sensuale', 'Morbida, lenta, magnetica e fisica.', 'sensual magnetic atmosphere, silky groove, warm bass, intimate harmonic tension, smooth late-night movement'),
      atmosphere('smoky-lounge', 'Smoky Lounge', 'Scura ma confortevole, jazzata e da lounge notturna.', 'smoky lounge atmosphere, muted jazzy chords, soft low light mood, subtle swing, warm bass and intimate room tone'),
      atmosphere('introspective', 'Introspettiva', 'Riflessiva, raccolta, emotiva e contemplativa.', 'introspective reflective atmosphere, restrained arrangement, minor-key emotional detail, spacious pauses, thoughtful harmonic movement')
    ]
  },
  {
    id: 'sunny-open-air',
    label: 'Solari / Estive / Open Air',
    atmospheres: [
      atmosphere('sunny-summer', 'Solare ed Estiva', 'Spensierata, luminosa, calda e marittima.', 'sunny carefree summer atmosphere, warm open-air energy, light melodic hooks, exotic percussion, breezy acoustic touches, seaside festival feeling'),
      atmosphere('tropical-beach', 'Tropicale da Spiaggia', 'Palmizi, sabbia, mare, cocktail e ritmo leggero.', 'tropical beach atmosphere, bright plucks, gentle island percussion, warm breeze feeling, relaxed dance groove, ocean-side sunlight'),
      atmosphere('balearic-sunset', 'Tramonto Balearico', 'Ampia, emozionale, dorata e mediterranea.', 'Balearic sunset atmosphere, golden-hour warmth, spacious pads, gentle percussion, emotional horizon-wide chords, Mediterranean open-air mood'),
      atmosphere('sunrise', 'Alba', 'Progressiva, luminosa, delicata e piena di apertura.', 'sunrise atmosphere, gradually brightening harmony, airy pads, soft rhythmic lift, optimistic open horizon, fresh morning energy'),
      atmosphere('daylight', 'Diurna e Luminosa', 'Chiara, pulita, positiva e trasparente.', 'bright daylight atmosphere, clean open mix, positive major-key color, crisp percussion, transparent melodic textures'),
      atmosphere('festival-open-air', 'Festival Open Air', 'Grande, aperta, energica e collettiva.', 'open-air festival atmosphere, wide energetic build, crowd-scale impact, uplifting hooks, expansive stereo field, powerful outdoor dancefloor energy'),
      atmosphere('coastal-breeze', 'Brezza Costiera', 'Leggera, fresca, fluida e rilassante.', 'coastal breeze atmosphere, airy percussion, smooth bass, soft sunlit chords, fresh spacious movement, relaxed seaside flow'),
      atmosphere('poolside', 'Poolside Chic', 'Elegante, brillante, rilassata e mondana.', 'poolside chic atmosphere, polished relaxed groove, glossy synth details, warm bass, stylish sunny luxury mood')
    ]
  },
  {
    id: 'emotional-euphoric',
    label: 'Emotive / Euforiche / Trionfali',
    atmospheres: [
      atmosphere('emotional-triumphant', 'Emozionante e Trionfale', 'Crescendo, tensione, liberazione e grande apertura emotiva.', 'emotional triumphant atmosphere, long tension-and-release arc, soaring synth layers, huge spacious build, euphoric payoff, widescreen melodic lift'),
      atmosphere('euphoric', 'Euforica', 'Esplosiva, luminosa, liberatoria e da mani al cielo.', 'pure euphoric atmosphere, uplifting harmonic lift, radiant lead melody, powerful release, hands-in-the-air dancefloor energy'),
      atmosphere('anthemic', 'Anthemica', 'Grande, memorabile, corale e da festival.', 'anthemic atmosphere, memorable hook, huge chorus-scale progression, bold rhythmic drive, crowd-unifying energy'),
      atmosphere('emotional', 'Emotiva', 'Sentita, melodica, intensa e umana.', 'deeply emotional atmosphere, expressive melody, rich harmonic movement, tender tension, powerful human feeling'),
      atmosphere('hopeful', 'Speranzosa', 'Ascendente, luminosa, positiva e fiduciosa.', 'hopeful uplifting atmosphere, rising melodic contour, bright harmonic resolution, gentle optimism, forward-moving emotional energy'),
      atmosphere('melancholic', 'Malinconica', 'Dolceamara, notturna, profonda e vulnerabile.', 'melancholic atmosphere, minor-key tenderness, wistful melody, soft spacious textures, vulnerable late-night emotion'),
      atmosphere('bittersweet', 'Dolceamara', 'Felice e triste insieme, nostalgica e intensa.', 'bittersweet atmosphere, emotional contrast between warmth and sadness, nostalgic chords, tender melody, subtle unresolved tension'),
      atmosphere('romantic', 'Romantica', 'Calda, sentimentale, morbida e appassionata.', 'romantic atmosphere, warm expressive harmony, tender melodic phrasing, intimate emotional glow, soft passionate dynamics'),
      atmosphere('nostalgic', 'Nostalgica', 'Ricordo, memoria, passato e calore emotivo.', 'nostalgic atmosphere, memory-like harmonic color, vintage warmth, wistful melodic fragments, emotional sense of distance and time'),
      atmosphere('majestic', 'Maestosa', 'Solenne, ampia, potente e autorevole.', 'majestic atmosphere, broad harmonic scale, powerful sustained layers, confident grandeur, wide cinematic emotional space')
    ]
  },
  {
    id: 'tribal-organic-spiritual',
    label: 'Tribali / Organiche / Spirituali',
    atmospheres: [
      atmosphere('tribal-primordial', 'Tribale e Primordiale', 'Percussiva, terrena, spirituale e legata al movimento del corpo.', 'tribal primordial atmosphere, earthy drums, polyrhythmic percussion, ritual body movement, organic textures, deep ancestral energy'),
      atmosphere('spiritual', 'Spirituale', 'Profonda, elevata, rituale e contemplativa.', 'spiritual atmosphere, meditative harmonic space, ceremonial percussion, soulful chants or vocal textures, transcendent warmth'),
      atmosphere('ritualistic', 'Rituale', 'Ripetitiva, cerimoniale, ipnotica e collettiva.', 'ritualistic atmosphere, repeated ceremonial patterns, drums and chants, circular hypnotic motion, collective trance feeling'),
      atmosphere('earthy', 'Terrena', 'Naturale, calda, secca e fisica.', 'earthy organic atmosphere, natural percussion, woody transients, warm low frequencies, grounded body-centered groove'),
      atmosphere('organic', 'Organica', 'Acustica, naturale, respirata e viva.', 'organic atmosphere, acoustic instruments blended with subtle electronics, natural percussion, breathing dynamics, warm human texture'),
      atmosphere('shamanic', 'Sciamanica', 'Mistico-rituale, profonda, ripetitiva e trasformativa.', 'shamanic atmosphere, trance-inducing drums, mystical vocal textures, deep resonant drones, ritual transformation feeling'),
      atmosphere('ancestral', 'Ancestrale', 'Antica, radicata, materica e identitaria.', 'ancestral atmosphere, rooted rhythmic motifs, raw hand percussion, deep resonant bass, timeless communal energy'),
      atmosphere('mystical', 'Mistica', 'Segreta, evocativa, spirituale e sospesa.', 'mystical atmosphere, enigmatic tonal colors, spacious reverberation, ritual bells or textures, spiritual suspense'),
      atmosphere('sacred', 'Sacra', 'Solenne, pura, meditativa e cerimoniale.', 'sacred atmosphere, solemn harmonic space, reverent vocal or choral textures, restrained ceremonial motion, luminous spiritual depth')
    ]
  },
  {
    id: 'hypnotic-psychedelic-acid',
    label: 'Ipnotiche / Psichedeliche / Acid',
    atmospheres: [
      atmosphere('hypnotic-acid', 'Ipnotica e Acida', 'Aliena, psichedelica, ribelle, risonante e futuristica.', 'hypnotic acid atmosphere, resonant squelchy 303-style motion, psychedelic repetition, alien electronic tension, rebellious warehouse trance'),
      atmosphere('hypnotic', 'Ipnotica', 'Ripetitiva, magnetica, profonda e senza tempo.', 'hypnotic atmosphere, evolving repetition, micro-variation, locked groove, gradual modulation, deep trance-like focus'),
      atmosphere('psychedelic', 'Psichedelica', 'Colorata, deformata, visionaria e imprevedibile.', 'psychedelic atmosphere, warped modulation, kaleidoscopic timbres, surreal transitions, elastic spatial movement, altered-state energy'),
      atmosphere('trance-inducing', 'Trance Inducing', 'Continua, circolare, pulsante e immersiva.', 'trance-inducing atmosphere, continuous pulse, circular motifs, controlled repetition, deep rhythmic immersion, slowly evolving layers'),
      atmosphere('hallucinatory', 'Allucinatoria', 'Irreale, liquida, instabile e sensoriale.', 'hallucinatory atmosphere, liquid sound design, unstable stereo motion, dreamlike tonal bending, surreal immersive detail'),
      atmosphere('cosmic', 'Cosmica', 'Spaziale, infinita, stellare e trascendente.', 'cosmic atmosphere, vast space, sparkling high frequencies, deep sub movement, celestial pads, infinite futuristic horizon'),
      atmosphere('alien', 'Aliena', 'Non umana, estranea, sintetica e inquietante.', 'alien atmosphere, unfamiliar synthetic timbres, strange resonances, nonhuman rhythmic gestures, futuristic unsettling space'),
      atmosphere('surreal', 'Surreale', 'Onirica, impossibile, strana e cinematica.', 'surreal atmosphere, dream-logic transitions, unexpected textures, unusual spatial perspective, strange but coherent emotional flow'),
      atmosphere('mesmeric', 'Mesmerica', 'Magnetica, elegante, ripetitiva e seducente.', 'mesmeric atmosphere, elegant repetitive hook, subtle modulation, seductive pulse, deep sustained focus')
    ]
  },
  {
    id: 'vocal-soulful-joy',
    label: 'Vocali / Soulful / Gioiose',
    atmospheres: [
      atmosphere('joyful-vocal', 'Gioiosa e Cantata', 'Positiva, calda, euforica, comunitaria e vocale.', 'joyful vocal atmosphere, uplifting soulful singing, warm communal energy, positive chord progression, celebratory dancefloor release'),
      atmosphere('gospel-euphoric', 'Gospel Euforica', 'Spirituale, potente, corale e piena di gioia.', 'gospel euphoric atmosphere, powerful choir-inspired vocals, hand-clap energy, uplifting piano harmony, communal spiritual celebration'),
      atmosphere('diva-house', 'Diva House', 'Grande voce, sicurezza, glamour e club energy.', 'diva house atmosphere, commanding soulful lead vocal, glamorous club energy, bold piano or synth stabs, confident uplifting groove'),
      atmosphere('soulful-vocal', 'Soulful Vocale', 'Calda, umana, intensa e melodica.', 'soulful vocal atmosphere, expressive lead voice, warm chords, human phrasing, emotional groove, rich harmonic depth'),
      atmosphere('communal', 'Comunitaria', 'Corale, inclusiva, collettiva e festosa.', 'communal atmosphere, call-and-response feeling, group vocal energy, inclusive dancefloor warmth, collective rhythmic lift'),
      atmosphere('celebratory', 'Celebrativa', 'Festa, successo, energia e sorriso.', 'celebratory atmosphere, bright rhythmic accents, uplifting harmony, joyful hooks, confident party energy'),
      atmosphere('flirty', 'Giocosa e Flirty', 'Leggera, seducente, divertente e ritmica.', 'flirty playful atmosphere, cheeky rhythmic hooks, light sensual movement, bright details, fun confident groove'),
      atmosphere('uplifting-vocal', 'Vocale Uplifting', 'Aperta, positiva, melodica e liberatoria.', 'uplifting vocal atmosphere, soaring melodic vocal phrases, open major-key lift, emotional release, bright expansive production')
    ]
  },
  {
    id: 'minimal-underground-raw',
    label: 'Minimal / Underground / Raw',
    atmospheres: [
      atmosphere('raw-minimal', 'Cruda e Sottile', 'Fredda, essenziale, metropolitana, oscura e micro-dettagliata.', 'raw minimal atmosphere, sparse underground club design, cold metropolitan space, tiny repetitive micro-sounds, disciplined low-end groove'),
      atmosphere('minimal', 'Minimal', 'Essenziale, pulita, ripetitiva e controllata.', 'minimal atmosphere, reduced elements, precise repetition, controlled dynamics, strong negative space, microscopic groove detail'),
      atmosphere('underground', 'Underground', 'Scura, notturna, club-oriented e anti-commerciale.', 'underground club atmosphere, dark intimate room, restrained hook design, heavy low-end focus, late-night subcultural energy'),
      atmosphere('warehouse', 'Warehouse', 'Ampia, industriale, concreta e da capannone.', 'warehouse atmosphere, hard reflective room, raw kick energy, concrete industrial ambience, deep club pressure'),
      atmosphere('dark-club', 'Dark Club', 'Buia, sensuale, potente e fisica.', 'dark club atmosphere, low-light tension, deep bass pressure, restrained sensuality, focused rhythmic drive'),
      atmosphere('cold-metropolitan', 'Metropolitana Fredda', 'Urbana, metallica, rigorosa e distante.', 'cold metropolitan atmosphere, metallic details, rigid urban pulse, restrained emotion, concrete-night ambience'),
      atmosphere('raw', 'Raw', 'Diretta, non levigata, ruvida e potente.', 'raw atmosphere, unpolished analog energy, gritty transients, direct rhythm, imperfect physical texture'),
      atmosphere('mechanical', 'Meccanica', 'Ripetitiva, precisa, industriale e robotica.', 'mechanical atmosphere, machine-like rhythm, precise repeated motion, metallic percussive details, controlled industrial pulse'),
      atmosphere('sparse', 'Sparsa e Aria', 'Pochi elementi, molto spazio e forte tensione.', 'sparse atmosphere, few carefully placed elements, large negative space, restrained tension, subtle micro-dynamics'),
      atmosphere('micro', 'Micro-Sonica', 'Dettagli minuscoli, glitch controllati e movimento delicato.', 'micro-sonic atmosphere, tiny clicks and textures, subtle glitch detail, microscopic rhythmic motion, precise spatial placement')
    ]
  },
  {
    id: 'dark-industrial-aggressive',
    label: 'Dark / Industrial / Aggressive',
    atmospheres: [
      atmosphere('dark', 'Dark', 'Oscura, pesante, notturna e minacciosa.', 'dark atmosphere, shadowy harmonic color, heavy low-end pressure, tense nocturnal textures, restrained menace'),
      atmosphere('menacing', 'Minacciosa', 'Tesa, ostile, inquietante e pericolosa.', 'menacing atmosphere, hostile low-frequency tension, uneasy dissonance, threatening rhythmic pulse, controlled aggression'),
      atmosphere('aggressive', 'Aggressiva', 'Dura, veloce, fisica e ad alta energia.', 'aggressive atmosphere, hard-hitting transients, intense rhythmic drive, forceful bass, high-energy confrontational sound design'),
      atmosphere('industrial', 'Industriale', 'Metallica, meccanica, sporca e urbana.', 'industrial atmosphere, metallic percussion, machine rhythm, distorted ambience, concrete-space reflections, raw urban pressure'),
      atmosphere('distorted', 'Distorta', 'Satura, ruvida, schiacciata e abrasiva.', 'distorted atmosphere, saturated textures, abrasive harmonics, crushed transients, gritty high-energy density'),
      atmosphere('apocalyptic', 'Apocalittica', 'Enorme, distruttiva, catastrofica e cinematica.', 'apocalyptic atmosphere, massive low impacts, chaotic tension, dark cinematic scale, destructive energy, ominous wide-space sound'),
      atmosphere('dystopian', 'Distopica', 'Futuristica, fredda, oppressiva e urbana.', 'dystopian atmosphere, cold futuristic machinery, oppressive bass pressure, bleak urban space, controlled electronic anxiety'),
      atmosphere('tense', 'Tesa', 'Suspense, pressione, nervosismo e attesa.', 'tense atmosphere, unresolved harmony, rising rhythmic pressure, controlled suspense, anxious spatial movement'),
      atmosphere('sinister', 'Sinistra', 'Misteriosa, oscura, maligna e inquietante.', 'sinister atmosphere, eerie tonal movement, low dissonant pressure, shadowy textures, unsettling rhythmic restraint')
    ]
  },
  {
    id: 'futuristic-digital-neon',
    label: 'Futuristiche / Digitali / Neon',
    atmospheres: [
      atmosphere('futuristic', 'Futuristica', 'Avanzata, sintetica, pulita e tecnologica.', 'futuristic atmosphere, sleek synthetic textures, precise digital detail, advanced sound design, clean high-tech spatial image'),
      atmosphere('cyberpunk', 'Cyberpunk', 'Neon, urbana, oscura e tecnologica.', 'cyberpunk atmosphere, neon-lit city tension, dark synth layers, mechanical pulse, high-tech low-life energy'),
      atmosphere('neon-night', 'Neon Night', 'Colorata, notturna, brillante e metropolitana.', 'neon night atmosphere, glowing synth colors, polished urban groove, late-night electronic reflections, vivid futuristic energy'),
      atmosphere('sci-fi', 'Sci-Fi', 'Spaziale, tecnologica, misteriosa e immaginifica.', 'science-fiction atmosphere, advanced synthetic ambience, strange spatial effects, cinematic technology mood, exploratory futuristic tone'),
      atmosphere('robotic', 'Robotica', 'Precisa, meccanica, sintetica e non umana.', 'robotic atmosphere, precise machine rhythm, synthetic articulation, automated movement, nonhuman digital texture'),
      atmosphere('digital', 'Digitale', 'Nitida, moderna, lucida e computerizzata.', 'digital atmosphere, crisp transient detail, clean synthetic layers, modern computer-like precision, polished electronic sheen'),
      atmosphere('glitchy', 'Glitchy', 'Frammentata, micro-editata, instabile e creativa.', 'glitchy atmosphere, chopped micro-edits, stuttering details, digital artifacts, playful broken-rhythm texture'),
      atmosphere('space-age', 'Space Age', 'Retro-futurista, cosmica, brillante e visionaria.', 'space-age atmosphere, retro-futuristic synth color, cosmic movement, optimistic technology mood, polished celestial groove')
    ]
  },
  {
    id: 'cinematic-epic-dramatic',
    label: 'Cinematiche / Epiche / Drammatiche',
    atmospheres: [
      atmosphere('cinematic', 'Cinematica', 'Narrativa, ampia, dinamica e visiva.', 'cinematic atmosphere, strong narrative arc, wide dynamics, dramatic spatial depth, vivid scene-setting instrumentation'),
      atmosphere('epic', 'Epica', 'Enorme, potente, eroica e spettacolare.', 'epic atmosphere, massive scale, heroic harmonic movement, powerful impacts, broad emotional build, spectacular climax'),
      atmosphere('heroic', 'Eroica', 'Coraggiosa, luminosa, forte e trionfante.', 'heroic atmosphere, bold rising harmony, confident rhythmic motion, triumphant thematic material, powerful emotional resolve'),
      atmosphere('dramatic', 'Drammatica', 'Intensa, contrastata, narrativa e tesa.', 'dramatic atmosphere, strong contrast, emotional tension, dynamic orchestration or synthesis, narrative rhythmic movement'),
      atmosphere('suspenseful', 'Suspense', 'Inquieta, trattenuta, crescente e misteriosa.', 'suspenseful atmosphere, restrained pulse, unresolved harmony, gradual tension build, mysterious evolving texture'),
      atmosphere('mysterious', 'Misteriosa', 'Enigmatica, profonda, scura e magnetica.', 'mysterious atmosphere, enigmatic harmonic color, shadowed texture, subtle suspense, magnetic unresolved movement'),
      atmosphere('trailer', 'Trailer', 'Impatto, build, colpi enormi e climax.', 'trailer atmosphere, cinematic impacts, escalating build, huge low-end hits, dramatic risers, powerful final climax'),
      atmosphere('widescreen', 'Widescreen', 'Molto ampia, panoramica, spaziale e immersiva.', 'widescreen atmosphere, panoramic stereo image, huge depth, broad sustained layers, immersive cinematic scale')
    ]
  },
  {
    id: 'chill-ambient-meditative',
    label: 'Chill / Ambient / Meditative',
    atmospheres: [
      atmosphere('ambient', 'Ambient', 'Spaziosa, lenta, texturale e immersiva.', 'ambient atmosphere, slow-evolving pads, spacious reverb, soft textural movement, minimal rhythmic pressure, immersive depth'),
      atmosphere('meditative', 'Meditativa', 'Calma, centrata, ripetitiva e rilassante.', 'meditative atmosphere, calm repetitive motion, soft sustained tones, gentle low-frequency breathing, centered peaceful space'),
      atmosphere('ethereal', 'Eterea', 'Leggera, celestiale, trasparente e sospesa.', 'ethereal atmosphere, airy high-frequency shimmer, floating pads, soft celestial harmonics, weightless spacious movement'),
      atmosphere('serene', 'Serena', 'Pacifica, limpida, equilibrata e stabile.', 'serene atmosphere, calm balanced harmony, clean soft textures, gentle rhythm, peaceful emotional stability'),
      atmosphere('healing', 'Rigenerante', 'Morbida, avvolgente, luminosa e terapeutica.', 'healing atmosphere, warm soft drones, gentle harmonic resonance, smooth dynamics, comforting luminous texture'),
      atmosphere('weightless', 'Senza Peso', 'Fluttuante, ariosa, lenta e quasi immobile.', 'weightless atmosphere, floating layers, very soft transients, suspended harmonic motion, airy spacious depth'),
      atmosphere('dreamscape', 'Dreamscape', 'Onirica, profonda, cinematica e liquida.', 'dreamscape atmosphere, fluid evolving pads, dreamlike spatial motion, soft harmonic blur, immersive nocturnal fantasy'),
      atmosphere('zen', 'Zen', 'Essenziale, naturale, calma e silenziosa.', 'zen atmosphere, minimal calm arrangement, natural breathing space, gentle tonal focus, quiet balanced movement')
    ]
  },
  {
    id: 'funky-groovy-retro',
    label: 'Funky / Groovy / Retro',
    atmospheres: [
      atmosphere('funky', 'Funky', 'Ritmica, sincopata, brillante e fisica.', 'funky atmosphere, syncopated bass groove, tight drums, rhythmic stabs, playful accents, strong body-moving pocket'),
      atmosphere('groovy', 'Groovy', 'Scorrevole, ritmica, ballabile e magnetica.', 'groovy atmosphere, infectious rhythmic pocket, rolling bass movement, tight percussion, effortless dancefloor flow'),
      atmosphere('playful', 'Giocosa', 'Divertente, leggera, elastica e creativa.', 'playful atmosphere, bouncing rhythmic ideas, cheeky melodic details, bright transitions, fun kinetic energy'),
      atmosphere('swagger', 'Swagger', 'Sicura, sexy, urbana e potente.', 'swagger atmosphere, confident bass groove, punchy rhythm, stylish attitude, controlled sensual energy'),
      atmosphere('jazzy', 'Jazzy', 'Sofisticata, armonica, swingata e musicale.', 'jazzy atmosphere, extended chords, subtle swing, expressive instrumental phrasing, sophisticated harmonic color'),
      atmosphere('disco-glam', 'Disco Glam', 'Brillante, elegante, festosa e anni ’70.', 'disco glam atmosphere, glossy strings or synths, funky bass, open hi-hats, glamorous dancefloor sparkle'),
      atmosphere('retro-party', 'Retro Party', 'Colorata, nostalgica, energica e divertente.', 'retro party atmosphere, vintage dance textures, catchy hooks, bright rhythmic energy, nostalgic celebratory mood'),
      atmosphere('analog-vintage', 'Analog Vintage', 'Calda, saturata, imperfetta e classica.', 'analog vintage atmosphere, warm saturation, rounded synths, tape-like softness, classic drum color, imperfect human texture'),
      atmosphere('90s-rave', '90s Rave', 'Euforica, grezza, veloce e warehouse old-school.', '90s rave atmosphere, raw breakbeats or four-on-floor drive, bright rave stabs, old-school sampler grit, euphoric warehouse energy')
    ]
  },
  {
    id: 'nature-place-season',
    label: 'Luoghi / Natura / Stagioni',
    atmospheres: [
      atmosphere('oceanic', 'Oceanica', 'Profonda, fluida, ampia e marittima.', 'oceanic atmosphere, deep flowing motion, wide blue-space ambience, soft wave-like dynamics, airy shimmering detail'),
      atmosphere('desert', 'Desertica', 'Secca, calda, vasta e ipnotica.', 'desert atmosphere, dry percussion, wide empty space, heat-haze textures, hypnotic repeating motion, earthy tonal color'),
      atmosphere('jungle-nature', 'Giungla', 'Umida, organica, densa e piena di vita.', 'jungle nature atmosphere, dense organic percussion, humid environmental texture, living rhythmic detail, deep natural ambience'),
      atmosphere('rainy-night', 'Notte Piovosa', 'Riflessiva, urbana, malinconica e bagnata.', 'rainy-night atmosphere, soft reflective ambience, muted urban textures, melancholic harmony, gentle wet-space reverberation'),
      atmosphere('winter', 'Invernale', 'Fredda, cristallina, rarefatta e introspettiva.', 'winter atmosphere, cold crystalline highs, sparse arrangement, pale spacious harmony, introspective stillness'),
      atmosphere('autumn', 'Autunnale', 'Calda, malinconica, organica e nostalgica.', 'autumn atmosphere, warm muted colors, organic texture, nostalgic harmony, gentle melancholic movement'),
      atmosphere('spring', 'Primaverile', 'Fresca, luminosa, viva e in crescita.', 'spring atmosphere, fresh bright textures, gentle rhythmic renewal, optimistic melodic growth, light organic detail'),
      atmosphere('mountain', 'Montana e Aria Aperta', 'Ampia, pura, naturale e panoramica.', 'mountain open-air atmosphere, clean panoramic depth, natural acoustic space, broad calm dynamics, fresh expansive feeling')
    ]
  },

  // Genre-specific atmosphere banks. These keep the Atmosphere selector useful
  // outside House as well: Jazz, Blues, Rap, R&B, Pop, Rock, Metal, Classical,
  // Country, Reggae, Latin, African, World, EDM and the electronic subfamilies.
  {
    id: 'edm-mainstage-club',
    label: 'EDM / Mainstage / Club',
    atmospheres: [
      atmosphere('edm-mainstage', 'Mainstage Esplosiva', 'Enorme, immediata, festival e ad altissimo impatto.', 'mainstage EDM atmosphere, huge build, massive drop, bright supersaw layers, punchy festival drums, crowd-scale impact'),
      atmosphere('edm-festival-euphoric', 'Festival Euforica', 'Luminosa, liberatoria, melodica e da mani al cielo.', 'festival euphoric EDM atmosphere, uplifting chords, soaring lead, tension and release, wide bright mix, hands-in-the-air energy'),
      atmosphere('edm-dark-club', 'EDM Dark Club', 'Scura, bass-heavy, aggressiva e notturna.', 'dark club EDM atmosphere, heavy sub bass, sharp synth attacks, nocturnal tension, powerful club drops, controlled aggression'),
      atmosphere('edm-future-emotional', 'Future Bass Emotiva', 'Ampia, brillante, sentimentale e moderna.', 'emotional future bass atmosphere, lush chords, pitch-bent vocal textures, glossy synth layers, strong emotional lift, wide modern mix'),
      atmosphere('edm-bigroom', 'Big Room Monumentale', 'Semplice, enorme, ritmica e da arena.', 'big room atmosphere, giant kick, simple memorable lead, massive festival space, dramatic snare builds, arena-scale release'),
      atmosphere('edm-rave-raw', 'Rave Grezza', 'Diretta, ruvida, old-school e warehouse.', 'raw rave atmosphere, old-school synth stabs, hard drums, warehouse grit, urgent repetitive energy, unpolished club pressure'),
      atmosphere('edm-summer-anthem', 'Summer Anthem', 'Solare, cantabile, positiva e radio-festival.', 'summer anthem atmosphere, bright melodic hook, uplifting vocal-friendly harmony, sunny energy, polished dance-pop pulse, outdoor festival feel'),
      atmosphere('edm-neon-future', 'Neon Futuristica', 'Digitale, brillante, urbana e tecnologica.', 'neon futuristic EDM atmosphere, glossy digital synths, cyber city mood, tight electronic drums, luminous night energy')
    ]
  },
  {
    id: 'techno-trance-bass',
    label: 'Techno / Trance / Bass Music',
    atmospheres: [
      atmosphere('techno-hypnotic-deep', 'Techno Ipnotica Profonda', 'Circolare, scura, graduale e immersiva.', 'deep hypnotic techno atmosphere, looping micro-variation, rumble low end, restrained synth motion, long-form club hypnosis'),
      atmosphere('techno-peak-driving', 'Techno Peak Time', 'Potente, tesa, veloce e da grande club.', 'peak-time driving techno atmosphere, relentless kick, rolling percussion, rising tension, sharp synth motifs, large dark-room pressure'),
      atmosphere('techno-dub-space', 'Dub Techno Spaziale', 'Profonda, acquatica, riverberata e minimale.', 'dub techno atmosphere, chord echoes, deep sub pulse, spacious delays, restrained groove, immersive foggy depth'),
      atmosphere('trance-uplifting-sky', 'Trance Uplifting', 'Celestiale, crescente, emozionale ed euforica.', 'uplifting trance atmosphere, soaring supersaws, emotional breakdown, rolling bassline, bright sky-wide release, euphoric climax'),
      atmosphere('trance-dark-psy', 'Psytrance Oscura', 'Psichedelica, veloce, aliena e notturna.', 'dark psytrance atmosphere, fast rolling bass, twisted psychedelic effects, alien textures, relentless nocturnal energy'),
      atmosphere('dnb-liquid-emotional', 'Liquid DnB Emotiva', 'Fluida, soulful, atmosferica e veloce.', 'liquid drum and bass atmosphere, rolling breaks, warm sub bass, soulful chords, airy pads, emotional forward motion'),
      atmosphere('dnb-neuro-aggressive', 'Neurofunk Aggressiva', 'Tecnologica, scura, precisa e feroce.', 'neurofunk atmosphere, complex reese bass, surgical drums, dark futuristic pressure, mechanical modulation, aggressive precision'),
      atmosphere('jungle-raw-urban', 'Jungle Cruda Urbana', 'Frammentata, veloce, ruvida e underground.', 'raw jungle atmosphere, chopped amen breaks, heavy sub bass, urban sampler grit, frenetic rhythmic edits, underground energy'),
      atmosphere('garage-night-swing', 'UK Garage Notturna', 'Swingata, urbana, sensuale e veloce.', 'UK garage atmosphere, shuffled drums, warm sub bass, chopped vocal texture, rainy-night city mood, sleek late-night swing'),
      atmosphere('dubstep-deep-pressure', 'Dubstep Profonda', 'Scura, spaziosa, sub-heavy e minacciosa.', 'deep dubstep atmosphere, enormous sub pressure, sparse drums, dark space, restrained wobble movement, ominous low-frequency focus'),
      atmosphere('breaks-kinetic', 'Breaks Cinetica', 'Spezzata, dinamica, elastica e fisica.', 'kinetic breakbeat atmosphere, punchy broken drums, moving bass, syncopated synth accents, high physical momentum'),
      atmosphere('hard-dance-adrenaline', 'Hard Dance Adrenalina', 'Velocissima, compressa, estrema e da rave.', 'hard dance atmosphere, pounding kick, fast tempo, distorted rave leads, relentless energy, explosive crowd pressure')
    ]
  },
  {
    id: 'hiphop-rap-specific',
    label: 'Hip Hop / Rap / Trap / Drill',
    atmospheres: [
      atmosphere('rap-street-gritty', 'Strada Cruda', 'Urbana, ruvida, diretta e realistica.', 'gritty street rap atmosphere, raw drums, dark urban ambience, direct low-end weight, unpolished documentary feel'),
      atmosphere('boombap-dusty', 'Boom Bap Polverosa', 'Vintage, campionata, calda e underground.', 'dusty boom bap atmosphere, vinyl texture, chopped soul sample feel, hard kick and snare, warm bass, underground cipher mood'),
      atmosphere('westcoast-sunny', 'West Coast Solare', 'Rilassata, luminosa, elastica e da cruising.', 'sunny west coast hip hop atmosphere, smooth bassline, relaxed drums, bright synth or guitar touches, cruising boulevard mood'),
      atmosphere('gfunk-smooth', 'G-Funk Morbida', 'Funky, lenta, brillante e sensuale.', 'smooth G-funk atmosphere, elastic bass, whistling synth lead, laid-back drums, warm sunny groove, confident cruising energy'),
      atmosphere('trap-luxury', 'Trap Lussuosa', 'Scura, elegante, pesante e cinematica.', 'luxury trap atmosphere, deep 808 bass, glossy dark synths, spacious percussion, expensive nocturnal mood, confident swagger'),
      atmosphere('drill-menacing', 'Drill Minacciosa', 'Fredda, tesa, urbana e aggressiva.', 'menacing drill atmosphere, sliding 808 bass, sparse cold melody, tense percussion, dark street pressure, confrontational energy'),
      atmosphere('cloudrap-dreamy', 'Cloud Rap Sognante', 'Eterea, liquida, nostalgica e sospesa.', 'dreamy cloud rap atmosphere, washed pads, airy bells, soft 808 bass, floating vocal-friendly space, nostalgic haze'),
      atmosphere('lofi-rap-introspective', 'Lo-Fi Rap Introspettiva', 'Intima, polverosa, malinconica e raccolta.', 'introspective lo-fi hip hop atmosphere, dusty drums, mellow jazz chords, vinyl texture, quiet late-night reflection'),
      atmosphere('conscious-hopeful', 'Conscious Speranzosa', 'Pensata, umana, calda e costruttiva.', 'conscious hip hop atmosphere, warm soulful harmony, clear rhythmic pocket, thoughtful emotional tone, hopeful forward movement'),
      atmosphere('phonk-nightdrive', 'Phonk Night Drive', 'Oscura, automobilistica, sporca e ipnotica.', 'phonk night-drive atmosphere, cowbell motif, distorted bass, Memphis-inspired texture, neon road mood, aggressive hypnotic pulse'),
      atmosphere('emorap-vulnerable', 'Emo Rap Vulnerabile', 'Malinconica, confessionale, melodica e fragile.', 'vulnerable emo rap atmosphere, minor-key guitar or synth loop, soft 808s, intimate sadness, confessional melodic mood'),
      atmosphere('memphis-horror', 'Memphis Oscura', 'Minacciosa, lo-fi, cavernosa e sinistra.', 'dark Memphis rap atmosphere, lo-fi cassette grit, ominous sample texture, heavy bass, eerie night mood, raw underground tension')
    ]
  },
  {
    id: 'jazz-specific',
    label: 'Jazz',
    atmospheres: [
      atmosphere('jazz-smoky-club', 'Jazz Club Fumoso', 'Intima, notturna, calda e sofisticata.', 'smoky jazz club atmosphere, close upright bass, brushed drums, warm piano or horn, low-light room ambience, intimate improvisation'),
      atmosphere('jazz-cool', 'Cool e Sofisticata', 'Elegante, rilassata, precisa e moderna.', 'cool jazz atmosphere, restrained dynamics, elegant harmony, airy horn phrasing, soft swing, refined late-night space'),
      atmosphere('jazz-bebop-fire', 'Bebop Frenetica', 'Veloce, virtuosistica, brillante e nervosa.', 'bebop atmosphere, fast swing ride, agile walking bass, virtuosic horn lines, sharp harmonic movement, energetic small-club feel'),
      atmosphere('jazz-bigband-swing', 'Swing Big Band', 'Festosa, ampia, orchestrale e danzante.', 'big band swing atmosphere, punchy brass sections, walking bass, swinging drums, bright dancehall energy, classic ensemble excitement'),
      atmosphere('jazz-modal-mystery', 'Modal Misteriosa', 'Spaziosa, contemplativa, ipnotica e profonda.', 'modal jazz atmosphere, open harmonic space, hypnotic modal vamp, spacious improvisation, deep acoustic resonance, contemplative tension'),
      atmosphere('jazz-fusion-electric', 'Fusion Elettrica', 'Tecnica, energica, funky e moderna.', 'electric jazz fusion atmosphere, syncopated bass, electric keys, tight drums, virtuosic lead instrument, adventurous modern harmony'),
      atmosphere('jazz-smooth-lounge', 'Smooth Jazz Lounge', 'Lucida, morbida, elegante e rilassata.', 'smooth jazz lounge atmosphere, silky sax or guitar, polished groove, warm electric piano, relaxed sophisticated mood'),
      atmosphere('jazz-latin-hot', 'Latin Jazz Caliente', 'Ritmica, solare, percussiva e brillante.', 'hot Latin jazz atmosphere, clave-driven percussion, lively piano montuno, brass energy, syncopated bass, festive improvisation'),
      atmosphere('jazz-free-avant', 'Free Jazz Avant-Garde', 'Libera, imprevedibile, astratta e intensa.', 'free jazz atmosphere, open improvisation, angular phrases, elastic rhythm, dissonant color, unpredictable acoustic energy'),
      atmosphere('jazz-nujazz-urban', 'Nu Jazz Urbana', 'Elettronica, sofisticata, notturna e groovy.', 'nu jazz atmosphere, electronic groove, jazz harmony, sampled or live instrumental texture, polished urban night mood')
    ]
  },
  {
    id: 'blues-specific',
    label: 'Blues',
    atmospheres: [
      atmosphere('blues-delta-raw', 'Delta Blues Polverosa', 'Acustica, ruvida, antica e terrena.', 'raw Delta blues atmosphere, dry acoustic guitar, intimate vocal feeling, sparse foot-tap rhythm, dusty rural room tone'),
      atmosphere('blues-chicago-electric', 'Chicago Blues Elettrica', 'Urbana, amplificata, notturna e potente.', 'electric Chicago blues atmosphere, gritty guitar amp, harmonica, solid backbeat, warm bass, smoky city-club energy'),
      atmosphere('blues-texas-road', 'Texas Blues Ruggente', 'Spaziosa, chitarristica, dinamica e da strada.', 'Texas blues atmosphere, expressive electric guitar, driving rhythm section, open-road energy, gritty but warm tone'),
      atmosphere('blues-soul-warm', 'Soul Blues Calda', 'Emotiva, vocale, morbida e profonda.', 'warm soul blues atmosphere, expressive vocals, organ or electric piano, deep pocket, tender guitar phrasing, heartfelt emotional weight'),
      atmosphere('blues-jump-party', 'Jump Blues Festiva', 'Swingata, brillante, ritmica e divertente.', 'jump blues atmosphere, upbeat swing rhythm, horn stabs, walking bass, lively piano, energetic dancehall mood'),
      atmosphere('blues-roadhouse', 'Roadhouse Notturna', 'Ruvida, alcolica, sudata e live.', 'roadhouse blues atmosphere, gritty live band feel, overdriven guitar, strong backbeat, bar-room ambience, sweaty late-night energy'),
      atmosphere('blues-blue-melancholy', 'Malinconia Blu', 'Dolorosa, lenta, intima e vulnerabile.', 'melancholic slow blues atmosphere, expressive bends, spacious phrasing, deep vocal sadness, warm room reverb, emotional restraint'),
      atmosphere('blues-country-rustic', 'Country Blues Rustica', 'Legnosa, semplice, rurale e autentica.', 'rustic country blues atmosphere, acoustic strings, natural room sound, simple pulse, earthy storytelling mood, handmade texture')
    ]
  },
  {
    id: 'rnb-soul-specific',
    label: 'R&B / Soul',
    atmospheres: [
      atmosphere('rnb-latenight-sensual', 'R&B Late Night Sensuale', 'Morbida, scura, elegante e intima.', 'late-night sensual R&B atmosphere, silky chords, deep soft bass, minimal drums, intimate vocal space, glossy nocturnal mood'),
      atmosphere('neosoul-intimate', 'Neo Soul Intima', 'Calda, armonica, umana e sofisticata.', 'intimate neo-soul atmosphere, rich extended chords, laid-back pocket, warm bass, organic keys, expressive human feel'),
      atmosphere('motown-joy', 'Motown Gioiosa', 'Vivace, corale, vintage e irresistibile.', 'joyful Motown atmosphere, tambourine backbeat, warm bass, bright strings or horns, handclaps, uplifting vocal energy'),
      atmosphere('quietstorm-romantic', 'Quiet Storm Romantica', 'Lenta, setosa, sentimentale e notturna.', 'romantic quiet storm atmosphere, lush electric piano, soft drums, warm bass, intimate vocal-friendly space, smooth late-night tenderness'),
      atmosphere('newjack-energy', 'New Jack Swing Energica', 'Funky, urbana, brillante e ballabile.', 'new jack swing atmosphere, punchy swing drums, bright synth stabs, funky bass, energetic urban vocal groove'),
      atmosphere('gospelsoul-spiritual', 'Gospel Soul Spirituale', 'Potente, corale, emotiva e luminosa.', 'spiritual gospel soul atmosphere, expressive choir feeling, piano and organ warmth, handclap energy, deep uplifting emotion'),
      atmosphere('contemporary-rnb-glossy', 'R&B Contemporanea Glossy', 'Moderna, pulita, profonda e radiofonica.', 'glossy contemporary R&B atmosphere, polished drums, deep sub bass, airy synth layers, clean spacious vocal pocket, modern luxury mood'),
      atmosphere('psychedelic-soul-color', 'Soul Psichedelica', 'Colorata, vintage, avvolgente e visionaria.', 'psychedelic soul atmosphere, vintage saturation, swirling effects, warm bass, expressive vocals, colorful dreamy groove')
    ]
  },
  {
    id: 'pop-specific',
    label: 'Pop',
    atmospheres: [
      atmosphere('pop-radio-bright', 'Pop Radio Luminosa', 'Chiara, immediata, positiva e memorabile.', 'bright radio pop atmosphere, clean punchy drums, memorable hook, polished harmony, optimistic vocal-friendly energy'),
      atmosphere('pop-dream-ethereal', 'Dream Pop Eterea', 'Sognante, morbida, riverberata e romantica.', 'ethereal dream pop atmosphere, washed guitars or synths, airy vocals space, soft drums, nostalgic floating harmony'),
      atmosphere('pop-indie-intimate', 'Indie Pop Intima', 'Umana, delicata, personale e moderna.', 'intimate indie pop atmosphere, organic details, understated groove, personal melodic warmth, lightly textured modern production'),
      atmosphere('pop-synth-neon', 'Synthpop Neon', 'Colorata, elettronica, notturna e retrò-futurista.', 'neon synthpop atmosphere, bright arpeggios, punchy electronic drums, glossy bass, nostalgic futuristic city-night mood'),
      atmosphere('pop-hyper-color', 'Hyperpop Iperattiva', 'Estrema, digitale, brillante e imprevedibile.', 'hyperpop atmosphere, exaggerated digital textures, hard edits, bright synthetic hooks, playful distortion, hyperactive energy'),
      atmosphere('pop-kpop-colorful', 'K-Pop Colorata', 'Precisa, dinamica, brillante e piena di cambi.', 'colorful K-pop atmosphere, polished production, sharp transitions, strong hook sections, energetic rhythm, glossy multi-layered pop impact'),
      atmosphere('pop-jpop-uplift', 'J-Pop Uplifting', 'Luminosa, melodica, veloce e ottimista.', 'uplifting J-pop atmosphere, bright melodic movement, energetic rhythm, layered harmony, emotional optimistic lift'),
      atmosphere('pop-power-anthem', 'Power Pop Anthemica', 'Diretta, chitarristica, solare e da ritornello enorme.', 'anthemic power pop atmosphere, driving guitars, punchy drums, huge melodic chorus, youthful bright energy')
    ]
  },
  {
    id: 'rock-specific',
    label: 'Rock',
    atmospheres: [
      atmosphere('rock-stadium-anthem', 'Rock da Stadio', 'Grande, corale, potente e memorabile.', 'stadium rock atmosphere, huge drums, wide guitars, anthemic chorus energy, crowd-scale dynamics, confident performance'),
      atmosphere('rock-garage-raw', 'Garage Rock Cruda', 'Sporca, diretta, giovane e live.', 'raw garage rock atmosphere, crunchy guitar, loose drums, small-room live energy, minimal polish, rebellious spontaneity'),
      atmosphere('rock-indie-reflective', 'Indie Rock Riflessiva', 'Personale, malinconica, dinamica e contemporanea.', 'reflective indie rock atmosphere, textured guitars, restrained verses, emotional dynamics, intimate modern band feel'),
      atmosphere('rock-psychedelic-haze', 'Rock Psichedelica', 'Visionaria, liquida, vintage e straniante.', 'psychedelic rock atmosphere, swirling guitars, analog effects, dreamy vocals space, elastic rhythm, colorful vintage haze'),
      atmosphere('rock-prog-epic', 'Progressive Rock Epica', 'Lunga, narrativa, tecnica e cinematica.', 'epic progressive rock atmosphere, evolving sections, complex rhythm, broad harmonic development, virtuosic instrumentation, cinematic scale'),
      atmosphere('rock-post-cinematic', 'Post-Rock Cinematica', 'Crescente, atmosferica, enorme e senza fretta.', 'cinematic post-rock atmosphere, delayed guitars, gradual build, wide dynamics, emotional instrumental climax, vast space'),
      atmosphere('rock-surf-sunny', 'Surf Rock Solare', 'Brillante, riverberata, veloce e costiera.', 'sunny surf rock atmosphere, spring reverb guitar, energetic drums, bright melodic riffs, coastal vintage fun'),
      atmosphere('rock-grunge-dirty', 'Grunge Sporco', 'Ruvido, pesante, apatico e catartico.', 'dirty grunge atmosphere, distorted guitars, raw drums, heavy quiet-loud dynamics, weary emotional tension, unpolished room feel'),
      atmosphere('rock-southern-road', 'Southern Rock On the Road', 'Calda, chitarristica, aperta e americana.', 'southern rock atmosphere, warm guitars, steady road groove, bluesy phrasing, open highway energy, live band warmth'),
      atmosphere('rock-shoegaze-wall', 'Shoegaze Sospesa', 'Rumorosa, sognante, densa e immersiva.', 'shoegaze atmosphere, dense guitar wall, washed vocals, dreamy harmony, soft pulse, immersive blurred texture')
    ]
  },
  {
    id: 'metal-punk-specific',
    label: 'Metal / Punk / Hardcore',
    atmospheres: [
      atmosphere('metal-heavy-power', 'Heavy Metal Potente', 'Massiccia, riff-driven, eroica e fisica.', 'heavy metal atmosphere, powerful riffs, driving drums, strong bass, commanding lead guitar, high-energy performance'),
      atmosphere('metal-thrash-frenzy', 'Thrash Metal Frenetica', 'Velocissima, tagliente, aggressiva e nervosa.', 'thrash metal atmosphere, rapid palm-muted riffs, fast double-kick drums, sharp attacks, relentless aggressive momentum'),
      atmosphere('metal-death-brutal', 'Death Metal Brutale', 'Pesantissima, oscura, tecnica e distruttiva.', 'brutal death metal atmosphere, low-tuned riffs, blast beats, dense aggressive tone, extreme rhythmic force, dark intensity'),
      atmosphere('metal-black-frozen', 'Black Metal Gelida', 'Fredda, cavernosa, feroce e atmosferica.', 'frozen black metal atmosphere, tremolo guitars, blast beats, distant raw texture, icy ambience, dark ritual intensity'),
      atmosphere('metal-doom-oppressive', 'Doom Metal Oppressiva', 'Lenta, enorme, pesante e funerea.', 'oppressive doom metal atmosphere, very slow heavy riffs, massive sustain, bleak harmonic weight, dark spacious drums, funeral-scale tension'),
      atmosphere('metal-power-heroic', 'Power Metal Eroica', 'Veloce, trionfale, melodica e fantastica.', 'heroic power metal atmosphere, fast drums, soaring melodic guitars, triumphant harmony, epic fantasy scale, uplifting intensity'),
      atmosphere('metal-symphonic-majestic', 'Symphonic Metal Maestosa', 'Orchestrale, enorme, drammatica e solenne.', 'majestic symphonic metal atmosphere, heavy guitars, orchestral layers, dramatic choir feeling, powerful drums, cinematic grandeur'),
      atmosphere('metal-gothic-romantic', 'Gothic Metal Oscura e Romantica', 'Elegante, malinconica, pesante e teatrale.', 'dark romantic gothic metal atmosphere, heavy guitars, atmospheric keys, melancholic harmony, dramatic vocal space, nocturnal elegance'),
      atmosphere('metal-industrial-machine', 'Industrial Metal Meccanica', 'Robotica, distorta, precisa e urbana.', 'industrial metal atmosphere, machine-like drums, distorted guitars, electronic layers, mechanical repetition, dystopian pressure'),
      atmosphere('punk-rebel-fast', 'Punk Ribelle', 'Veloce, diretta, sporca e anti-autoritaria.', 'rebellious punk atmosphere, fast simple guitars, raw drums, shouted energy, small-club urgency, unpolished attitude'),
      atmosphere('emo-cathartic', 'Emo Catartica', 'Vulnerabile, intensa, melodica e esplosiva.', 'cathartic emo atmosphere, intimate verses, emotional guitar layers, dynamic explosive chorus, vulnerable melodic tension'),
      atmosphere('postpunk-cold', 'Post-Punk Fredda', 'Urbana, scura, minimale e nervosa.', 'cold post-punk atmosphere, angular guitar, driving bass, dry drums, restrained dark vocals space, metropolitan tension')
    ]
  },
  {
    id: 'classical-specific',
    label: 'Classical / Orchestral',
    atmospheres: [
      atmosphere('classical-balanced', 'Classica Equilibrata', 'Elegante, ordinata, dinamica e trasparente.', 'classical period atmosphere, balanced orchestration, clear phrasing, elegant dynamics, transparent acoustic space'),
      atmosphere('baroque-ornate', 'Barocca Ornate', 'Decorata, contrappuntistica, vivace e regale.', 'ornate baroque atmosphere, contrapuntal motion, harpsichord or strings, formal elegance, lively articulated phrasing'),
      atmosphere('romantic-sweeping', 'Romantica Travolgente', 'Ampia, sentimentale, dinamica e passionale.', 'sweeping romantic classical atmosphere, expressive strings, broad harmonic motion, dramatic crescendos, passionate emotional depth'),
      atmosphere('chamber-intimate', 'Camera Intima', 'Acustica, ravvicinata, delicata e raffinata.', 'intimate chamber music atmosphere, close acoustic ensemble, subtle dynamics, detailed articulation, refined small-room space'),
      atmosphere('symphonic-majestic', 'Sinfonica Maestosa', 'Grande, orchestrale, potente e solenne.', 'majestic symphonic atmosphere, full orchestra, broad dynamics, powerful brass and strings, large concert-hall scale'),
      atmosphere('opera-dramatic', 'Opera Drammatica', 'Teatrale, vocale, intensa e grandiosa.', 'dramatic opera atmosphere, theatrical vocal space, orchestral tension, emotional climaxes, grand stage acoustics'),
      atmosphere('choral-sacred', 'Corale Sacra', 'Solenne, luminosa, spirituale e riverberata.', 'sacred choral atmosphere, blended choir, cathedral-like resonance, slow harmonic movement, reverent luminous depth'),
      atmosphere('piano-solo-intimate', 'Piano Solo Intimo', 'Personale, delicato, dinamico e contemplativo.', 'intimate solo piano atmosphere, natural room tone, expressive touch, spacious phrasing, contemplative emotional detail'),
      atmosphere('minimalist-classical', 'Minimalismo Ipnotico', 'Ripetitivo, graduale, pulito e contemplativo.', 'minimalist classical atmosphere, repeating cells, gradual harmonic shifts, precise pulse, transparent texture, meditative momentum'),
      atmosphere('neoclassical-cinematic', 'Neoclassica Cinematica', 'Moderna, emotiva, ampia e minimale.', 'cinematic neoclassical atmosphere, piano and strings, modern spacious production, emotional build, restrained contemporary harmony')
    ]
  },
  {
    id: 'country-folk-specific',
    label: 'Country / Americana / Folk',
    atmospheres: [
      atmosphere('country-rustic-warm', 'Country Rustica e Calda', 'Acustica, sincera, rurale e confortevole.', 'warm rustic country atmosphere, acoustic guitar, gentle drums, natural vocal space, earthy storytelling, wooden room tone'),
      atmosphere('americana-openroad', 'Americana Open Road', 'Ampia, nostalgica, stradale e cinematica.', 'open-road Americana atmosphere, warm guitars, steady pulse, wide landscape feeling, nostalgic storytelling, sunset highway mood'),
      atmosphere('western-sunset', 'Western al Tramonto', 'Polverosa, lenta, ampia e malinconica.', 'western sunset atmosphere, twang guitar, sparse drums, wide desert space, dusty warmth, cinematic frontier melancholy'),
      atmosphere('bluegrass-lively', 'Bluegrass Vivace', 'Acustica, veloce, virtuosa e festosa.', 'lively bluegrass atmosphere, banjo, fiddle, mandolin, upright bass, fast acoustic interplay, joyful roots energy'),
      atmosphere('honkytonk-party', 'Honky Tonk Festiva', 'Ballabile, brillante, ruvida e da bar.', 'honky-tonk atmosphere, lively piano, twang guitar, walking country bass, upbeat bar-room groove, friendly rowdy energy'),
      atmosphere('folk-acoustic-intimate', 'Folk Acustica Intima', 'Semplice, umana, narrativa e delicata.', 'intimate acoustic folk atmosphere, close guitar or strings, natural breathing space, gentle pulse, personal storytelling mood'),
      atmosphere('celtic-misty', 'Celtica Nebbiosa', 'Antica, verde, malinconica e misteriosa.', 'misty Celtic folk atmosphere, fiddle or whistle, drone-like harmony, organic rhythm, ancient landscape feeling, emotional mist'),
      atmosphere('nordic-folk-dark', 'Nordic Folk Oscura', 'Fredda, rituale, minimale e ancestrale.', 'dark Nordic folk atmosphere, deep drones, frame drums, sparse strings, cold natural ambience, ancient ritual character'),
      atmosphere('balkan-folk-party', 'Balkan Festiva', 'Veloce, irregolare, rumorosa e celebrativa.', 'festive Balkan atmosphere, energetic brass or strings, asymmetric rhythm, fast dance pulse, communal celebration'),
      atmosphere('fado-melancholy', 'Fado Malinconica', 'Intima, dolorosa, elegante e nostalgica.', 'melancholic fado atmosphere, expressive acoustic guitar, intimate vocal space, restrained rhythm, deep nostalgic longing')
    ]
  },
  {
    id: 'reggae-latin-caribbean-specific',
    label: 'Reggae / Caribbean / Latin',
    atmospheres: [
      atmosphere('reggae-island-sunny', 'Reggae Solare', 'Calda, rilassata, positiva e insulare.', 'sunny reggae atmosphere, offbeat guitar, warm bass, relaxed drums, open island air, positive laid-back energy'),
      atmosphere('reggae-roots-spiritual', 'Roots Reggae Spirituale', 'Profonda, terrena, meditativa e comunitaria.', 'roots reggae atmosphere, deep bass, steady one-drop groove, organic warmth, spiritual communal feeling, conscious calm'),
      atmosphere('dub-deep-space', 'Dub Profonda e Spaziale', 'Sub-heavy, riverberata, minimale e ipnotica.', 'deep dub atmosphere, huge bass, tape delay, spring reverb, sparse drums, immersive echo space'),
      atmosphere('dancehall-party', 'Dancehall Festiva', 'Calda, ritmica, vocale e da party.', 'dancehall party atmosphere, punchy riddim, strong bass, vocal-friendly space, playful Caribbean energy, crowded dancefloor mood'),
      atmosphere('ska-upbeat', 'Ska Gioiosa', 'Veloce, brillante, saltellante e collettiva.', 'upbeat ska atmosphere, fast offbeat guitars, energetic brass, bouncy bass, lively drums, joyful communal movement'),
      atmosphere('soca-carnival', 'Soca Carnival', 'Esplosiva, tropicale, percussiva e festosa.', 'soca carnival atmosphere, fast tropical percussion, bright melodic hooks, brass energy, crowd celebration, nonstop party momentum'),
      atmosphere('salsa-caliente', 'Salsa Caliente', 'Passionale, percussiva, elegante e danzante.', 'hot salsa atmosphere, clave rhythm, congas, timbales, piano montuno, brass accents, passionate partner-dance energy'),
      atmosphere('bachata-romantic', 'Bachata Romantica', 'Sensuale, melodica, intima e calda.', 'romantic bachata atmosphere, syncopated guitar, soft percussion, warm bass, intimate vocal space, sensual dance mood'),
      atmosphere('reggaeton-sensual', 'Reggaeton Sensuale', 'Urbana, calda, fisica e seducente.', 'sensual reggaeton atmosphere, deep dembow groove, warm sub bass, sleek synth textures, intimate club energy'),
      atmosphere('dembow-street', 'Dembow Strada', 'Diretta, veloce, urbana e aggressiva.', 'street dembow atmosphere, hard repetitive rhythm, punchy bass, raw vocal-friendly space, energetic urban party pressure'),
      atmosphere('cumbia-festive', 'Cumbia Festiva', 'Calda, popolare, melodica e comunitaria.', 'festive cumbia atmosphere, rolling percussion, melodic accordion or synth color, warm bass, communal dance energy'),
      atmosphere('samba-carnival', 'Samba Carnevale', 'Ritmicamente densa, solare, veloce e celebrativa.', 'samba carnival atmosphere, layered percussion, bright rhythmic drive, communal chants or brass, joyful street celebration'),
      atmosphere('tango-dramatic', 'Tango Drammatico', 'Passionale, elegante, teso e teatrale.', 'dramatic tango atmosphere, bandoneon-like phrasing, sharp rhythmic accents, romantic tension, elegant dance dynamics'),
      atmosphere('bossa-breeze', 'Bossa Nova Brezza', 'Rilassata, sofisticata, intima e costiera.', 'bossa nova atmosphere, soft syncopated guitar, gentle percussion, warm jazz harmony, intimate seaside sophistication')
    ]
  },
  {
    id: 'african-world-specific',
    label: 'African / World / Traditional',
    atmospheres: [
      atmosphere('afrobeats-sunny-groove', 'Afrobeats Solare', 'Calda, moderna, melodica e ballabile.', 'sunny Afrobeats atmosphere, syncopated percussion, warm bass, bright guitar or synth motifs, smooth vocal-friendly groove'),
      atmosphere('afrobeat-live-fire', 'Afrobeat Live', 'Funky, percussiva, organica e potente.', 'live Afrobeat atmosphere, layered percussion, deep bass, rhythmic guitars, horn-like stabs, extended infectious groove'),
      atmosphere('amapiano-deep-logdrum', 'Amapiano Profonda', 'Morbida, ipnotica, elegante e sub-heavy.', 'deep Amapiano atmosphere, log-drum bass, spacious piano chords, shakers, relaxed groove, warm South African club feel'),
      atmosphere('gqom-dark-rhythm', 'Gqom Oscura', 'Minimale, percussiva, dura e notturna.', 'dark Gqom atmosphere, sparse heavy kick patterns, raw percussion, ominous bass pressure, stripped club tension'),
      atmosphere('highlife-joyful', 'Highlife Gioiosa', 'Brillante, chitarristica, fluida e celebrativa.', 'joyful highlife atmosphere, bright interlocking guitars, warm horns, light percussion, buoyant bass, celebratory social energy'),
      atmosphere('gnawa-hypnotic', 'Gnawa Ipnotica', 'Rituale, desertica, ripetitiva e spirituale.', 'hypnotic Gnawa atmosphere, deep guembri-like bass, metallic castanet pulse, call-and-response energy, desert spiritual trance'),
      atmosphere('desertblues-mystic', 'Desert Blues Mistica', 'Ampia, secca, chitarristica e contemplativa.', 'mystic desert blues atmosphere, repetitive guitar figures, dry percussion, wide Saharan space, meditative hypnotic motion'),
      atmosphere('soukous-celebration', 'Soukous Celebrativa', 'Veloce, chitarristica, luminosa e danzante.', 'celebratory soukous atmosphere, bright fast guitar lines, lively percussion, buoyant bass, joyful dance energy'),
      atmosphere('arabic-mystic', 'Arabica Mistica', 'Ornamentale, emotiva, desertica e cinematica.', 'mystic Arabic atmosphere, modal melodic ornament, frame drums, deep resonant space, emotional desert-night character'),
      atmosphere('indian-meditative', 'Indiana Meditativa', 'Raga, drone, contemplazione e gradualità.', 'meditative Indian atmosphere, sustained drone, raga-inspired melodic movement, tabla-like rhythm when appropriate, patient spiritual development'),
      atmosphere('bhangra-festival', 'Bhangra Festiva', 'Energica, percussiva, colorata e collettiva.', 'festive Bhangra atmosphere, powerful dhol rhythm, bright melodic hooks, high-energy group dance, colorful celebration'),
      atmosphere('gamelan-ritual', 'Gamelan Rituale', 'Metallica, ciclica, ipnotica e cerimoniale.', 'ritual gamelan atmosphere, interlocking metallic percussion, cyclical pulse, resonant gong space, ceremonial hypnotic development')
    ]
  },
  {
    id: 'ambient-electronic-specific',
    label: 'Ambient / Downtempo / IDM / Retro Electronic',
    atmospheres: [
      atmosphere('darkambient-void', 'Dark Ambient Abissale', 'Oscura, lenta, enorme e inquietante.', 'dark ambient atmosphere, deep drones, sparse movement, huge shadowy space, ominous texture, almost no rhythmic pressure'),
      atmosphere('triphop-smoky', 'Trip Hop Fumosa', 'Lenta, urbana, sensuale e cinematica.', 'smoky trip hop atmosphere, dusty breakbeat, deep bass, noir harmony, intimate vocal space, rainy-night cinematic mood'),
      atmosphere('chillwave-nostalgia', 'Chillwave Nostalgica', 'Morbida, estiva, sfocata e retrò.', 'nostalgic chillwave atmosphere, washed synths, soft drums, tape-like color, dreamy summer memory, gentle melodic haze'),
      atmosphere('vaporwave-surreal', 'Vaporwave Surreale', 'Irreale, nostalgica, digitale e rallentata.', 'surreal vaporwave atmosphere, slowed nostalgic textures, glossy retro digital color, spacious reverb, dreamlike consumer-memory mood'),
      atmosphere('idm-cerebral', 'IDM Cerebrale', 'Complessa, digitale, precisa e astratta.', 'cerebral IDM atmosphere, intricate electronic rhythm, detailed sound design, asymmetric micro-edits, cool analytical texture'),
      atmosphere('glitchhop-bouncy', 'Glitch Hop Elastico', 'Funky, spezzato, digitale e giocoso.', 'bouncy glitch hop atmosphere, syncopated broken beats, wobbling bass, chopped digital details, playful futuristic groove'),
      atmosphere('lofi-dusty-calm', 'Lo-Fi Polverosa', 'Calma, imperfetta, intima e nostalgica.', 'dusty lo-fi atmosphere, soft tape noise, mellow chords, relaxed drums, warm imperfection, quiet nostalgic intimacy'),
      atmosphere('synthwave-nightdrive', 'Synthwave Night Drive', 'Neon, retrò, automobilistica e cinematica.', 'synthwave night-drive atmosphere, analog arpeggios, gated drums, neon city mood, driving bass, cinematic retro-future energy'),
      atmosphere('retrowave-sunset', 'Retrowave Sunset', 'Calda, nostalgica, luminosa e anni ’80.', 'retrowave sunset atmosphere, warm analog synths, nostalgic melody, bright horizon feeling, polished retro drums'),
      atmosphere('spaceambient-cosmic', 'Space Ambient Cosmica', 'Infinita, lenta, celestiale e immersiva.', 'space ambient atmosphere, vast celestial pads, deep low drones, sparkling high details, weightless cosmic movement')
    ]
  },
  {
    id: 'cinematic-experimental-specific',
    label: 'Cinematic / Experimental / Avant-Garde',
    atmospheres: [
      atmosphere('fantasy-enchanted', 'Fantasy Incantata', 'Magica, orchestrale, misteriosa e luminosa.', 'enchanted fantasy atmosphere, magical orchestral textures, delicate bells or woodwinds, broad emotional wonder, cinematic mystery'),
      atmosphere('action-adrenaline', 'Action Adrenalina', 'Veloce, tesa, percussiva e cinematica.', 'action score atmosphere, rapid percussion, driving ostinato, dramatic brass or synths, relentless cinematic momentum'),
      atmosphere('darkcinema-suspense', 'Dark Cinematic Suspense', 'Oscura, narrativa, crescente e inquietante.', 'dark cinematic suspense atmosphere, low drones, restrained pulse, unresolved harmony, gradual tension, ominous spatial depth'),
      atmosphere('game-epic-adventure', 'Game Adventure Epica', 'Dinamica, eroica, esplorativa e memorabile.', 'epic game soundtrack atmosphere, adventurous thematic hook, dynamic orchestral or hybrid layers, heroic motion, immersive world-building'),
      atmosphere('ambient-cinema-vast', 'Ambient Cinematic Vasta', 'Lenta, emotiva, enorme e panoramica.', 'vast ambient cinematic atmosphere, slow evolving layers, widescreen depth, emotional restraint, huge atmospheric landscape'),
      atmosphere('avant-uncanny', 'Avant-Garde Perturbante', 'Strana, astratta, imprevedibile e artistica.', 'uncanny avant-garde atmosphere, unconventional structure, dissonant textures, unexpected gestures, abstract artistic tension'),
      atmosphere('noise-abrasive', 'Noise Abrasiva', 'Estrema, satura, rumorosa e fisica.', 'abrasive noise atmosphere, dense distortion, harsh spectral energy, unstable texture, physical sonic pressure'),
      atmosphere('electroacoustic-abstract', 'Elettroacustica Astratta', 'Organica e digitale insieme, concreta e sperimentale.', 'abstract electroacoustic atmosphere, acoustic fragments blended with electronic processing, spatial gestures, unusual timbral focus'),
      atmosphere('ebm-industrial-body', 'EBM Body Music', 'Meccanica, scura, marziale e ballabile.', 'EBM atmosphere, rigid electronic drums, sequenced bass, cold industrial synths, commanding body-oriented pulse'),
      atmosphere('witchhouse-haunted', 'Witch House Spettrale', 'Lenta, distorta, oscura e rituale.', 'haunted witch house atmosphere, slowed dark beats, detuned synths, spectral vocal textures, ritual nocturnal haze')
    ]
  }
];

export const DEFAULT_ATMOSPHERE_ID = 'deep-relaxed';

export const ALL_MUSIC_ATMOSPHERES = MUSIC_ATMOSPHERE_CATALOG.flatMap(group => group.atmospheres);

export function getAtmosphereById(id: string): MusicAtmosphere {
  return ALL_MUSIC_ATMOSPHERES.find(item => item.id === id) || ALL_MUSIC_ATMOSPHERES[0];
}

export function getRecommendedAtmosphereForGenre(genreName: string): MusicAtmosphere {
  const genre = String(genreName || '').toLowerCase();
  let id = DEFAULT_ATMOSPHERE_ID;

  // HOUSE
  if (genre.includes('deep house')) id = 'deep-relaxed';
  else if (genre.includes('tropical house') || genre.includes('beach house')) id = 'sunny-summer';
  else if (genre.includes('balearic') || genre.includes('ibiza')) id = 'balearic-sunset';
  else if (genre.includes('progressive house')) id = 'emotional-triumphant';
  else if (genre.includes('afro house') || genre.includes('tribal house') || genre.includes('afro tech house')) id = 'tribal-primordial';
  else if (genre.includes('acid house')) id = 'hypnotic-acid';
  else if (genre.includes('vocal house') || genre.includes('soulful house')) id = 'joyful-vocal';
  else if (genre.includes('minimal house') || genre.includes('microhouse')) id = 'raw-minimal';
  else if (genre.includes('organic house')) id = 'organic';
  else if (genre.includes('melodic house')) id = 'emotional';
  else if (genre.includes('tech house') || genre.includes('jackin house') || genre.includes('bass house') || genre.includes('g-house')) id = 'groovy';
  else if (genre.includes('disco house') || genre.includes('french house') || genre.includes('filter house') || genre.includes('funky house')) id = 'disco-glam';
  else if (genre.includes('electro house') || genre.includes('big room house') || genre.includes('future house') || genre.includes('slap house')) id = 'edm-mainstage';
  else if (genre.includes('piano house')) id = 'joyful-vocal';
  else if (genre.includes('lo-fi house')) id = 'lofi-dusty-calm';
  else if (genre.includes('hard house') || genre.includes('speed house')) id = 'hard-dance-adrenaline';
  else if (genre.includes('amapiano house') || genre.includes('kwaito house')) id = 'amapiano-deep-logdrum';

  // TECHNO / TRANCE / DNB / BASS / HARD DANCE
  else if (genre.includes('dub techno')) id = 'techno-dub-space';
  else if (genre.includes('melodic techno')) id = 'emotional';
  else if (genre.includes('hard techno') || genre.includes('industrial techno') || genre.includes('schranz')) id = 'techno-peak-driving';
  else if (genre.includes('minimal techno') || genre.includes('deep techno') || genre.includes('hypnotic techno')) id = 'techno-hypnotic-deep';
  else if (genre.includes('techno')) id = 'underground';
  else if (genre.includes('uplifting trance') || genre.includes('dream trance') || genre.includes('euro trance')) id = 'trance-uplifting-sky';
  else if (genre.includes('psytrance') || genre.includes('goa trance') || genre.includes('dark psytrance') || genre.includes('full-on')) id = 'trance-dark-psy';
  else if (genre.includes('vocal trance')) id = 'uplifting-vocal';
  else if (genre.includes('acid trance')) id = 'hypnotic-acid';
  else if (genre.includes('trance')) id = 'trance-inducing';
  else if (genre.includes('liquid drum')) id = 'dnb-liquid-emotional';
  else if (genre.includes('neurofunk') || genre.includes('techstep') || genre.includes('darkstep')) id = 'dnb-neuro-aggressive';
  else if (genre.includes('jungle') || genre.includes('breakcore')) id = 'jungle-raw-urban';
  else if (genre.includes('drum & bass') || genre.includes('drum and bass')) id = 'futuristic';
  else if (genre.includes('future garage') || genre.includes('uk garage') || genre.includes('2-step') || genre.includes('speed garage')) id = 'garage-night-swing';
  else if (genre.includes('deep dubstep')) id = 'dubstep-deep-pressure';
  else if (genre.includes('dubstep') || genre.includes('riddim') || genre.includes('brostep')) id = 'dark';
  else if (genre.includes('future bass')) id = 'edm-future-emotional';
  else if (genre.includes('grime')) id = 'rap-street-gritty';
  else if (genre.includes('breakbeat') || genre.includes('breaks') || genre.includes('big beat') || genre.includes('jersey club') || genre.includes('footwork')) id = 'breaks-kinetic';
  else if (genre.includes('hardstyle') || genre.includes('hardcore') || genre.includes('gabber') || genre.includes('frenchcore') || genre.includes('speedcore') || genre.includes('hardtek') || genre.includes('free tekno')) id = 'hard-dance-adrenaline';

  // EDM / DANCE / DISCO / FUNK
  else if (genre.includes('pop edm') || genre.includes('trap edm')) id = 'edm-festival-euphoric';
  else if (genre.includes('eurodance') || genre.includes('hi-nrg') || genre === 'dance' || genre.includes('dance-pop')) id = 'edm-summer-anthem';
  else if (genre.includes('italo disco') || genre.includes('space disco')) id = 'neon-night';
  else if (genre.includes('disco') || genre.includes('boogie')) id = 'disco-glam';
  else if (genre.includes('funk')) id = 'funky';

  // HIP HOP / RAP
  else if (genre.includes('boom bap') || genre.includes('east coast')) id = 'boombap-dusty';
  else if (genre.includes('west coast')) id = 'westcoast-sunny';
  else if (genre.includes('g-funk')) id = 'gfunk-smooth';
  else if (genre.includes('drill')) id = 'drill-menacing';
  else if (genre === 'trap' || genre.includes('southern hip hop')) id = 'trap-luxury';
  else if (genre.includes('cloud rap')) id = 'cloudrap-dreamy';
  else if (genre.includes('lo-fi hip hop') || genre.includes('jazz rap')) id = 'lofi-rap-introspective';
  else if (genre.includes('conscious hip hop')) id = 'conscious-hopeful';
  else if (genre.includes('emo rap')) id = 'emorap-vulnerable';
  else if (genre.includes('phonk')) id = 'phonk-nightdrive';
  else if (genre.includes('memphis rap')) id = 'memphis-horror';
  else if (genre.includes('hip hop') || genre.includes('rap')) id = 'rap-street-gritty';

  // R&B / SOUL
  else if (genre.includes('neo soul')) id = 'neosoul-intimate';
  else if (genre.includes('quiet storm')) id = 'quietstorm-romantic';
  else if (genre.includes('new jack swing')) id = 'newjack-energy';
  else if (genre.includes('motown')) id = 'motown-joy';
  else if (genre.includes('gospel soul')) id = 'gospelsoul-spiritual';
  else if (genre.includes('psychedelic soul')) id = 'psychedelic-soul-color';
  else if (genre.includes('r&b') || genre.includes('rnb')) id = 'rnb-latenight-sensual';
  else if (genre.includes('soul')) id = 'warm-soulful';

  // POP
  else if (genre.includes('dream pop')) id = 'pop-dream-ethereal';
  else if (genre.includes('indie pop') || genre.includes('art pop')) id = 'pop-indie-intimate';
  else if (genre.includes('synthpop')) id = 'pop-synth-neon';
  else if (genre.includes('hyperpop')) id = 'pop-hyper-color';
  else if (genre.includes('k-pop')) id = 'pop-kpop-colorful';
  else if (genre.includes('j-pop')) id = 'pop-jpop-uplift';
  else if (genre.includes('power pop')) id = 'pop-power-anthem';
  else if (genre.includes('pop')) id = 'pop-radio-bright';

  // ROCK / METAL / PUNK
  else if (genre.includes('post-rock')) id = 'rock-post-cinematic';
  else if (genre.includes('psychedelic rock')) id = 'rock-psychedelic-haze';
  else if (genre.includes('progressive rock')) id = 'rock-prog-epic';
  else if (genre.includes('garage rock')) id = 'rock-garage-raw';
  else if (genre.includes('surf rock')) id = 'rock-surf-sunny';
  else if (genre.includes('grunge')) id = 'rock-grunge-dirty';
  else if (genre.includes('shoegaze')) id = 'rock-shoegaze-wall';
  else if (genre.includes('indie rock') || genre.includes('alternative rock')) id = 'rock-indie-reflective';
  else if (genre.includes('rock')) id = 'rock-stadium-anthem';
  else if (genre.includes('doom metal') || genre.includes('drone metal') || genre.includes('sludge metal')) id = 'metal-doom-oppressive';
  else if (genre.includes('black metal')) id = 'metal-black-frozen';
  else if (genre.includes('death metal') || genre.includes('deathcore')) id = 'metal-death-brutal';
  else if (genre.includes('thrash metal') || genre.includes('speed metal')) id = 'metal-thrash-frenzy';
  else if (genre.includes('power metal')) id = 'metal-power-heroic';
  else if (genre.includes('symphonic metal')) id = 'metal-symphonic-majestic';
  else if (genre.includes('gothic metal')) id = 'metal-gothic-romantic';
  else if (genre.includes('industrial metal')) id = 'metal-industrial-machine';
  else if (genre.includes('metal')) id = 'metal-heavy-power';
  else if (genre.includes('post-punk')) id = 'postpunk-cold';
  else if (genre.includes('emo') || genre.includes('screamo') || genre.includes('post-hardcore')) id = 'emo-cathartic';
  else if (genre.includes('punk')) id = 'punk-rebel-fast';

  // JAZZ
  else if (genre.includes('bebop') || genre.includes('hard bop')) id = 'jazz-bebop-fire';
  else if (genre.includes('cool jazz')) id = 'jazz-cool';
  else if (genre.includes('swing jazz')) id = 'jazz-bigband-swing';
  else if (genre.includes('modal jazz')) id = 'jazz-modal-mystery';
  else if (genre.includes('free jazz')) id = 'jazz-free-avant';
  else if (genre.includes('jazz fusion') || genre.includes('jazz funk')) id = 'jazz-fusion-electric';
  else if (genre.includes('smooth jazz')) id = 'jazz-smooth-lounge';
  else if (genre.includes('latin jazz') || genre.includes('afro-cuban jazz')) id = 'jazz-latin-hot';
  else if (genre.includes('nu jazz') || genre.includes('acid jazz')) id = 'jazz-nujazz-urban';
  else if (genre.includes('jazz')) id = 'jazz-smoky-club';

  // BLUES
  else if (genre.includes('delta blues')) id = 'blues-delta-raw';
  else if (genre.includes('chicago blues') || genre.includes('electric blues')) id = 'blues-chicago-electric';
  else if (genre.includes('texas blues')) id = 'blues-texas-road';
  else if (genre.includes('jump blues')) id = 'blues-jump-party';
  else if (genre.includes('soul blues')) id = 'blues-soul-warm';
  else if (genre.includes('country blues') || genre.includes('piedmont blues')) id = 'blues-country-rustic';
  else if (genre.includes('blues')) id = 'blues-blue-melancholy';

  // CLASSICAL / ORCHESTRAL
  else if (genre.includes('baroque')) id = 'baroque-ornate';
  else if (genre.includes('romantic')) id = 'romantic-sweeping';
  else if (genre.includes('chamber')) id = 'chamber-intimate';
  else if (genre.includes('symphonic') || genre.includes('orchestral')) id = 'symphonic-majestic';
  else if (genre.includes('opera')) id = 'opera-dramatic';
  else if (genre.includes('choral')) id = 'choral-sacred';
  else if (genre.includes('piano solo')) id = 'piano-solo-intimate';
  else if (genre.includes('minimalism')) id = 'minimalist-classical';
  else if (genre.includes('neoclassical') || genre.includes('modern classical') || genre.includes('contemporary classical')) id = 'neoclassical-cinematic';
  else if (genre.includes('classical')) id = 'classical-balanced';

  // COUNTRY / AMERICANA / FOLK / WORLD
  else if (genre.includes('bluegrass')) id = 'bluegrass-lively';
  else if (genre.includes('honky tonk')) id = 'honkytonk-party';
  else if (genre.includes('americana') || genre.includes('alt-country') || genre.includes('outlaw country')) id = 'americana-openroad';
  else if (genre.includes('country')) id = 'country-rustic-warm';
  else if (genre.includes('celtic')) id = 'celtic-misty';
  else if (genre.includes('nordic')) id = 'nordic-folk-dark';
  else if (genre.includes('balkan')) id = 'balkan-folk-party';
  else if (genre.includes('fado')) id = 'fado-melancholy';
  else if (genre.includes('folk')) id = 'folk-acoustic-intimate';

  // REGGAE / CARIBBEAN / LATIN
  else if (genre.includes('roots reggae')) id = 'reggae-roots-spiritual';
  else if (genre === 'dub' || genre.includes(' dub')) id = 'dub-deep-space';
  else if (genre.includes('dancehall') || genre.includes('ragga')) id = 'dancehall-party';
  else if (genre.includes('ska')) id = 'ska-upbeat';
  else if (genre.includes('soca') || genre.includes('calypso')) id = 'soca-carnival';
  else if (genre.includes('reggae')) id = 'reggae-island-sunny';
  else if (genre.includes('salsa') || genre.includes('mambo') || genre.includes('cha-cha')) id = 'salsa-caliente';
  else if (genre.includes('bachata') || genre.includes('bolero')) id = 'bachata-romantic';
  else if (genre.includes('reggaeton') || genre.includes('latin trap')) id = 'reggaeton-sensual';
  else if (genre.includes('dembow')) id = 'dembow-street';
  else if (genre.includes('cumbia')) id = 'cumbia-festive';
  else if (genre.includes('samba')) id = 'samba-carnival';
  else if (genre.includes('tango')) id = 'tango-dramatic';
  else if (genre.includes('bossa nova')) id = 'bossa-breeze';
  else if (genre.includes('latin')) id = 'salsa-caliente';

  // AFRICAN / WORLD
  else if (genre.includes('afrobeats')) id = 'afrobeats-sunny-groove';
  else if (genre.includes('afrobeat')) id = 'afrobeat-live-fire';
  else if (genre.includes('amapiano')) id = 'amapiano-deep-logdrum';
  else if (genre.includes('gqom')) id = 'gqom-dark-rhythm';
  else if (genre.includes('highlife')) id = 'highlife-joyful';
  else if (genre.includes('gnawa')) id = 'gnawa-hypnotic';
  else if (genre.includes('desert blues')) id = 'desertblues-mystic';
  else if (genre.includes('soukous') || genre.includes('makossa') || genre.includes('mbalax')) id = 'soukous-celebration';
  else if (genre.includes('arabic') || genre.includes('middle eastern')) id = 'arabic-mystic';
  else if (genre.includes('indian classical')) id = 'indian-meditative';
  else if (genre.includes('bhangra') || genre.includes('bollywood')) id = 'bhangra-festival';
  else if (genre.includes('gamelan')) id = 'gamelan-ritual';
  else if (genre.includes('african') || genre.includes('afro fusion')) id = 'tribal-primordial';

  // AMBIENT / DOWNTEMPO / IDM
  else if (genre.includes('dark ambient')) id = 'darkambient-void';
  else if (genre.includes('trip hop')) id = 'triphop-smoky';
  else if (genre.includes('chillwave')) id = 'chillwave-nostalgia';
  else if (genre.includes('vaporwave')) id = 'vaporwave-surreal';
  else if (genre === 'idm') id = 'idm-cerebral';
  else if (genre.includes('glitch hop')) id = 'glitchhop-bouncy';
  else if (genre.includes('lo-fi')) id = 'lofi-dusty-calm';
  else if (genre.includes('synthwave')) id = 'synthwave-nightdrive';
  else if (genre.includes('retrowave')) id = 'retrowave-sunset';
  else if (genre.includes('space ambient')) id = 'spaceambient-cosmic';
  else if (genre.includes('ambient') || genre.includes('downtempo') || genre.includes('chillout')) id = 'ambient';

  // CINEMATIC / EXPERIMENTAL
  else if (genre.includes('fantasy score')) id = 'fantasy-enchanted';
  else if (genre.includes('action score')) id = 'action-adrenaline';
  else if (genre.includes('dark cinematic')) id = 'darkcinema-suspense';
  else if (genre.includes('game soundtrack')) id = 'game-epic-adventure';
  else if (genre.includes('ambient cinematic')) id = 'ambient-cinema-vast';
  else if (genre.includes('trailer')) id = 'trailer';
  else if (genre.includes('cinematic') || genre.includes('film score') || genre.includes('soundtrack')) id = 'cinematic';
  else if (genre.includes('avant-garde')) id = 'avant-uncanny';
  else if (genre === 'noise' || genre.includes('noise rock')) id = 'noise-abrasive';
  else if (genre.includes('electroacoustic') || genre.includes('musique concrète')) id = 'electroacoustic-abstract';
  else if (genre === 'ebm') id = 'ebm-industrial-body';
  else if (genre.includes('witch house')) id = 'witchhouse-haunted';
  else if (genre.includes('industrial') || genre.includes('darkwave') || genre.includes('deconstructed club') || genre.includes('experimental')) id = 'surreal';

  return getAtmosphereById(id);
}
