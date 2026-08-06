# 🧬 Sonara Labs - Track Genome Lineage Specification

**Component**: Track Genome Provenance Engine  
**Role**: Complete Lineage, Evolution Graph & Historical Provenance  
**Role**: Chief Software Architect  
**Regime**: **SOFTWARE FREEZE** (Pure Architectural Specification)  
**Date**: 2026-08-01  

---

## 📌 1. Concept & Purpose

The **Track Genome** is the historical lineage and provenance graph embedded within every track in the Sonara Music Knowledge Engine. It records the complete chronological sequence of transformations that produced a specific audio track version—from initial text prompt synthesis, through audio generation, DSP analysis, critic scoring, empirical benchmarking, and evolutionary mutation.

---

## 🕸️ 2. The Provenance Pipeline Graph

Every track's lineage follows a deterministic Directed Acyclic Graph (DAG) sequence:

```
+-------------------+
|    PROMPT STAGE   |  Prompt text, seed, parameters, target subgenre
+-------------------+
          │
          ▼
+-------------------+
|    AUDIO STAGE    |  Base inference / LoRA forward pass -> audio.wav
+-------------------+
          │
          ▼
+-------------------+
|   ANALYSIS STAGE  |  DSP extraction -> LUFS, True Peak, Stereo Width, EQ
+-------------------+
          │
          ▼
+-------------------+
|    CRITIC STAGE   |  Multi-perspective music evaluation -> Quality Score
+-------------------+
          │
          ▼
+-------------------+
|  BENCHMARK STAGE  |  Head-to-head empirical comparison vs ACE-Step Base
+-------------------+
          │
          ▼
+-------------------+
|  EVOLUTION STAGE  |  Quality Tier classification (GOLD/SILVER/DISCARDED)
+-------------------+
          │
          ▼
+-------------------+
|  CURRENT VERSION  |  Registered immutable MusicDNA version entity
+-------------------+
```

---

## 📊 3. Track Genome Entity Schema (`track_genome.json`)

Inside every physical track bundle `/dataset/<genre>/<subgenre>/<uuid>/`, a `genome.json` file records its complete genomic history:

```json
{
  "genome_spec_version": "7.0.0",
  "track_uuid": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3d0001",
  "ancestral_lineage": {
    "root_seed_uuid": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3d0001",
    "parent_uuid": null,
    "generation_index": 0,
    "mutation_history": []
  },
  "provenance_timeline": [
    {
      "step": 1,
      "stage": "PROMPT",
      "timestamp_utc": "2026-08-01T14:28:00Z",
      "executor": "Prompt Engine V2",
      "parameters": {
        "genre": "House",
        "subgenre": "Deep House",
        "bpm": 124,
        "key": "G Minor",
        "seed": 100001
      }
    },
    {
      "step": 2,
      "stage": "AUDIO_GENERATION",
      "timestamp_utc": "2026-08-01T14:28:15Z",
      "executor": "Deep House LoRA V1",
      "output_artifact": "audio.wav",
      "sha256": "f1e2d3c4b5a6..."
    },
    {
      "step": 3,
      "stage": "DSP_ANALYSIS",
      "timestamp_utc": "2026-08-01T14:28:30Z",
      "executor": "Audio Analyzer Module",
      "output_artifact": "analysis.json",
      "key_metrics": { "lufs": -11.4, "true_peak_db": -0.8, "stereo_width": 0.95 }
    },
    {
      "step": 4,
      "stage": "CRITIC_EVALUATION",
      "timestamp_utc": "2026-08-01T14:28:45Z",
      "executor": "Music Critic Engine",
      "output_artifact": "critic.json",
      "overall_score": 96.4
    },
    {
      "step": 5,
      "stage": "BENCHMARK_COMPARISON",
      "timestamp_utc": "2026-08-01T14:29:00Z",
      "executor": "Empirical Benchmark Runner",
      "vs_baseline": "ACE-Step Base",
      "delta_score": +10.3,
      "winner": "LoRA V1"
    },
    {
      "step": 6,
      "stage": "CLASSIFICATION_PROMOTION",
      "timestamp_utc": "2026-08-01T14:29:15Z",
      "tier": "GOLD",
      "lora_eligible": true
    }
  ]
}
```

---

## 🔄 4. Multiplicity & Relational Dynamics

### 4.1 Relationship Rules
1. **One Prompt → Many Tracks**: A single text prompt template or parameter set can seed $N$ track executions across different random seeds and model versions.
2. **One LoRA Model → Many Tracks**: A LoRA adapter weights file (`lora_v1.safetensors`) can synthesize $N$ distinct audio track entities.
3. **One Track → Many Versions**: Modifying audio parameters, remixing, or re-mastering a track yields a new child track entity pointing back to `parent_uuid`.
4. **Parent Reference Integrity**: Every child track stores its `parent_uuid` and `generation_index` ($G_{child} = G_{parent} + 1$).

```
[Prompt P1] ───┬──> [Track T1 (Seed 101)] ──(Remix)──> [Track T1.1 (v1.1.0)]
               │
               └──> [Track T2 (Seed 102)]
```
