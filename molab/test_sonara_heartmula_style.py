#!/usr/bin/env python3
"""Regression tests for HeartMuLa's official comma-separated style tags."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parent))
from sonara_heartmula_style import (
    MAX_TAG_CHARS, build_heartmula_tags, build_heartmula_lyrics
)


def request(family,genre,subgenre,mood,instruments,rhythm,identity=None):
    return {
        "genreFamily":family,"genre":genre,"subgenre":subgenre,
        "mood":mood,"bpm":124,"key":"A Minor",
        "vocalMode":"instrumental",
        "rawPrompt":"a deliberately arranged original track",
        "sonaraStyleDNA":{
            "instrumentation":instruments,
            "rhythm":rhythm,
            "identity":identity or subgenre,
            "atmosphere":mood+" performance and production",
        }
    }


class HeartMuLaGenreConditioningTests(unittest.TestCase):
    def test_deep_house_is_not_generic_dance(self):
        tags=build_heartmula_tags(request(
            "Electronic / Dance","House","Deep House","Warm",
            "rounded deep bass,warm electric piano,soft defined house drums",
            "four on the floor,lightly syncopated percussion"))
        self.assertTrue(tags.startswith("Deep House,House,Electronic / Dance,Warm,"))
        self.assertIn("rounded deep bass",tags)
        self.assertIn("warm electric piano",tags)
        self.assertIn("four on the floor",tags)
        self.assertNotIn(", ",tags)
        self.assertLessEqual(len(tags),MAX_TAG_CHARS)

    def test_non_electronic_families_keep_own_instruments(self):
        choices=[
            ("Jazz","Jazz Fusion","Jazz Fusion","Sophisticated","Rhodes,electric bass,jazz guitar","syncopated jazz funk pocket"),
            ("Latin America","Latin","Bossa Nova","Intimate","nylon guitar,acoustic bass,subtle shaker","Brazilian bossa syncopation"),
            ("Hip-Hop / Rap","Hip-Hop","Boom Bap","Gritty","dusty chopped drums,deep bass","human swing,head nod pocket"),
            ("Rock","Rock","Progressive Rock","Dramatic","electric guitar,acoustic drum kit","complex rock phrasing"),
            ("Neomelodica Napoletana","Neomelodico","Neomelodico Moderno","Romantic","piano,mandolin,lyrical strings","song-led pop pulse"),
            ("Africa","African Pop","Amapiano","Groovy","log drum,jazzy electric piano","South African shuffling house rhythm"),
            ("South Asia","Indian Classical","Hindustani Classical","Meditative","sitar,tabla,tanpura","raga and tala phrasing"),
        ]
        for family,genre,subgenre,mood,instr,rhythm in choices:
            with self.subTest(subgenre=subgenre):
                tags=build_heartmula_tags(request(family,genre,subgenre,mood,instr,rhythm))
                expected=list(dict.fromkeys([subgenre,genre,family,mood]))
                self.assertEqual(tags.split(",")[:len(expected)],expected)
                self.assertIn(instr.split(",")[0],tags)
                self.assertIn(rhythm.split(",")[0],tags)
                self.assertNotIn("EXECUTION PRIORITY",tags)
                self.assertLessEqual(len(tags),MAX_TAG_CHARS)

    def test_female_italian_voice_and_lyrics_remain(self):
        r=request("Pop","Pop","Contemporary Pop","Romantic","piano,strings","soft pop beat")
        r.update({"lyrics":"Ciao amore","vocalMode":"female","language":"it"})
        tags=build_heartmula_tags(r)
        self.assertIn("female lead vocal",tags)
        self.assertIn("it lyrics",tags)
        self.assertNotIn("instrumental",tags.lower())
        self.assertEqual(build_heartmula_lyrics(r),"[Verse]\nCiao amore")

    def test_instrumental_is_never_vocal(self):
        r=request("Jazz","Jazz Fusion","Jazz Fusion","Intimate","Rhodes,bass","swing")
        r["lyrics"]="words should not be sung"
        r["vocalMode"]="instrumental"
        self.assertEqual(build_heartmula_lyrics(r),"[Instrumental]")
        self.assertIn("instrumental",build_heartmula_tags(r))

    def test_full_ace_step_text_is_not_injected_into_tags(self):
        r=request("Latin America","Latin","Salsa","Festive","congas,brass","clave")
        r.pop("rawPrompt")
        r["prompt"]="EXECUTION PRIORITY — NON-NEGOTIABLE:\nSONARA HARD TEMPO LOCK: 124 BPM\nCREATOR BRIEF — VERBATIM:\n<<<\nAuthentic salsa orchestra\n>>>"
        tags=build_heartmula_tags(r)
        self.assertNotIn("EXECUTION PRIORITY",tags)
        self.assertNotIn("SONARA HARD TEMPO LOCK",tags)
        self.assertIn("Authentic salsa orchestra",tags)

    def test_tags_never_overshoot_budget_or_duplicate(self):
        r=request("Electronic / Dance","House","Tech House","Dark",
                  ("sub bass,syncopated percussion,drum machine," * 300),
                  "strict four to floor,"*300)
        tags=build_heartmula_tags(r)
        self.assertLessEqual(len(tags),MAX_TAG_CHARS)
        self.assertEqual(len(tags.split(",")),len(set(s.casefold() for s in tags.split(","))))


if __name__=="__main__":
    unittest.main()
