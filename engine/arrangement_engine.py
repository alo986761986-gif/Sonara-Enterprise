"""
Sonara Prompt Engine V2 - Arrangement Engine
Generates dynamic bar-by-bar and section-by-section song structures tailored to genre and energy.
"""

from typing import List, Dict, Any, Tuple

class ArrangementEngine:
    """
    Computes professional structural arrangements with bar counts and section energy levels.
    """

    STRUCTURE_PRESETS: Dict[str, List[Tuple[str, int, str]]] = {
        "Festival House": [
            ("Intro", 8, "Filtered kick and atmospheric sweeps"),
            ("Build", 16, "Rising snare rolls, vocal chops and pitch risers"),
            ("Drop", 32, "Full punchy main kick, heavy sub bass, lead synth line"),
            ("Break", 16, "Lush vocal melody, atmospheric chords, no kick"),
            ("Drop", 32, "Peak energy main drop with driving percussion"),
            ("Outro", 16, "Gradual element strip down for seamless DJ mixing")
        ],
        "Trap": [
            ("Intro", 8, "Atmospheric dark pads and 808 slides tease"),
            ("Hook", 8, "Aggressive vocal lead, heavy sub 808, fast hi-hat rolls"),
            ("Verse", 16, "Stripped down percussion, vocal focus, sub bass pulses"),
            ("Hook", 8, "Full energy hook with synth brass and brass hits"),
            ("Bridge", 8, "Filtered vocal chops, ambient breakdown, 808 pause"),
            ("Hook", 8, "Final explosive hook with max percussion density"),
            ("Outro", 8, "Decaying tail, 808 rumble fadeout")
        ],
        "Cinematic": [
            ("Intro", 8, "Subtle ambient drone, solo cello and distant reverb tail"),
            ("Theme", 16, "Establishment of main emotional orchestral motif"),
            ("Development", 24, "Layering brass swells, timpani rolls, choir crescendo"),
            ("Climax", 32, "Full epic orchestral climax with soaring strings & heavy brass"),
            ("Ending", 16, "Sustained trailing piano chords and quiet woodwinds fade")
        ],
        "Deep House": [
            ("Intro", 16, "Minimalist rimshot groove, soft sub bass tease"),
            ("Beat In", 16, "Full four-on-the-floor kick, warm hi-hats, vocal chop"),
            ("Breakdown", 16, "Rhodes chords, lush atmospheric pads, bass drop-out"),
            ("Build", 8, "Subtle noise sweep and filter opening"),
            ("Drop", 32, "Soulful bassline groove, warm chord stabs, crisp percussion"),
            ("Outro", 16, "DJ friendly drum tail and atmospheric fade")
        ],
        "Hard Techno": [
            ("Intro", 16, "Rumble kick and distorted industrial hi-hats"),
            ("Drive", 32, "Heavy 150 BPM distorted kick, acid synth baseline"),
            ("Breakdown", 16, "Cavernous reverb tail, dark sirens, filter sweep"),
            ("Build", 16, "Accelerating snare rolls and distorted synth tension"),
            ("Drop", 64, "Raw industrial peak energy, peak rumble and harsh synth lead"),
            ("Outro", 16, "Stripped kick drum and noise tail")
        ],
        "Pop": [
            ("Intro", 4, "Hook motif snippet and acoustic guitar strum"),
            ("Verse 1", 16, "Intimate vocal delivery, light bass, subtle percussion"),
            ("Pre-Chorus", 8, "Harmonic build, rising synth pads, dynamic snare build"),
            ("Chorus", 16, "Explosive main hook, full beat, stacked vocal harmonies"),
            ("Verse 2", 16, "Rhythmic variation, added hi-hats and bass groove"),
            ("Chorus", 16, "Full energy main hook"),
            ("Bridge", 8, "Emotional vocal breakdown with minimal piano accompaniment"),
            ("Chorus", 16, "Final big chorus with ad-libs and vocal riffs"),
            ("Outro", 8, "Vocal ad-lib tail and fading instrumentals")
        ]
    }

    DEFAULT_STRUCTURE: List[Tuple[str, int, str]] = [
        ("Intro", 8, "Setting the mood and rhythm pattern"),
        ("Verse / Build", 16, "Introducing main musical theme"),
        ("Drop / Chorus", 32, "Main high-energy section"),
        ("Breakdown", 16, "Harmonic breathing space"),
        ("Drop / Chorus", 32, "Peak energy climax"),
        ("Outro", 16, "Resolving section")
    ]

    def generate_arrangement(self, genre: str, energy: str = "High", total_bars: int = 128) -> Dict[str, Any]:
        """
        Generates structured arrangement breakdown for a specified genre.
        """
        structure = None
        for key, preset in self.STRUCTURE_PRESETS.items():
            if key.lower() in genre.lower() or genre.lower() in key.lower():
                structure = preset
                break

        if not structure:
            structure = self.DEFAULT_STRUCTURE

        sections_list = []
        formatted_str_list = []
        calc_total_bars = 0

        for section_name, bar_count, desc in structure:
            calc_total_bars += bar_count
            sections_list.append({
                "section": section_name,
                "bars": bar_count,
                "description": desc
            })
            formatted_str_list.append(f"{bar_count} Bars {section_name}")

        return {
            "genre_structure": genre,
            "total_bars": calc_total_bars,
            "summary": " -> ".join(formatted_str_list),
            "sections": sections_list
        }
