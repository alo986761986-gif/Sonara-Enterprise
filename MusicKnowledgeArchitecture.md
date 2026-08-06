# 🧬 Sonara Labs - Music Knowledge Engine Architecture (Sonara V7)

**Document Status**: Architectural Specification (Draft / V7 Baseline)  
**Role**: Chief Software Architect  
**Regime**: **SOFTWARE FREEZE** (Pure Architectural Specification)  
**Date**: 2026-08-01  

---

## 📐 1. Vision & Core Philosophy

### 1.1 From Generative Engine to Music Knowledge System
Sonara V1–V6 focused primarily on audio signal generation, prompt synthesis, and iterative fine-tuning. **Sonara V7** marks a fundamental paradigm shift: transitioning from a generative AI pipeline into a **deterministic, self-describing, immutable Music Knowledge Engine**.

In Sonara V7, a track is not merely an audio waveform (`.wav`) accompanied by transient prompt text. A track is a **self-contained scientific artifact** governed by an immutable **Music DNA** schema, tracked within a single source of truth (**Corpus Registry**), and mapped through an end-to-end historical lineage (**Track Genome**).

### 1.2 Core Architectural Principles
1. **Absolute Immutability**: Every produced track receives a cryptographic UUID v4 upon creation. Once written, a track record or bundle is never overwritten; all changes produce a new version with lineage pointers.
2. **Zero-Trust Physical Verification**: No record exists in the Knowledge Engine without verifiable physical presence on disk, validated by SHA256 checksums.
3. **Decoupled Architecture**: The Knowledge Engine sits completely above execution modules (Director AI, Prompt Engine, Audio Analyzer, Music Critic, LoRA Trainer). Modules interact with the Knowledge Engine exclusively through deterministic schema contracts.
4. **Single Source of Truth**: The **Corpus Registry** maintains the authoritative index of all tracks, bundles, versions, and statistical benchmarks.

---

## 🏛️ 2. High-Level Architectural Diagram

```
+-----------------------------------------------------------------------------------+
|                            SONARA V7 KNOWLEDGE ENGINE                             |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                             CORPUS REGISTRY                                 |  |
|  |           (Single Source of Truth / Primary Immutable Index)                |  |
|  +-----------------------------------------------------------------------------+  |
|                                       |                                           |
|       +-------------------------------+-------------------------------+           |
|       |                               |                               |           |
|  +----+-------------------+  +--------+----------+  +-----------------+----+      |
|  |     MUSIC DNA          |  |   TRACK GENOME    |  |  LIFECYCLE &    |      |
|  | (13-Category Entity)   |  | (Historical Graph)|  | INTEGRITY ENGINE|      |
|  +------------------------+  +-------------------+  +----------------------+      |
|                                                                                   |
+-----------------------------------------------------------------------------------+
                                        |
                            [Zero-Trust Audit Layer]
                                        |
+-----------------------------------------------------------------------------------+
|                               PHYSICAL STORAGE                                    |
|   /dataset/<genre>/<subgenre>/<uuid_bundle>/                                      |
|   ├── audio.wav             ├── prompt.json           ├── analysis.json          |
|   ├── quality.json           ├── metadata.json         ├── critic.json            |
|   ├── spectrogram.png       └── waveform.png                                     |
+-----------------------------------------------------------------------------------+
```

---

## 🕋 3. Functional Layers of the Engine

### Layer 1: Entity & Schema Layer (`MusicDNA`)
Defines the strict 13-category canonical schema for every audio entity in Sonara. Enforces strong typing, range limits, unit standards, and mandatory metadata fields.

### Layer 2: Persistence & Index Layer (`Corpus Registry`)
Provides fast, O(1) primary key lookups by UUID, title slug, genre, and version hash. Maintains index consistency between physical bundle locations and logical database representations.

### Layer 3: Lineage & Evolution Layer (`Track Genome`)
Maintains a Directed Acyclic Graph (DAG) recording parent-child evolution across prompts, LoRA weights, parameter mutations, and audio re-renders.

### Layer 4: State Machine & Validation Layer (`Lifecycle Engine`)
Controls track state transitions (`NEW` → `ANALYZED` → `CRITIC` → `BENCHMARKED` → `GOLD` → `LORA DATASET` → `TRAINED` → `ARCHIVED`). Enforces guard conditions and blocks invalid state jumps.

### Layer 5: Scientific Integrity & Audit Layer (`Integrity Rules`)
Runs background verification of physical file presence, bundle completeness (8/8 mandatory artifacts), SHA256 checksum matching, and non-overlapping benchmark confidence intervals.

---

## 🔒 4. Compliance with Software Freeze
In strict adherence to the **SOFTWARE FREEZE** mandate:
- No existing codebase files (`engine/director_ai.py`, `engine/prompt_engine.py`, `engine/music_critic.py`, etc.) are altered or refactored.
- No new REST/GraphQL APIs, UI dashboards, or runtime scripts are instantiated.
- This specification serves as the blueprint for Sonara V7 data modeling and future system migration.
