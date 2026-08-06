# 🧬 Sonara Labs - Music DNA Data Model Specification

**Entity Name**: `MusicDNA`  
**Primary Key**: `uuid` (UUID v4, Immutable)  
**Role**: Chief Software Architect  
**Regime**: **SOFTWARE FREEZE** (Pure Architectural Specification)  
**Date**: 2026-08-01  

---

## 📑 1. Overview
The `MusicDNA` entity is the foundational data model of the Sonara Music Knowledge Engine. It captures every dimensional attribute of a musical track produced or analyzed by Sonara Labs—spanning physical storage metadata, acoustic signal metrics, AI prompt parameters, critique scores, empirical benchmark comparisons, evolutionary lineage, and cryptographic hashes.

---

## 🗂️ 2. Detailed Field Definitions by Category

### Category 1: IDENTITÀ (Identity)
| Field Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `uuid` | String (UUID v4) | Primary Key, Immutable, Unique | Unique global identifier generated upon track creation. |
| `title` | String | Non-empty, Max 128 chars | Track title or working title. |
| `slug` | String | URL-safe, Unique | Canonical URL slug derived from title and UUID snippet. |
| `created_at` | String (ISO 8601 UTC) | Immutable | Creation timestamp (e.g. `2026-08-01T15:00:00Z`). |
| `owner_id` | String | Non-empty | Identifier of user, agent, or system session. |
| `license_type` | String | Enum: `PROPRIETARY`, `CC-BY-4.0`, `ROYALTY_FREE` | Licensing regime assigned to the track. |

### Category 2: PRODUZIONE (Production)
| Field Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `seed` | Integer | Unsigned 64-bit int | Random seed used for generation. |
| `prompt_text` | String | Max 2048 chars | Complete positive generation prompt. |
| `negative_prompt` | String | Max 1024 chars | Negative prompt constraints. |
| `model_architecture` | String | Enum: `ACE_STEP_BASE`, `ACE_STEP_TURBO` | Base AI audio synthesis model used. |
| `generation_time_ms` | Integer | > 0 | Total inference time in milliseconds. |
| `sample_rate_hz` | Integer | Default `44100` | Audio sample rate. |
| `bit_depth` | Integer | Default `24` | Audio bit depth. |

### Category 3: MUSICA (Musicology & Arrangement)
| Field Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `genre` | String | Enum: `House`, `Techno`, `Trance`, `Electronic` | Primary musical genre. |
| `subgenre` | String | Non-empty | Specific subgenre (e.g., `Deep House`, `Melodic Techno`). |
| `bpm` | Float | 40.0 - 240.0 | Tempos in beats per minute. |
| `musical_key` | String | Standard Key notation | e.g. `G Minor`, `C Major`, `F# Minor`. |
| `time_signature` | String | Pattern `^\d+/\d+$` | e.g. `4/4`, `3/4`. |
| `arrangement_sections` | Array[String] | Enum items | Array of structure blocks (e.g. `["Intro", "Build", "Drop", "Outro"]`). |

### Category 4: ANALISI (Audio Signal & Acoustic Metrics)
| Field Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `lufs_integrated` | Float | -30.0 to 0.0 | Integrated loudness in LUFS. |
| `true_peak_db` | Float | -20.0 to +3.0 | Maximum true peak level in dBFS. |
| `dynamic_range_db` | Float | 0.0 to 30.0 | Crest factor / dynamic range in dB. |
| `stereo_width` | Float | 0.0 to 1.0 | Normalized stereo panorama correlation. |
| `frequency_balance` | Object | Standard energy bands | Spectral distribution across Sub, Bass, Mid, High. |
| `danceability` | Float | 0.0 to 1.0 | Rhythm regularity & transient strength. |
| `replay_value` | Float | 0.0 to 1.0 | Algorithmic hook stickiness score. |
| `bpm_accuracy` | Float | 0.0 to 1.0 | Alignment between target BPM and detected grid. |

### Category 5: CRITICA (Music Critic Scores)
| Field Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `rhythm_score` | Float | 0.0 to 100.0 | Groove, swing, and percussion rating. |
| `harmony_score` | Float | 0.0 to 100.0 | Chord progression & tonal coherence. |
| `sound_design_score` | Float | 0.0 to 100.0 | Timbral richness & synthesizer patch quality. |
| `mixing_score` | Float | 0.0 to 100.0 | Frequency separation & dynamic clarity. |
| `structure_score` | Float | 0.0 to 100.0 | Arrangement pacing & energy transitions. |
| `overall_critic_score` | Float | 0.0 to 100.0 | Weighted average critic evaluation. |

### Category 6: BENCHMARK (Empirical Comparison)
| Field Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `benchmark_comparison_id` | String (UUID v4) | Optional | ID of head-to-head evaluation run. |
| `baseline_model` | String | Default `ACE-Step Base` | Reference model name. |
| `baseline_score` | Float | 0.0 to 100.0 | Baseline model quality score. |
| `target_score` | Float | 0.0 to 100.0 | Sonara / LoRA model quality score. |
| `delta_quality` | Float | Range -100 to +100 | Target score minus Baseline score. |
| `p_value` | Float | 0.0 to 1.0 | Statistical significance of quality win. |
| `winner` | String | Enum: `LORA`, `BASELINE`, `TIE` | Outcome of double-blind trial. |

### Category 7: LEARNING (Reinforcement & Memory)
| Field Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `memory_cluster_id` | String | Non-empty | Latent space cluster ID in learning memory. |
| `reinforcement_weight` | Float | 0.0 to 1.0 | Reward weight applied to system feedback loop. |
| `pattern_tags` | Array[String] | Array of keywords | Identified successful production tropes. |

### Category 8: EVOLUZIONE (Lineage & Mutation)
| Field Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `parent_uuid` | String (UUID v4) | Nullable | UUID of previous iteration track (if derivative). |
| `generation_index` | Integer | ≥ 0 | Evolutionary iteration depth (0 = original seed). |
| `mutation_type` | String | Enum: `NONE`, `REPROMPT`, `MIX_ADJUST`, `MASTERING` | Type of modification from parent. |

### Category 9: DATASET (Corpus Classification)
| Field Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `quality_tier` | String | Enum: `GOLD`, `SILVER`, `BRONZE`, `DISCARDED` | Quality tier assignment (`GOLD` if score ≥ 95). |
| `is_lora_eligible` | Boolean | Default `False` | True if eligible for LoRA fine-tuning corpus. |
| `export_timestamp` | String (ISO 8601 UTC) | Nullable | Timestamp of inclusion in fine-tuning export. |

### Category 10: LORA (Fine-Tuning Parameters)
| Field Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `lora_target_name` | String | Non-empty | Name of LoRA adapter (e.g. `Deep House LoRA V1`). |
| `lora_rank` | Integer | Power of 2 | LoRA network dimension rank. |
| `lora_alpha` | Float | > 0 | LoRA scaling alpha factor. |
| `training_loss` | Float | ≥ 0.0 | Loss value at epoch completion. |

### Category 11: VERSIONING (Immutability & SemVer)
| Field Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `semver` | String | Pattern `^\d+\.\d+\.\d+$` | Semantic version string (e.g. `1.0.0`). |
| `commit_hash` | String | SHA256 hex | Cryptographic hash of entity state. |
| `supersedes_uuid` | String (UUID v4) | Nullable | UUID of record replaced by this new immutable version. |

### Category 12: CHECKSUM (Cryptographic Verification)
| Field Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `sha256_bundle` | String | 64-char hex | Combined SHA256 hash of all physical bundle files. |
| `sha256_audio` | String | 64-char hex | SHA256 hash of `audio.wav`. |
| `sha256_metadata` | String | 64-char hex | SHA256 hash of `metadata.json`. |

### Category 13: FILESYSTEM (Physical File Binding)
| Field Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `bundle_path` | String | Absolute path | Path to directory (e.g. `/dataset/House/Deep_House/<uuid>/`). |
| `has_audio` | Boolean | True required | Verification flag for physical `audio.wav`. |
| `has_spectrogram` | Boolean | True required | Verification flag for `spectrogram.png`. |
| `has_waveform` | Boolean | True required | Verification flag for `waveform.png`. |
| `bundle_files_count` | Integer | Must equal 8 for GOLD | Count of verified physical files in bundle folder. |

---

## 📐 3. JSON Schema Specification (Type Contract)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MusicDNA",
  "type": "object",
  "required": [
    "uuid",
    "title",
    "created_at",
    "genre",
    "subgenre",
    "quality_tier",
    "sha256_bundle",
    "sha256_audio",
    "bundle_path"
  ],
  "properties": {
    "uuid": { "type": "string", "format": "uuid" },
    "title": { "type": "string", "maxLength": 128 },
    "slug": { "type": "string" },
    "created_at": { "type": "string", "format": "date-time" },
    "genre": { "type": "string" },
    "subgenre": { "type": "string" },
    "bpm": { "type": "number", "minimum": 40.0, "maximum": 240.0 },
    "quality_tier": { "type": "string", "enum": ["GOLD", "SILVER", "BRONZE", "DISCARDED"] },
    "sha256_bundle": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
    "sha256_audio": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
    "bundle_path": { "type": "string" }
  },
  "additionalProperties": false
}
```
