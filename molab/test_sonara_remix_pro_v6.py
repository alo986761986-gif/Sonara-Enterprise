"""Offline standard-library V6 regression tests. No GPU, jobs or network."""
import unittest
from sonara_remix_pro_v6 import (CreativeControls, V6ControlError, v6_controls,
                                  musical_dna, compose_direction)

class CreativeV6Test(unittest.TestCase):
    def test_defaults_and_invalid_input(self):
        c = v6_controls({"v6":True,"v6Controls":{"mode":"wild","groove":80}})
        self.assertEqual(c.mode, "wild")
        self.assertEqual(c.groove, 80)
        self.assertEqual(c.master, "streaming")
        with self.assertRaises(V6ControlError):
            v6_controls({"v6":True,"v6Controls":{"master":"unsafe"}})
        with self.assertRaises(V6ControlError):
            v6_controls({"v6":True,"v6Controls":{"humanize":31}})
        with self.assertRaises(V6ControlError):
            v6_controls({"v6":True,"v6Controls":{"humanize":True}})
        with self.assertRaises(V6ControlError):
            v6_controls({"v6":True,"v6Controls":{"bad":"not-allowed"}})
        with self.assertRaises(V6ControlError):
            v6_controls({"v6":False})

    def test_measured_dna_has_explicit_uncertainty(self):
        a={"tempoBpm":124,"tempoConfidence":.91,"key":"A minor","keyConfidence":.82,
           "boundaryCandidatesSeconds":[11,23,55]}
        b={"tempoBpm":136,"tempoConfidence":.1,"key":None,"keyConfidence":.1}
        dna=musical_dna(a,b,{"confidence":"measured-onset-proxy","onsetsPerSecond":2.2})
        self.assertEqual(dna["a"]["tempoBpm"],124.0)
        self.assertIsNone(dna["b"]["tempoBpm"])
        self.assertEqual(dna["a"]["energyBoundariesSeconds"],[11.0,23.0,55.0])
        self.assertEqual(dna["grooveOnsetsPerSecond"],2.2)

    def test_composer_generates_distinct_mode_and_candidate_instructions(self):
        dna=musical_dna({"tempoBpm":122,"tempoConfidence":.9},{})
        mode_prompts={}
        for mode in ("balanced","experimental","wild","explosive"):
            c=CreativeControls(mode=mode)
            prompts=[compose_direction(c,dna,i,3) for i in range(3)]
            if mode != "explosive":
                self.assertEqual(len(set(prompts)),3)
            for prompt in prompts:
                self.assertIn("Never overlay",prompt)
                self.assertLessEqual(len(prompt),1550)
                self.assertIn("TWO DISTINCT ORIGINAL A and B",prompt)
                self.assertIn("Instrumental backing only",prompt)
                self.assertNotIn("SAME identifiable lead voice",prompt)
                self.assertIn("never synthesize",prompt.lower())
            mode_prompts[mode]=prompts[0]
        self.assertEqual(len(set(mode_prompts.values())),4)
        self.assertIn("EXPERIMENTAL MODE",mode_prompts["experimental"])
        self.assertIn("WILD MODE",mode_prompts["wild"])
        self.assertIn("CONTINUITY LOCK",mode_prompts["explosive"])
        self.assertNotIn("CONTINUITY LOCK",mode_prompts["balanced"])
        with self.assertRaises(V6ControlError):
            compose_direction(CreativeControls(),dna,3,3)

if __name__=="__main__":
    unittest.main()
