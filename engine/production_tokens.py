"""
Sonara Prompt Engine V2 - Production Tokens Engine
Encodes prompt elements into precise internal tokens and translates tokens into studio-grade descriptions.
"""

from typing import Dict, Any, List

class ProductionTokenEngine:
    """
    Structured production token manager.
    Encodes internal parameters into standardized token identifiers and decodes them to prompts.
    """

    TOKEN_DICTIONARY: Dict[str, Dict[str, str]] = {
        # Kicks
        "deep_house_kick_03": "Deep Analog Sub Kick with Clean Transient Punch and Low-end Weight",
        "hard_techno_kick_09": "150 BPM Heavy Distorted Sub-rumble Kick with Industrial Distortion",
        "trap_kick_01": "Punchy Tight Acoustic/Digital Layered Trap Kick Drum",
        "pop_kick_05": "Warm Punchy Commercial Pop Kick with Saturated Midrange",
        "standard_kick_01": "Punchy Tight Studio Kick Drum",

        # Bass
        "analog_sub_07": "Warm Sub-heavy FM Sine-Square Bassline with Filter Envelope Modulation",
        "industrial_rumble_02": "Distorted Cavernous Sub-Rumble Acid Bassline",
        "trap_808_12": "Deep Pitch-bending 808 Sub Bass with Harmonic Saturation",
        "synthwave_saw_04": "Pulsing Detuned Dual Sawtooth Bass with Tight Low Cut",

        # Pads
        "warm_poly_05": "Lush Analog Warm Polyphonic Pads with Lush Reverb & Shimmer",
        "dark_drone_01": "Atmospheric Low-pass Filtered Drone Pad with Subtle Detune",
        "orchestral_strings_08": "Soaring Cinematic Symphonic String Ensemble Pads",

        # Leads
        "plucked_synth_02": "Muted Electric Piano Chords and Soft Plucked Synth Leads",
        "hard_acid_06": "Resonant Acid 303 Synth Lead with Envelope Sweep",
        "commercial_vocal_chop_01": "Tuned Melodic Vocal Chop Lead with Stereo Delay",

        # Percussion
        "shaker_groove_04": "Crisp Shaker Grooves, Rimshots, and Off-beat Open Hi-Hats",
        "trap_hat_rolls_09": "Fast 32nd Note Rolling Hi-Hats with Pitch Glides & Snare Claps",
        "industrial_perch_03": "Metalled Industrial Percussion Stabs & Noise Claps",

        # Master / Standards
        "spotify_master_v2": "Streaming Ready, -14 LUFS Target, Warm Tube Saturation & Transparent Peak Limiting",
        "festival_master_v1": "Festival Mainstage Loudness, Slammed -7 LUFS, Maximum Punch & Sub Power",
        "commercial_radio_v3": "Crisp Radio Master, Balanced Midrange, Wide Stereo & Pristine Dynamics"
    }

    GENRE_TOKEN_MAPS: Dict[str, Dict[str, str]] = {
        "Deep House": {
            "kick": "deep_house_kick_03",
            "bass": "analog_sub_07",
            "pads": "warm_poly_05",
            "lead": "plucked_synth_02",
            "percussion": "shaker_groove_04",
            "master": "spotify_master_v2"
        },
        "Hard Techno": {
            "kick": "hard_techno_kick_09",
            "bass": "industrial_rumble_02",
            "pads": "dark_drone_01",
            "lead": "hard_acid_06",
            "percussion": "industrial_perch_03",
            "master": "festival_master_v1"
        },
        "Trap": {
            "kick": "trap_kick_01",
            "bass": "trap_808_12",
            "pads": "dark_drone_01",
            "lead": "commercial_vocal_chop_01",
            "percussion": "trap_hat_rolls_09",
            "master": "commercial_radio_v3"
        },
        "Pop": {
            "kick": "pop_kick_05",
            "bass": "analog_sub_07",
            "pads": "warm_poly_05",
            "lead": "commercial_vocal_chop_01",
            "percussion": "shaker_groove_04",
            "master": "commercial_radio_v3"
        }
    }

    DEFAULT_TOKENS: Dict[str, str] = {
        "kick": "standard_kick_01",
        "bass": "analog_sub_07",
        "pads": "warm_poly_05",
        "lead": "plucked_synth_02",
        "percussion": "shaker_groove_04",
        "master": "spotify_master_v2"
    }

    def encode_tokens(self, genre: str, dna: Any = None, mood_data: Any = None) -> Dict[str, str]:
        """
        Encodes genre, DNA and mood parameters into internal production token IDs.
        """
        for key in self.GENRE_TOKEN_MAPS:
            if key.lower() in genre.lower() or genre.lower() in key.lower():
                return self.GENRE_TOKEN_MAPS[key].copy()

        return self.DEFAULT_TOKENS.copy()

    def decode_token(self, token_id: str) -> str:
        """
        Translates a single token identifier into its studio description.
        """
        return self.TOKEN_DICTIONARY.get(token_id, token_id.replace("_", " ").title())

    def decode_tokens_to_prompt(self, tokens: Dict[str, str]) -> Dict[str, str]:
        """
        Decodes a full token dictionary into an explicit prompt component breakdown.
        """
        decoded = {}
        for category, token_id in tokens.items():
            decoded[category] = self.decode_token(token_id)
        return decoded
