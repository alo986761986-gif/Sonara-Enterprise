# SONARA ENTERPRISE V13 — MASTER ARCHITECTURE

## 1. Purpose

This document is the official architectural reference for Sonara Enterprise V13.

Its goals are to preserve the stability of the working music-generation core, define clear module boundaries, prevent uncontrolled file movement and duplicate responsibilities, establish development/testing/Git/release rules, and guide the migration from the current V12 structure to a maintainable V13 platform.

## 2. Current System Overview

Sonara currently consists of:

- React/Vite frontend in `src/`
- Node/Express backend in `server.ts` and `backend/src/`
- ACE-Step integration in `backend/src/engine/`
- Python audio and AI tooling in `engine/`
- Job orchestration in `backend/src/jobs/` and `backend/src/workers/`
- Music intelligence services in `backend/src/services/`
- Datasets in `dataset/`
- LoRA assets in `lora/`
- Model artifacts in `model_registry/`
- Runtime audio files in `storage/` and `output/`
- Documentation and reports in `docs/`

## 3. Architectural Principles

### Preserve the working core

The generation path must remain stable:

`Frontend -> Backend API -> Job Queue -> ACE-Step Engine -> RunPod -> WAV -> Local Storage -> Player`

No refactor may alter this flow without:

1. a dedicated branch;
2. a reproducible test;
3. a successful build;
4. a generation test;
5. a Git commit.

### One responsibility per module

- Routes accept and validate HTTP requests.
- Services contain business logic.
- Workers execute background jobs.
- Engines communicate with AI/audio runtimes.
- Storage modules save and retrieve files.
- Frontend components render UI only.

### No hidden environment values

All configurable values must come from environment variables or a central configuration module.

Examples:

- `ACE_STEP_API_URL`
- `NODE_ENV`
- database URL
- Firebase credentials
- storage paths
- timeout values

Secrets must never be committed to Git.

## 4. Target V13 Structure

```text
sonara-enterprise/
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── services/
│   ├── state/
│   ├── types/
│   └── App.tsx
├── backend/
│   └── src/
│       ├── api/
│       ├── auth/
│       ├── config/
│       ├── engine/
│       ├── jobs/
│       ├── middleware/
│       ├── routes/
│       ├── services/
│       ├── storage/
│       ├── types/
│       └── workers/
├── engine/
│   ├── core/
│   ├── dsp/
│   ├── recovery/
│   ├── training/
│   ├── monitoring/
│   └── research/
├── dataset/
├── lora/
├── model_registry/
├── storage/
├── tests/
├── scripts/
├── docs/
│   ├── architecture/
│   ├── reports/
│   ├── research/
│   └── releases/
├── server.ts
├── package.json
└── README.md
```

## 5. Core Backend Modules

### Engine Layer

Location: `backend/src/engine/`

Responsibilities:

- communicate with ACE-Step;
- run engine health checks;
- download generated audio;
- return typed generation results;
- expose no UI logic;
- avoid direct persistence except temporary transport handling.

Primary files:

- `AceStepEngine.ts`
- `IAudioGenerationEngine.ts`
- `PythonEnvironmentManager.ts`

### Job Layer

Locations:

- `backend/src/jobs/`
- `backend/src/workers/`

Responsibilities:

- create jobs;
- track progress;
- retry failures;
- expose job state;
- execute the generation pipeline;
- never render frontend responses directly.

Primary files:

- `JobManager.ts`
- `JobQueueWorker.ts`
- `RedisQueueManager.ts`

### Music Intelligence Layer

Location: `backend/src/services/`

Responsibilities:

- prompt enhancement;
- genre lock;
- music DNA recall;
- pattern generation;
- arrangement planning;
- quality evaluation;
- continuous learning.

Important services:

- `AceStepPromptEngine.ts`
- `MusicDnaLibraryService.ts`
- `PatternGeneratorService.ts`
- `ContinuousLearningService.ts`
- `SonaraDirectorService.ts`
- `SongPlannerService.ts`

### Audio Processing Layer

Responsibilities:

- validate audio buffers;
- mix and master;
- EQ processing;
- format conversion;
- loudness and peak control.

Important services:

- `MixingMasteringEngineService.ts`
- `ParametricEqService.ts`
- `AudioAssemblerService.ts`

## 6. Frontend Architecture

Frontend responsibilities:

- collect user input;
- call generation endpoints;
- poll job status;
- display progress;
- play and download audio;
- show errors clearly;
- maintain local UI state.

The frontend must not:

- access RunPod directly;
- know checkpoint paths;
- create files;
- perform engine diagnostics;
- decide backend retry behavior.

## 7. RunPod Role

RunPod is an execution environment, not the primary development environment.

Responsibilities:

- host ACE-Step;
- expose `/health`;
- expose `/generate`;
- expose generated audio;
- use GPU resources only during tests or production generation.

The source of truth is GitHub.

## 8. Data and Storage

Runtime-generated audio:

```text
storage/audio/
```

Temporary files:

```text
output/
```

Datasets, LoRA checkpoints, model artifacts, runtime audio, logs, and generated reports must be reviewed before being committed to Git.

## 9. Git Workflow

Stable branch:

```text
main
```

Integration branch:

```text
develop
```

Temporary branches:

```text
feature/<name>
fix/<name>
refactor/<name>
chore/<name>
docs/<name>
```

Required workflow:

1. create branch;
2. make one logical change;
3. build;
4. test;
5. inspect `git status`;
6. commit clearly;
7. push;
8. merge only after verification.

## 10. Testing Policy

Minimum checks before every merge:

```powershell
npm run build
npm run lint
```

For generation-related changes:

1. RunPod health is healthy.
2. Sonara backend starts.
3. A 15-second track completes.
4. Job reaches `COMPLETED`.
5. WAV exists in `storage/audio`.
6. Player loads the WAV.
7. No duplicate job is created.
8. No white-screen crash occurs.

## 11. Cleanup Rules

The cleanup sprint must not delete files immediately.

Each candidate file must be classified as:

- active;
- legacy;
- generated;
- report;
- binary artifact;
- duplicate;
- unknown.

Unknown files must be moved to `archive/` before deletion.

No source file should be moved until all imports and runtime references are known.

## 12. Immediate Sprint Plan

### Sprint 1 — Enterprise Cleanup

- organize reports;
- organize inventory files;
- classify root files;
- classify generated artifacts;
- verify `.gitignore`;
- create architecture documentation;
- avoid moving runtime code.

### Sprint 2 — Core Boundaries

- centralize configuration;
- isolate RunPod gateway;
- document generation API;
- type generation/job responses;
- reduce duplicated engine logic.

### Sprint 3 — Product Foundation

- generation history;
- track library;
- reliable player;
- structured error reporting;
- user project model.

## 13. Definition of Stable

A Sonara version is stable only when:

- the project builds;
- the server starts in production mode;
- RunPod health is reachable;
- generation succeeds;
- audio is playable;
- Git working tree is clean;
- the version is pushed to GitHub;
- rollback is possible.

## 14. Non-Negotiable Rules

1. Do not modify `main` directly.
2. Do not commit secrets.
3. Do not mix unrelated changes in one commit.
4. Do not move source files without checking imports.
5. Do not replace a working core with an untested rewrite.
6. Do not use multiple AI assistants to edit the same file simultaneously.
7. Do not delete unknown files without archiving and verification.
8. Every completed task ends with a test and a commit.

## 15. Current Priority

The current priority is not adding new features.

The current priority is:

> Preserve the working generation engine while converting Sonara into a clean, documented, testable, and scalable platform.
