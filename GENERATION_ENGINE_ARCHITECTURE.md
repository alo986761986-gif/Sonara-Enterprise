# SONARA V11 Generation Engine Architecture

The **SONARA Generation Engine** (`engine/generation/`) provides a clean, decoupled adapter-based runtime layer that decouples application workflows from specific audio generation models (e.g., MusicGen, Stable Audio Open, AudioLDM2, and custom Sonara models).

## Core Architecture
- **Abstraction Layer**: Unified model adapters (`base_adapter.py`) ensuring plug-and-play interchangeability.
- **Job Orchestration**: Asynchronous state machine handling generation lifecycles (`QUEUED` to `COMPLETED`/`FAILED`).
- **GPU Resource Management**: Intelligent VRAM allocation, model caching, warming, and OOM recovery.
- **Model Registry**: Centralized catalog tracking capabilities, constraints, and versioning.
