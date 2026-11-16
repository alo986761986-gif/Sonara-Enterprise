#!/usr/bin/env python3
"""Create compact official HeartMuLa tags from the selected SONARA music taxonomy.

The HeartMuLa 3B pipeline treats --tags as comma-separated descriptors and
lowercases them. It does not understand SONARA's long ACE-Step instruction
prompt as an executable contract. Keep the user's exact family > genre >
subgenre > atmosphere at the beginning, then add curated sonic cues from the
site's existing world-music style catalog. This improves conditioning, but
cannot guarantee a style match on every stochastic generation.

This module is pure stdlib, runs only inside the separate HeartMuLa worker,
and does not change ACE-Step, Remix Pro, checkpoints or model code.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Mapping

MAX_TAG_CHARS = 1100
MAX_LYRICS_CHARS = 10000
STYLE_FIELDS = (
    ("instrumentation", 3, 82),
    ("rhythm", 2, 100),
    ("harmony", 1, 80),
    ("production", 1, 72),
    ("atmosphere", 1, 85),
)
CONTROL = re.compile(r"[\x00-\x1f\x7f]+")
SPACE = re.compile(r"\s+")
SONARA_BOILERPLATE = re.compile(
    r"(?:EXECUTION PRIORITY|CREATOR DIRECTIVE CONTRACT|AUTHORITATIVE MUSICAL IDENTITY|"
    r"TECHNICAL PARAMETERS|FINAL RULE|SONARA HARD TEMPO LOCK|OPENING AND PACING LOCK)",
    re.IGNORECASE,
)


def clean(value: Any, limit: int = 180) -> str:
    if value is None:
        return ""
    result = unicodedata.normalize("NFKC", str(value))
    result = SPACE.sub(" ", CONTROL.sub(" ", result)).strip(" ,;\t")
    result = result.replace(",", " ").replace("<", "").replace(">", "")
    return result[:limit].rsplit(" ", 1)[0] if len(result) > limit and " " in result[:limit] else result[:limit]


def brief(request: Mapping[str, Any]) -> str:
    raw = str(request.get("rawPrompt") or "").strip()
    if not raw:
        raw = str(request.get("prompt") or "").strip()
    # A pre-existing long SONARA instruction is for ACE-Step, not for
    # HeartMuLa tags. Do not inject the first 4K of "EXECUTION PRIORITY".
    if SONARA_BOILERPLATE.search(raw):
        match = re.search(r"CREATOR BRIEF\s*[—-]\s*VERBATIM:\s*<<<\s*(.*?)\s*>>>", raw, re.I | re.S)
        raw = match.group(1) if match else ""
    return clean(raw, 180)


def _short_cues(value: Any, count: int, max_piece: int) -> list[str]:
    source = str(value or "")
    # Curated catalog instrumentation/rhythm fields often contain short
    # comma-separated instrument/technique clauses.
    chunks = re.split(r"[,;\n]+", source)
    result: list[str] = []
    for part in chunks:
        part = clean(part, max_piece)
        if len(part) < 3:
            continue
        if part.lower().startswith(("do not ", "never ", "avoid ", "no unwanted ")):
            continue
        result.append(part)
        if len(result) >= count:
            break
    return result


def build_heartmula_tags(request: Mapping[str, Any]) -> str:
    """Build tags, with all selected hierarchy members before free-form cues."""
    family = clean(request.get("genreFamily") or request.get("family"), 90)
    genre = clean(request.get("genre"), 90)
    subgenre = clean(request.get("subgenre"), 110)
    mood = clean(request.get("mood") or request.get("atmosphere"), 80)
    style = request.get("sonaraStyleDNA")
    style = style if isinstance(style, dict) else {}

    tags: list[str] = []
    seen: set[str] = set()

    def add(value: Any) -> None:
        token = clean(value, 160)
        key = token.casefold()
        if not token or key in seen or SONARA_BOILERPLATE.search(token):
            return
        # Preserve ordering, without adding a comma followed by whitespace.
        if sum(len(item) + 1 for item in tags) + len(token) > MAX_TAG_CHARS:
            return
        tags.append(token)
        seen.add(key)

    # Subgenre is the main sonic target, never reduced to the parent genre.
    for value in (subgenre, genre, family, mood):
        add(value)

    for key, count, max_piece in STYLE_FIELDS:
        for cue in _short_cues(style.get(key), count, max_piece):
            add(cue)

    identity = _short_cues(style.get("identity"), 1, 110)
    if identity:
        add(identity[0])

    value = request.get("bpm")
    try:
        tempo = int(round(float(value)))
        if 40 <= tempo <= 220:
            add(f"{tempo} bpm")
    except (TypeError, ValueError, OverflowError):
        pass

    key = clean(request.get("key") or request.get("keySignature"), 36)
    if key:
        add(key)

    vocals = clean(request.get("vocalMode"), 24).lower()
    if vocals == "instrumental" or not str(request.get("lyrics") or "").strip():
        add("instrumental")
    elif vocals in ("male", "female"):
        add(f"{vocals} lead vocal")
    elif vocals == "duet":
        add("male and female duet")
    language = clean(request.get("language") or request.get("vocalLanguage"), 42)
    if language and vocals != "instrumental":
        add(f"{language} lyrics")

    add(brief(request))
    if not tags:
        raise ValueError("HeartMuLa requires a musical style or prompt")
    return ",".join(tags)


def build_heartmula_lyrics(request: Mapping[str, Any]) -> str:
    text = str(request.get("lyrics") or "").replace("\r\n", "\n").strip()
    if clean(request.get("vocalMode"), 24).lower() == "instrumental" or not text:
        return "[Instrumental]"
    text = text[:MAX_LYRICS_CHARS]
    # The official HeartMuLa format uses structured sections.
    # Do not invent lyrics, languages, characters or a second chorus.
    if re.search(r"^\s*\[(?:intro|verse|chorus|bridge|outro|prechorus|instrumental)\]", text, re.M | re.I):
        return text
    return "[Verse]\n" + text
