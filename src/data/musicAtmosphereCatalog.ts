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

  if (genre.includes('deep house')) id = 'deep-relaxed';
  else if (genre.includes('tropical') || genre.includes('beach')) id = 'sunny-summer';
  else if (genre.includes('balearic') || genre.includes('ibiza')) id = 'balearic-sunset';
  else if (genre.includes('progressive house') || genre.includes('uplifting trance')) id = 'emotional-triumphant';
  else if (genre.includes('afro') || genre.includes('tribal') || genre.includes('amapiano') || genre.includes('gqom')) id = 'tribal-primordial';
  else if (genre.includes('acid')) id = 'hypnotic-acid';
  else if (genre.includes('vocal') || genre.includes('gospel') || genre.includes('soulful')) id = 'joyful-vocal';
  else if (genre.includes('minimal') || genre.includes('microhouse')) id = 'raw-minimal';
  else if (genre.includes('organic')) id = 'organic';
  else if (genre.includes('melodic')) id = 'emotional';
  else if (genre.includes('tech house') || genre.includes('jackin') || genre.includes('bass house') || genre.includes('g-house')) id = 'groovy';
  else if (genre.includes('disco') || genre.includes('funk') || genre.includes('boogie')) id = 'disco-glam';
  else if (genre.includes('hard techno') || genre.includes('hardstyle') || genre.includes('hardcore') || genre.includes('metal')) id = 'aggressive';
  else if (genre.includes('techno') || genre.includes('warehouse')) id = 'underground';
  else if (genre.includes('psy') || genre.includes('goa') || genre.includes('trance')) id = 'trance-inducing';
  else if (genre.includes('ambient') || genre.includes('downtempo') || genre.includes('chill')) id = 'ambient';
  else if (genre.includes('drum & bass') || genre.includes('jungle') || genre.includes('breakcore')) id = 'futuristic';
  else if (genre.includes('dubstep') || genre.includes('riddim') || genre.includes('industrial')) id = 'dark';
  else if (genre.includes('synthwave') || genre.includes('retrowave') || genre.includes('cyber')) id = 'neon-night';
  else if (genre.includes('cinematic') || genre.includes('orchestral') || genre.includes('soundtrack')) id = 'cinematic';
  else if (genre.includes('jazz')) id = 'jazzy';
  else if (genre.includes('blues') || genre.includes('soul') || genre.includes('r&b')) id = 'warm-soulful';
  else if (genre.includes('hip hop') || genre.includes('rap') || genre.includes('drill') || genre.includes('phonk')) id = 'swagger';
  else if (genre.includes('pop')) id = 'uplifting-vocal';
  else if (genre.includes('folk') || genre.includes('world') || genre.includes('country')) id = 'organic';
  else if (genre.includes('experimental') || genre.includes('avant') || genre.includes('noise')) id = 'surreal';

  return getAtmosphereById(id);
}
