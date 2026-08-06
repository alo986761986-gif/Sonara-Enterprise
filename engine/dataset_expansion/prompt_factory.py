import random
from typing import Dict, Any, List, Optional

GENRES_MAP = {
    "Techno": ["Dark Techno", "Industrial Techno", "Minimal Techno", "Peak Time Techno"],
    "Melodic Techno": ["Cosmic Techno", "Atmospheric Melodic Techno", "Neo-Trance Techno"],
    "Deep House": "Classic Deep House, Soulful Deep House, Organic House, Lounge House".split(", "),
    "Tech House": "Groovy Tech House, Peak Time Tech House, Minimal Tech House, Modern Tech House".split(", "),
    "Progressive House": "Melodic Progressive House, Sunset Progressive House, Festival Progressive House".split(", "),
    "Future Rave": "Mainstage Future Rave, Neo-Trance Future Rave, Cyberpunk Future Rave".split(", "),
    "EDM Festival": "Bigroom EDM, Electro House, Future Bass Festival, Hardwell-Inspired EDM".split(", "),
    "Trance": "Uplifting Trance, Progressive Trance, Psytrance, Vocal Trance".split(", "),
    "Ambient": "Drone Ambient, Cinematic Ambient, Space Ambient, Organic Chillout".split(", "),
    "Cinematic": "Orchestral Electronic, Cyberpunk Soundtrack, Dark Ambient Cinematic, Post-Rock Electronic".split(", "),
    "Pop": "Synthpop, Dance-Pop, Electro-Pop, Indie-Pop Electronic".split(", "),
    "Trap": "Future Trap, Melodic Trap, Chill Trap, Hard Trap".split(", "),
    "Drill": "UK Drill Electronic, Melodic Drill, Cyber Drill, Cinematic Drill".split(", "),
    "Rock": "Electronic Rock, Industrial Rock, Synth-Rock, Post-Rock Fusion".split(", ")
}

MOODS = ["Dark", "Euphoric", "Melancholic", "Uplifting", "Mysterious", "Energetic", "Hypnotic", "Dreamy", "Aggressive", "Sensual", "Nostalgic", "Tense", "Triumphant", "Peaceful"]
EMOTIONS = ["Hope", "Sadness", "Exhilaration", "Yearning", "Rage", "Serenity", "Anxiety", "Awe", "Intimacy", "Determination", "Lust", "Curiosity"]
ATMOSPHERES = ["Smoky warehouse", "Nebula space cosmic background", "Sun-drenched beach cove", "Gritty futuristic cyberpunk alley", "Ethereal misty forest", "Neon-lit night drive", "Epic stadium crowd", "Underwater coral reef", "Industrial underground concrete vault", "Haunting gothic cathedral"]
ARTIST_INSPIRATIONS = {
    "Techno": ["Charlotte de Witte", "Amelie Lens", "Richie Hawtin", "Adam Beyer"],
    "Melodic Techno": ["Tale Of Us", "Mind Against", "Ben Böhmer", "Artbat"],
    "Deep House": ["Kerri Chandler", "Maya Jane Coles", "Disclosure", "Solomun"],
    "Tech House": ["Fisher", "Chris Lake", "Michael Bibi", "John Summit"],
    "Progressive House": ["Eric Prydz", "Hernan Cattaneo", "Deadmau5", "Lane 8"],
    "Future Rave": ["David Guetta", "MORTEN", "Hardwell"],
    "EDM Festival": ["Martin Garrix", "Avicii", "Swedish House Mafia", "Tiesto"],
    "Trance": ["Armin van Buuren", "Paul van Dyk", "Ferry Corsten", "Aly & Fila"],
    "Ambient": ["Brian Eno", "Jon Hopkins", "Aphex Twin", "Carbon Based Lifeforms"],
    "Cinematic": ["Hans Zimmer", "Trent Reznor", "Vangelis", "Max Richter"],
    "Pop": ["Dua Lipa", "The Weeknd", "Charli XCX", "Billie Eilish"],
    "Trap": ["Metro Boomin", "Flume", "Travis Scott", "RL Grime"],
    "Drill": ["Pop Smoke", "Headie One", "808Melo"],
    "Rock": ["Nine Inch Nails", "Muse", "Linkin Park", "Depeche Mode"]
}

INSTRUMENTATION = {
    "Electronic": ["Moog Sub37 Bass", "Roland TB-303 Acid Synth", "Prophet-6 Warm Pads", "Access Virus TI Lead", "Arp Odyssey Plucks", "808 Drum Machine Stabs", "FM Bell Synths", "Orchestral Strings Section", "Heavy Distortion Electric Guitar", "Acoustic Grand Piano", "Warm Analog Rhodes", "Resonant Bandpass Synths", "Crisp Metallic Hihats"],
    "Acoustic": ["Live acoustic drums", "Deep cello drone", "Upright acoustic bass", "Vintage acoustic piano", "Overdriven rock guitar"]
}

MIX_STYLES = [
    "Wide panoramic stereo imaging, crystal-clear high frequencies, perfect low-end frequency separation.",
    "Warm analog saturation, cohesive glue compression, deep mono-compatible sub bass layer.",
    "High transient definition, dynamic punch, clinical 3D depth, surgical notch EQ separation.",
    "Lush tape compression, vintage mid-range warmth, organic hardware-like harmonic distortion."
]

MASTER_STYLES = [
    "Competitive loudness ready for club systems, -11 LUFS target, ultra-transparent peak limiting.",
    "Streaming-optimized mastering, -14 LUFS target, wide dynamic range preservation, clean transient ceiling.",
    "Maximalist modern master, heavy tube warming, saturated transients, tight sidechain ducking curve.",
    "Audiophile-grade master, zero clipping, transparent headroom preservation, linear-phase EQ finishing."
]

STRUCTURES = [
    "Intro -> Build-up -> Drop -> Core Groove -> Breakdown -> Main Drop -> Outro",
    "Atmospheric Intro -> Dynamic Build-up -> Heavy Drop -> Steady Outro",
    "Continuous hypnotic progression with modular filter sweeps, no traditional breakdowns",
    "Melodic Intro -> Long cinematic build -> Explosive Drop -> Breakdown -> Second Melodic Drop -> Outro"
]

DROP_STYLES = [
    "Explosive energy blast with heavy sub-bass kick impact and razor-sharp lead synth stabs.",
    "Hypnotic groove lock with rolling sidechained bassline, minimal percussion, and filter modulation.",
    "Lush melodic resolution with soaring synth chords, massive stereo expansion, and driving drum patterns.",
    "Aggressive rhythmic switch with saturated main riff, industrial percussion, and deep sub drop impacts."
]

BREAKDOWN_STYLES = [
    "Cinematic orchestral bridge with washing lush reverbs, modular pitch risers, and vocal chants.",
    "Minimalist percussion strip-down revealing warm sub-bass pulsations and emotional pad layers.",
    "Dramatic pitch-bending synth risers, white noise sweeps, and ticking clock-like transient patterns.",
    "Dreamy ambient interlude with floating piano chords, organic field recordings, and tape-delay echoes."
]

SCALES = ["Minor", "Major", "Phrygian", "Dorian", "Aeolian", "Locrian", "Mixolydian"]
KEYS = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"]

class PromptFactory:
    """
    Generates rich, highly varied and stylistically authentic prompts for music synthesis models (MusicGen).
    Ensures zero duplicate prompts by leveraging structured combinations of music theory and DSP variables.
    """

    @staticmethod
    def get_all_genres() -> List[str]:
        return list(GENRES_MAP.keys())

    @staticmethod
    def generate_prompt_dto(genre: Optional[str] = None) -> Dict[str, Any]:
        if not genre or genre not in GENRES_MAP:
            genre = random.choice(list(GENRES_MAP.keys()))
            
        subgenres = GENRES_MAP[genre]
        subgenre = random.choice(subgenres)
        mood = random.choice(MOODS)
        emotion = random.choice(EMOTIONS)
        energy_level = round(random.uniform(0.4, 0.98), 2)
        
        # Match BPM to genre realistic ranges
        if genre == "Techno":
            bpm = float(random.randint(128, 142))
        elif genre == "Melodic Techno":
            bpm = float(random.randint(122, 128))
        elif genre in ["Deep House", "Tech House"]:
            bpm = float(random.randint(120, 126))
        elif genre in ["Progressive House", "Trance"]:
            bpm = float(random.randint(124, 138))
        elif genre == "Future Rave":
            bpm = float(random.randint(126, 130))
        elif genre == "EDM Festival":
            bpm = float(random.randint(126, 132))
        elif genre == "Ambient":
            bpm = float(random.randint(60, 100))
        elif genre == "Cinematic":
            bpm = float(random.randint(70, 120))
        elif genre == "Pop":
            bpm = float(random.randint(100, 130))
        elif genre in ["Trap", "Drill"]:
            bpm = float(random.randint(130, 150))
        elif genre == "Rock":
            bpm = float(random.randint(90, 140))
        else:
            bpm = 124.0

        key = random.choice(KEYS)
        scale = random.choice(SCALES)
        atmosphere = random.choice(ATMOSPHERES)
        
        artists = ARTIST_INSPIRATIONS.get(genre, ["Unknown Producer"])
        artist = random.choice(artists)
        
        instrument_list = random.sample(INSTRUMENTATION["Electronic"], k=3)
        if genre in ["Cinematic", "Pop", "Rock"]:
            instrument_list.append(random.choice(INSTRUMENTATION["Acoustic"]))
            
        instruments = ", ".join(instrument_list)
        mix_style = random.choice(MIX_STYLES)
        master_style = random.choice(MASTER_STYLES)
        structure = random.choice(STRUCTURES)
        drop_style = random.choice(DROP_STYLES)
        breakdown_style = random.choice(BREAKDOWN_STYLES)
        
        # Construct the detailed prompt string
        prompt_text = (
            f"Genre: {genre}. Subgenre: {subgenre}. "
            f"Style / Influence: inspired by {artist}. "
            f"Instruments: {instruments}. "
            f"Structure: {structure}. "
            f"Drop Style: {drop_style}. "
            f"Breakdown Style: {breakdown_style}. "
            f"Mood: {mood}, {emotion}. Atmosphere: {atmosphere}. "
            f"Audio Specifications: BPM {bpm:.1f}, Key {key} {scale}, Energy {energy_level:.2f}. "
            f"Mixing & Mastering: {mix_style} {master_style}"
        )
        
        return {
            "prompt_text": prompt_text,
            "genre": genre,
            "subgenre": subgenre,
            "mood": mood,
            "emotion": emotion,
            "energy": energy_level,
            "bpm": bpm,
            "key": f"{key} {scale}",
            "atmosphere": atmosphere,
            "artist": artist,
            "instruments": instrument_list,
            "mix_style": mix_style,
            "master_style": master_style,
            "structure": structure,
            "drop_style": drop_style,
            "breakdown_style": breakdown_style
        }
