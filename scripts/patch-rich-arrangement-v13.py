#!/usr/bin/env python3
from pathlib import Path

TARGET = Path('cloudflare/sonara-engine-v15-authoritative-prompt.mjs')
ROUTER = Path('cloudflare/sonara-molab-xl-router.mjs')
MARKER = 'sonara-rich-arrangement-v13'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY')
        return text
    if old not in text:
        raise SystemExit(f'{label}=PATTERN_MISSING')
    print(f'{label}=PATCHED')
    return text.replace(old, new, 1)


def patch_prompt(text: str) -> str:
    text = replace_once(
        text,
        "const COHERENCE_CRITIC_ID = 'sonara-musical-coherence-critic-v1';\nconst MAX_PROMPT_CHARS = 2200;\nconst MAX_CREATOR_BRIEF_CHARS = 520;",
        "const COHERENCE_CRITIC_ID = 'sonara-musical-coherence-critic-v1';\nconst RICH_ARRANGEMENT_ID = 'sonara-rich-arrangement-v13';\nconst MAX_PROMPT_CHARS = 3600;\nconst MAX_CREATOR_BRIEF_CHARS = 900;",
        'PROMPT_BUDGET_AND_MARKER'
    )
    
    rich_fn = r'''
    function richProductionDNA(body = {}) {
      const style = normalizedStyle(body);
      const acoustic = /jazz|blues|classical|orchestral|folk|country|acoustic|bluegrass/.test(style);
      const peak = acoustic ? '7-11' : '9-14';
      const density = `at peak sections use about ${peak} complementary musical/production roles when authentic: core drums, secondary percussion/groove detail, bass, harmony, support harmony, hook/lead, counter-response, atmosphere/room, fills/ornaments and transition/FX. Thin intros, verses and breakdowns intentionally, then rebuild; do not run every layer continuously.`;
    
      if (/deep house|tech house|house|garage|afro house|amapiano|progressive house|melodic house/.test(style)) return {
    instruments: 'layered club drums, secondary percussion, authoritative bass, chord/stab or Rhodes layer, supporting pad/pluck, hook motif, counter-response, atmosphere and section fills chosen for the exact house subgenre',
    effects: 'filter sweeps, reverse cymbals/claps, noise or organic risers, impacts, downlifters, delay throws, reverb tails, micro-fills and automation that announce or connect sections',
    performance: 'stable club pulse with evolving hats/percussion, bass articulation, note lengths, filter/envelope movement and re-performed fills instead of copy-paste loops',
    density
      };
      if (/techno|hardgroove|minimal techno/.test(style)) return {
    instruments: 'physical kick, rumble/sub, layered hats, claps/rims/toms, syncopated percussion, hypnotic stab or sequence, textural synth layer, restrained hook and atmosphere',
    effects: 'rumble tails, reverse percussion, metallic impacts, noise sweeps, delay-feedback moments, modulation, automation and industrial ambience only when genre-authentic',
    performance: 'keep the pulse relentless but evolve accents, ghost hits, modulation, fills and texture every phrase so the groove never becomes a static loop',
    density
      };
      if (/trance|psytrance/.test(style)) return {
    instruments: 'driving kick/bass lock, layered hats/percussion, arpeggio or rhythmic synth, pads, supporting plucks, lead motif, counterline and atmospheric layers',
    effects: 'uplifters, reverse crashes, filtered risers, impacts, gated/long reverb tails, delay throws, downlifters and automation sweeps shaped around sections',
    performance: 'preserve energetic pulse while arps, filters, accents and layered motifs evolve toward deliberate tension-and-release peaks',
    density
      };
      if (/drum.*bass|dnb|jungle|breakbeat/.test(style)) return {
    instruments: 'layered/chopped breaks, kick/snare reinforcement, ghost percussion, sub or Reese bass as appropriate, atmospheric pad, concise motif, counter texture and fills',
    effects: 'break edits, reverse hits, filtered noise, impacts, bass automation, short delays, reverb throws and transition edits without masking the breakbeat',
    performance: 'vary break edits, ghost notes, accents and bass articulation while keeping full-time momentum and a coherent main groove',
    density
      };
      if (/trap|drill|hip.?hop|rap|boom bap|freestyle/.test(style)) return {
    instruments: 'character kick/snare, detailed hats/percussion, 808 or focused bass, sample/keys/chord bed, main motif, supporting texture, counter accents and selective fills with clear space for vocals',
    effects: 'reverse samples, vinyl/tape texture when authentic, drops, impacts, filtered transitions, delay/reverb throws, beat cuts and ear-candy accents between phrases',
    performance: 'humanize pocket, hat subdivisions, ghost notes, 808 articulation and sample phrasing; repeat hooks with small fills/accents rather than identical bars',
    density
      };
      if (/r&b|rnb|neo soul|soul|funk|disco/.test(style)) return {
    instruments: 'live-feeling drums/percussion, melodic bass, Rhodes/piano or guitar chords, supporting harmony, hook instrument, counterline, tasteful strings/brass/synth support and room detail where authentic',
    effects: 'plate/room reverb, tape or analog saturation character, delay throws, filtered transitions, reverse swells and subtle ear candy that supports groove',
    performance: 'use pocket, ghost notes, syncopation, expressive note lengths, chord voicing changes and section-specific fills with believable ensemble interaction',
    density
      };
      if (/pop|synthpop|electropop/.test(style)) return {
    instruments: 'punchy drums, bass, primary chord layer, secondary harmonic support, signature hook, counter-melody, pads/textures, vocal-support layers and section fills',
    effects: 'reverse swells, risers, impacts, downlifters, delays, reverbs, filtered transitions, ear-candy one-shots and automation placed around hooks and section changes',
    performance: 'keep hooks immediately recognizable but vary drum fills, bass articulation, support layers and transitions across verses, choruses and bridge',
    density
      };
      if (/metal|hard rock|punk/.test(style)) return {
    instruments: 'multi-mic-feeling acoustic drums, electric bass, double-tracked rhythm guitars, lead/texture guitar, room/amp character and only genre-authentic supporting layers',
    effects: 'amp/room ambience, feedback, cymbal swells, pick slides, tom fills, short delays/reverbs and performance-led transitions instead of EDM risers',
    performance: 'preserve human drum dynamics, pick attack, fret/amp variation, realistic guitar articulation and non-identical repeated sections',
    density
      };
      if (/rock|indie|alternative|grunge/.test(style)) return {
    instruments: 'realistic drum kit, electric bass, rhythm guitar layers, lead/texture guitar, optional keys/organ and room/amp depth appropriate to the era',
    effects: 'room and amp tails, feedback, cymbal swells, reverse guitar or tape texture when authentic, short delays/reverbs and natural fills into section changes',
    performance: 'use believable drummer/bassist/guitarist interaction, dynamic strums, note-length variation, fills and section-dependent intensity rather than rigid quantization',
    density
      };
      if (/jazz|bebop|swing|fusion/.test(style)) return {
    instruments: 'acoustic drum kit with ride/brush detail, upright/electric bass as appropriate, piano/Rhodes or guitar comping, lead horn/voice, optional horn responses and natural room',
    effects: 'mostly natural room, plate/room reverb and subtle tape/console character; transitions should come from fills, turnarounds, pickups and ensemble cues rather than synthetic FX',
    performance: 'human swing, velocity nuance, articulation, comping variation, call-and-response and genuine ensemble interaction; never clone repeated phrases',
    density
      };
      if (/blues/.test(style)) return {
    instruments: 'human drum kit, bass, expressive electric/acoustic guitar, piano/organ, optional harmonica or horn support and natural room',
    effects: 'amp spring/room reverb, tremolo, tasteful slap/tape delay, slide noises and performance fills instead of electronic transition effects',
    performance: 'expressive bends, vibrato, shuffle/swing pocket, dynamic comping and spontaneous fills with believable live interaction',
    density
      };
      if (/reggae|dub|dancehall/.test(style)) return {
    instruments: 'deep bass, one-drop/steppers/dancehall drums as requested, skank guitar/keys, bubble organ, percussion, melodic accents and spacious dub-compatible layers',
    effects: 'dub delay throws, spring/plate reverb, filter/mute drops, tape feedback, percussion echoes and dramatic space used rhythmically',
    performance: 'keep bass/drum pocket authoritative while skanks, percussion and dub sends breathe and vary across sections',
    density
      };
      if (/reggaeton|dembow|latin trap|salsa|bachata|merengue|cumbia|latin/.test(style)) return {
    instruments: 'genre-correct core rhythm, bass, percussion family, chord instrument, lead/hook instrument, counter-response, fills and authentic acoustic/electronic supporting colors',
    effects: 'reverse percussion, fills, impacts, vocal/instrument delay throws, reverbs and transition swells that support the Latin rhythmic language without EDM overproduction',
    performance: 'preserve clave/dembow or requested rhythmic identity, interlocking percussion, natural accents and call-and-response with evolving fills',
    density
      };
      if (/classical|orchestral|cinematic|score/.test(style)) return {
    instruments: 'orchestrated strings by register, woodwinds, brass, tuned/untuned percussion and selective piano/choir/synth layers only when the requested palette calls for them',
    effects: 'natural hall/room, orchestral swells, cymbal rolls, impacts, low booms and transition tails integrated as part of the score rather than pasted-on SFX',
    performance: 'use expressive dynamics, articulation changes, phrase breathing, realistic register/voicing and evolving orchestration instead of static sustained layers',
    density
      };
      if (/country|folk|bluegrass|acoustic|americana/.test(style)) return {
    instruments: 'human drums/percussion when appropriate, acoustic bass, acoustic/electric guitar, mandolin/banjo/fiddle/piano or pedal steel only as genre-authentic supporting voices',
    effects: 'natural room, plate, tape/slap character and performance transitions such as pickups, stops, fills and swells rather than synthetic EDM FX',
    performance: 'realistic picking/strumming, fret and bow articulation, human timing, dynamic ensemble changes and re-performed repeated sections',
    density
      };
      if (/ambient|downtempo|chill|lo.?fi/.test(style)) return {
    instruments: 'soft drums or percussion when appropriate, warm bass, keys/chords, pad bed, motif, counter texture, field/room layer and evolving tonal details',
    effects: 'long reverbs, tape echo, filtered noise/field texture, reverse tails, granular or modulation detail and slow automation with clear musical purpose',
    performance: 'favor subtle evolution, breathing envelopes, texture changes and organic micro-variation so minimalism never becomes empty or static',
    density
      };
      return {
    instruments: 'genre-authentic core drums, secondary rhythm detail, bass, harmony, supporting harmony, hook/lead, counter-response, atmosphere, fills/ornaments and transition layers chosen only when musically appropriate',
    effects: 'genre-authentic transition FX, reverbs, delays, impacts, swells, reverse elements, automation and ear candy used to connect sections rather than create random noise',
    performance: 'vary dynamics, articulation, accents, fills, note lengths, ambience and automation so repeated sections feel produced and performed rather than cloned',
    density
      };
    }
    '''
    
    text = replace_once(
        text,
        'function creativeProfile(weirdness, styleInfluence, subgenre) {',
        rich_fn + '\nfunction creativeProfile(weirdness, styleInfluence, subgenre) {',
        'RICH_PRODUCTION_DNA'
    )
    
    text = replace_once(
        text,
        '  const dna = musicalDNA({ ...body, genreFamily: family, genre, subgenre });\n\n  const compact = [',
        '  const dna = musicalDNA({ ...body, genreFamily: family, genre, subgenre });\n  const rich = richProductionDNA({ ...body, genreFamily: family, genre, subgenre });\n\n  const compact = [',
        'RICH_DNA_BIND'
    )
    
    text = replace_once(
        text,
        '    `SOUND: ${dna.sound}.`,\n    `ARRANGEMENT: ${dna.arrangement}.`,\n    vocalProfile(body),',
        '    `SOUND: ${dna.sound}.`,\n    `INSTRUMENTATION: ${rich.instruments}.`,\n    `DENSITY: ${rich.density}.`,\n    `ARRANGEMENT: ${dna.arrangement}.`,\n    `FX/SOUND DESIGN: ${rich.effects}. Effects must announce, connect or resolve sections; never become random noise or replace musical content.`,\n    `PERFORMANCE: ${rich.performance}.`,\n    vocalProfile(body),',
        'PROMPT_RICHNESS_LINES'
    )
    
    text = replace_once(
        text,
        '  return `CRITIC: reject contradictions and genre drift. ${selected}, key, duration and structured controls win. ${bpmRule} ${conflictHint} Harmony, groove, sound and arrangement must reinforce each other. Avoid ${dna.avoid}.`;',
        '  return `CRITIC: reject contradictions, genre drift and demo-like sparsity. ${selected}, key, duration and structured controls win. ${bpmRule} ${conflictHint} Harmony, groove, instrumentation, density, effects and arrangement must reinforce each other. Avoid ${dna.avoid}.`;',
        'SPARSITY_CRITIC'
    )
    
    text = replace_once(
        text,
        '    sonaraCoherenceCritic: COHERENCE_CRITIC_ID,\n    sonaraCreatorStylePriority: false,',
        '    sonaraCoherenceCritic: COHERENCE_CRITIC_ID,\n    sonaraRichArrangement: RICH_ARRANGEMENT_ID,\n    sonaraCreatorStylePriority: false,',
        'REQUEST_RICH_MARKER'
    )
    
    text = replace_once(
        text,
        '    sonaraArrangementIntelligence: true,\n    sonaraVocalIntelligence: true,',
        '    sonaraArrangementIntelligence: true,\n    sonaraFullInstrumentation: true,\n    sonaraSectionDensityIntelligence: true,\n    sonaraSoundEffectsIntelligence: true,\n    sonaraHumanPerformanceIntelligence: true,\n    sonaraVocalIntelligence: true,',
        'REQUEST_RICH_FLAGS'
    )
    
    text = replace_once(
        text,
        "  headers.set('x-sonara-coherence-critic', COHERENCE_CRITIC_ID);\n  if (bpm !== null) {",
        "  headers.set('x-sonara-coherence-critic', COHERENCE_CRITIC_ID);\n  headers.set('x-sonara-rich-arrangement', RICH_ARRANGEMENT_ID);\n  if (bpm !== null) {",
        'RICH_HEADER'
    )
    
    text = replace_once(
        text,
        '      coherenceCritic: COHERENCE_CRITIC_ID,\n      bpmRange: `${BPM_MIN}-${BPM_MAX}`,',
        '      coherenceCritic: COHERENCE_CRITIC_ID,\n      richArrangement: RICH_ARRANGEMENT_ID,\n      bpmRange: `${BPM_MIN}-${BPM_MAX}`,',
        'HEALTH_RICH_MARKER'
    )
    
    text = replace_once(
        text,
        '      arrangementIntelligence: true,\n      vocalIntelligence: true,',
        '      arrangementIntelligence: true,\n      fullInstrumentation: true,\n      sectionDensityIntelligence: true,\n      soundEffectsIntelligence: true,\n      humanPerformanceIntelligence: true,\n      vocalIntelligence: true,',
        'HEALTH_RICH_FLAGS'
    )
    
    return text


def patch_router(text: str) -> str:
    text = replace_once(
        text,
        "const REALISM_API_MARKER = 'sonara-realism-api-v1';\nconst MODEL = 'acestep-v15-xl-turbo';",
        "const REALISM_API_MARKER = 'sonara-realism-api-v1';\nconst RICH_ARRANGEMENT_PROFILE = 'sonara-rich-arrangement-v13';\nconst MODEL = 'acestep-v15-xl-turbo';",
        'ROUTER_RICH_PROFILE'
    )
    text = replace_once(
        text,
        "      'x-sonara-real-music': REAL_MUSIC_PROFILE,\n      ...cors(request)",
        "      'x-sonara-real-music': REAL_MUSIC_PROFILE,\n      'x-sonara-rich-arrangement': RICH_ARRANGEMENT_PROFILE,\n      ...cors(request)",
        'ROUTER_JSON_HEADER'
    )
    text = replace_once(
        text,
        "    realMusicProfile: realMusic ? REAL_MUSIC_PROFILE : null,\n    generationProfile:",
        "    realMusicProfile: realMusic ? REAL_MUSIC_PROFILE : null,\n    richArrangementProfile: RICH_ARRANGEMENT_PROFILE,\n    fullInstrumentation: true,\n    sectionDensityIntelligence: true,\n    soundEffectsIntelligence: true,\n    humanPerformanceIntelligence: true,\n    generationProfile:",
        'ROUTER_QUALITY_METADATA'
    )
    text = replace_once(
        text,
        "    realMusicProfile: REAL_MUSIC_PROFILE,\n    realMusicReady,",
        "    realMusicProfile: REAL_MUSIC_PROFILE,\n    richArrangementProfile: RICH_ARRANGEMENT_PROFILE,\n    fullInstrumentation: true,\n    sectionDensityIntelligence: true,\n    soundEffectsIntelligence: true,\n    humanPerformanceIntelligence: true,\n    realMusicReady,",
        'ROUTER_READINESS_METADATA'
    )
    text = replace_once(
        text,
        "  out.set('x-sonara-real-music', REAL_MUSIC_PROFILE);\n  out.set('x-sonara-ace-worker', 'molab-xl');",
        "  out.set('x-sonara-real-music', REAL_MUSIC_PROFILE);\n  out.set('x-sonara-rich-arrangement', RICH_ARRANGEMENT_PROFILE);\n  out.set('x-sonara-ace-worker', 'molab-xl');",
        'ROUTER_AUDIO_HEADER'
    )
    text = replace_once(
        text,
        "  headers.set('x-sonara-real-music', REAL_MUSIC_PROFILE);\n  return new Response(response.body,",
        "  headers.set('x-sonara-real-music', REAL_MUSIC_PROFILE);\n  headers.set('x-sonara-rich-arrangement', RICH_ARRANGEMENT_PROFILE);\n  return new Response(response.body,",
        'ROUTER_RESPONSE_HEADER'
    )
    return text


def main() -> None:
    prompt = TARGET.read_text(encoding='utf-8')
    router = ROUTER.read_text(encoding='utf-8')
    if MARKER not in prompt:
        prompt = patch_prompt(prompt)
        TARGET.write_text(prompt, encoding='utf-8')
        print('SONARA_RICH_PROMPT_V13=PATCHED')
    else:
        print('SONARA_RICH_PROMPT_V13=ALREADY_ACTIVE')
    if MARKER not in router:
        router = patch_router(router)
        ROUTER.write_text(router, encoding='utf-8')
        print('SONARA_RICH_ROUTER_V13=PATCHED')
    else:
        print('SONARA_RICH_ROUTER_V13=ALREADY_ACTIVE')
    print('PROMPT_BUDGET=3600')
    print('PEAK_ROLE_TARGET=7-11_ACOUSTIC_OR_9-14_OTHER')
    print('FX_SOUND_DESIGN=GENRE_AUTHENTIC')
    print('SECTION_DENSITY=EVOLVING')
    print('HUMAN_PERFORMANCE=ACTIVE')


if __name__ == '__main__':
    main()
