from pathlib import Path

PATH = Path('cloudflare/sonara-quality-ultra-stability-guard.mjs')
text = PATH.read_text(encoding='utf-8')

old_direction = """  const direction = variantIndex === 0
    ? 'SONARA SONG A — independent composition. Create a complete song with its own melody, harmony, bass phrasing, drum groove, hook, arrangement, transitions, sound palette, climax and ending.'
    : 'SONARA SONG B — completely independent composition. Do NOT reuse Song A melodic contour, chord progression or voicing flow, bass rhythm, drum groove, hook rhythm, intro, build, drop or chorus contour, fills, transitions, sound palette or section architecture. Preserve only the creator locks: requested genre and subgenre, exact BPM, key, duration, lyrics and language, and singer identity.';"""

new_direction = """  const promptFidelity = 'FINAL PROMPT FIDELITY CONTRACT — NON-NEGOTIABLE: the creator prompt is the source of truth for BOTH Song A and Song B. Preserve every explicit semantic requirement from the prompt: musical concept, genre and subgenre, mood, era, energy, instrumentation, production style, rhythmic feel, vocal role and identity, language, lyrics, theme/story, atmosphere, exclusions, exact BPM/key/duration when specified, and all named creative details. Song B must sound like a second original composition commissioned from the EXACT SAME brief, never like a different prompt. Independence applies only to the musical solution, not to the requested identity or meaning.';
  const direction = variantIndex === 0
    ? 'SONARA SONG A — compose the first complete realization of the creator prompt. Follow the prompt literally and musically: no genre drift, no mood drift, no missing requested instruments or vocal intent.'
    : 'SONARA SONG B — compose a genuinely different song for the EXACT SAME creator prompt. Use a new melody, harmonic route/voicings, bass phrasing, drum details, hook contour, transitions and section development, while preserving ALL prompt semantics and stylistic requirements. Do not change concept, genre/subgenre, mood, era, instrumentation brief, production character, vocal intent, lyrics/theme or requested atmosphere. If novelty conflicts with prompt fidelity, PROMPT FIDELITY ALWAYS WINS.';"""

old_prompt = """    sonaraCompositionIdentity: variantIndex === 0 ? 'A' : 'B',
    sonaraIndependentAB: profile === 'ultra',
    prompt: [prompt, `SONARA ${profile.toUpperCase()} STABILITY DIRECTOR.`, fidelity, direction, `Independent composition seed=${independentSeed}.`].filter(Boolean).join('\\n\\n').slice(0, 12000)"""

new_prompt = """    sonaraCompositionIdentity: variantIndex === 0 ? 'A' : 'B',
    sonaraIndependentAB: profile === 'ultra',
    sonaraPromptFidelity: 'strict',
    sonaraCreatorIntentLocked: true,
    prompt: [prompt, `SONARA ${profile.toUpperCase()} STABILITY DIRECTOR.`, fidelity, direction, promptFidelity, `Independent composition seed=${independentSeed}.`].filter(Boolean).join('\\n\\n').slice(0, 12000)"""

if new_direction not in text:
    if old_direction not in text:
        raise SystemExit('QUALITY B direction marker not found')
    text = text.replace(old_direction, new_direction, 1)

if new_prompt not in text:
    if old_prompt not in text:
        raise SystemExit('QUALITY B prompt assembly marker not found')
    text = text.replace(old_prompt, new_prompt, 1)

required = [
    'FINAL PROMPT FIDELITY CONTRACT',
    'EXACT SAME creator prompt',
    'PROMPT FIDELITY ALWAYS WINS',
    "sonaraPromptFidelity: 'strict'",
    'sonaraCreatorIntentLocked: true',
    'promptFidelity',
]
for marker in required:
    if marker not in text:
        raise SystemExit(f'missing final marker: {marker}')

for forbidden in [
    'Preserve only the creator locks:',
]:
    if forbidden in text:
        raise SystemExit(f'forbidden stale marker still present: {forbidden}')

PATH.write_text(text, encoding='utf-8')
print('SONARA_QUALITY_B_PROMPT_FIDELITY_V4=PATCHED')
