#!/usr/bin/env python3
from pathlib import Path

p = Path('cloudflare/sonara-molab-xl-router.mjs')
s = p.read_text(encoding='utf-8')

marker = 'SONARA FULL INSTRUMENTATION V12'
if marker in s:
    print('FULL_INSTRUMENTATION_V12=ALREADY_ACTIVE')
    raise SystemExit(0)

needle = """    'Use genre-authentic drums, bass language, instrumentation, harmonic vocabulary, melodic phrasing, transitions, mix balance and mastering character.',
    'For vocals, preserve supplied lyrics, requested language and singer intent. For instrumental requests, do not invent lead vocals.',
"""
replacement = """    'Use genre-authentic drums, bass language, instrumentation, harmonic vocabulary, melodic phrasing, transitions, mix balance and mastering character.',
    'SONARA FULL INSTRUMENTATION V12: make the arrangement feel full, rich, layered and professionally produced rather than sparse or demo-like.',
    'When the requested genre supports it, build roughly 8-12 distinct complementary musical/production roles: primary drums, secondary percussion, bass, chord/harmonic instrument, supporting harmony layer, lead or hook instrument, counter-melody/response layer, atmosphere/texture, fills/ornaments, transitions and genre-authentic ear-candy.',
    'Add instruments ONLY when they naturally belong to the requested genre/subgenre, era and production language. Never inflate the arrangement with unrelated instruments.',
    'Distribute layers by register, frequency and musical function. Use section-specific entrances/exits, call-and-response, evolving automation and contrast so the track feels dense and expensive without becoming muddy or overcrowded.',
    'Preserve creator-selected instruments as authoritative anchors; supporting instruments may expand the arrangement but must never remove, replace or contradict explicitly requested instruments.',
    'For vocals, preserve supplied lyrics, requested language and singer intent. For instrumental requests, do not invent lead vocals.',
"""

if needle not in s:
    raise SystemExit('FULL_INSTRUMENTATION_V12_PATTERN_MISSING')

s = s.replace(needle, replacement, 1)
p.write_text(s, encoding='utf-8')
print('FULL_INSTRUMENTATION_V12=PATCHED')
print('TARGET_ROLES=8-12_WHEN_GENRE_SUPPORTS')
print('GENRE_AUTHENTIC_ONLY=TRUE')
print('CREATOR_INSTRUMENT_LOCK=PRESERVED')
