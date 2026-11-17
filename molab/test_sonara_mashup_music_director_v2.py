"""SONARA Music Director V2 validation tests: safe, no model or GPU required."""
import unittest
from molab.sonara_mashup_music_director_v2 import (
    DirectorError, build_segments, template, valid_config
)

class TestMusicDirectorV2(unittest.TestCase):
    def test_valid_professional_project(self):
        result = valid_config({
            "vocalPolicy":"dialogue","masterProfile":"studio",
            "variation":3,"vocalGainA":75,"vocalGainB":55,
            "instrumentGainB":80,
            "sections":[{"name":"verse","bars":8,"voice":"b","energy":70}]
        })
        self.assertAlmostEqual(result["vocalGainA"],.75)
        self.assertAlmostEqual(result["vocalGainB"],.55)
        self.assertEqual(result["sections"][0]["voice"],"b")

    def test_reject_bad_stem_levels(self):
        with self.assertRaises(DirectorError):
            valid_config({"vocalGainA":float("nan")})
        with self.assertRaises(DirectorError):
            valid_config({"instrumentGainB":200})

    def test_reject_bad_section(self):
        with self.assertRaises(DirectorError):
            valid_config({"sections":[{"name":"chorus","bars":9,"voice":"auto","energy":60}]})
        with self.assertRaises(DirectorError):
            valid_config({"sections":[{"name":"verse","bars":8,"voice":"x","energy":60}]})
        with self.assertRaises(DirectorError):
            valid_config({"sections":[{"name":"verse","bars":8,"voice":"a","energy":150}]})

    def test_sections_exact_duration(self):
        sections = build_segments(120,124,"club",{})
        self.assertGreater(len(sections),2)
        self.assertEqual(sections[0]["start"],0.0)
        self.assertAlmostEqual(sections[-1]["end"],120,places=3)
        self.assertTrue(all(s["end"]>s["start"] for s in sections))
        self.assertTrue(all(x["end"]<=y["start"]+.00001 for x,y in zip(sections,sections[1:])))

    def test_user_section_voice_is_preserved(self):
        custom={"sections":[
            {"name":"intro","bars":4,"voice":"none","energy":20},
            {"name":"verse","bars":8,"voice":"b","energy":65},
        ]}
        sections=build_segments(120,120,"dialogue",custom)
        self.assertEqual(sections[0]["voice"],"none")
        self.assertEqual(sections[1]["voice"],"b")

    def test_no_fake_structure_detection_claim(self):
        sections = template("dialogue",100,120)
        self.assertEqual(sections[0]["name"],"intro")
        self.assertEqual(sections[-1]["name"],"outro")

if __name__=="__main__":
    unittest.main()
