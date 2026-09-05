#!/usr/bin/env python3
from pathlib import Path

ROUTER = Path('cloudflare/sonara-molab-xl-router.mjs')
MARKER = 'sonara-quality-47-rescue-v1'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY')
        return text
    if old not in text:
        raise SystemExit(f'{label}=PATTERN_MISSING')
    print(f'{label}=PATCHED')
    return text.replace(old, new, 1)


def main() -> None:
    text = ROUTER.read_text(encoding='utf-8')

    text = replace_once(
        text,
        "const NATURAL_TONE_PROFILE = 'sonara-natural-tone-v14';\nconst MODEL = 'acestep-v15-xl-turbo';",
        "const NATURAL_TONE_PROFILE = 'sonara-natural-tone-v14';\nconst QUALITY_47_RESCUE_PROFILE = 'sonara-quality-47-rescue-v1';\nconst MODEL = 'acestep-v15-xl-turbo';",
        'RESCUE_MARKER'
    )

    text = replace_once(
        text,
        "const STALL_TIMEOUT = 12 * 60 * 1000;",
        "const STALL_TIMEOUT = 12 * 60 * 1000;\nconst HIGH_PROGRESS_RESCUE_THRESHOLD = 93;\nconst HIGH_PROGRESS_MAX_POLLS = 6;",
        'RESCUE_THRESHOLDS'
    )

    text = replace_once(
        text,
        "      payload\n    });",
        "      payload,\n      highProgressPolls: 0,\n      lastObservedProgress: 0\n    });",
        'STATE_RESCUE_FIELDS'
    )

    anchor = "    if (status === 1) {\n      const refs = refsFrom(task, state.baseUrl).slice(0, expectedCount);"
    replacement = """    const refs = refsFrom(task, state.baseUrl).slice(0, expectedCount);
    const highProgress = info.progress >= HIGH_PROGRESS_RESCUE_THRESHOLD;
    if (highProgress) {
      const previous = Number(state.lastObservedProgress || 0);
      state.highProgressPolls = info.progress <= previous + 0.1
        ? Number(state.highProgressPolls || 0) + 1
        : 1;
      state.lastObservedProgress = info.progress;
    } else {
      state.highProgressPolls = 0;
      state.lastObservedProgress = info.progress;
    }

    const completedByArtifacts = status === 0 && highProgress && refs.length >= expectedCount;
    if (status === 1 || completedByArtifacts) {
      if (refs.length < expectedCount) {"""
    text = replace_once(text, anchor, replacement, 'ARTIFACT_COMPLETION_RESCUE')

    text = replace_once(
        text,
        "          ...meta,\n          candidateCount: candidates.length,",
        "          ...meta,\n          quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,\n          completionRescuedFromArtifacts: completedByArtifacts,\n          candidateCount: candidates.length,",
        'COMPLETION_METADATA'
    )

    text = replace_once(
        text,
        "    if (Date.now() - Number(state.createdAt || Date.now()) > STALL_TIMEOUT && info.progress <= 0) {",
        "    if (status === 0 && highProgress && Number(state.highProgressPolls || 0) >= HIGH_PROGRESS_MAX_POLLS) {\n      await saveState(env, jobId, state);\n      return json(request, {\n        jobId,\n        status: 'FAILED',\n        progress: 100,\n        retryable: true,\n        error: 'MoLab e rimasto fermo nella fase finale senza pubblicare i file audio. Il job e stato chiuso automaticamente invece di restare al 47.4%.',\n        metadata: {\n          ...meta,\n          quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,\n          highProgressPolls: state.highProgressPolls,\n          observedProgress: info.progress,\n          currentStage: 'Anti-stallo finale Quality attivato'\n        }\n      }, 504);\n    }\n\n    if (Date.now() - Number(state.createdAt || Date.now()) > STALL_TIMEOUT && info.progress <= 0) {",
        'HIGH_PROGRESS_FAIL_FAST'
    )

    text = replace_once(
        text,
        "    state.updatedAt = Date.now();\n    await saveState(env, jobId, state);",
        "    state.updatedAt = Date.now();\n    await saveState(env, jobId, state);",
        'STATE_SAVE_PRESERVED'
    )

    text = replace_once(
        text,
        "        ...meta,\n        currentStage: info.stage ||",
        "        ...meta,\n        quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,\n        highProgressPolls: Number(state.highProgressPolls || 0),\n        currentStage: info.stage ||",
        'PROCESSING_RESCUE_METADATA'
    )

    text = replace_once(
        text,
        "    naturalToneProfile: NATURAL_TONE_PROFILE,\n    harshnessGuard: true,",
        "    naturalToneProfile: NATURAL_TONE_PROFILE,\n    quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,\n    harshnessGuard: true,",
        'READINESS_RESCUE_MARKER'
    )

    ROUTER.write_text(text, encoding='utf-8')
    if MARKER not in text:
        raise SystemExit('QUALITY_47_RESCUE_MARKER_MISSING')
    print('SONARA_QUALITY_47_RESCUE=PATCHED')
    print('HIGH_PROGRESS_RESCUE=artifacts>=expected => COMPLETED')
    print('HIGH_PROGRESS_FAIL_FAST=6 stagnant polls')


if __name__ == '__main__':
    main()
