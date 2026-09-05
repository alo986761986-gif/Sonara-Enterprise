#!/usr/bin/env python3
from pathlib import Path

ROUTER = Path('cloudflare/sonara-molab-xl-router.mjs')
MARKER = 'sonara-fast-80-rescue-v1'


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
        "const QUALITY_47_RESCUE_PROFILE = 'sonara-quality-47-rescue-v1';\nconst MODEL = 'acestep-v15-xl-turbo';",
        "const QUALITY_47_RESCUE_PROFILE = 'sonara-quality-47-rescue-v1';\nconst FAST_80_RESCUE_PROFILE = 'sonara-fast-80-rescue-v1';\nconst MODEL = 'acestep-v15-xl-turbo';",
        'FAST_RESCUE_MARKER'
    )

    text = replace_once(
        text,
        "const HIGH_PROGRESS_RESCUE_THRESHOLD = 93;\nconst HIGH_PROGRESS_MAX_POLLS = 6;",
        "const HIGH_PROGRESS_RESCUE_THRESHOLD = 93;\nconst HIGH_PROGRESS_MAX_POLLS = 6;\nconst FAST_ARTIFACT_RESCUE_THRESHOLD = 70;\nconst FAST_STALL_THRESHOLD = 75;\nconst FAST_STALL_MAX_POLLS = 4;\nconst FAST_RECOVERY_MAX_ATTEMPTS = 1;",
        'FAST_RESCUE_THRESHOLDS'
    )

    text = replace_once(
        text,
        "      highProgressPolls: 0,\n      lastObservedProgress: 0\n    });",
        "      highProgressPolls: 0,\n      lastObservedProgress: 0,\n      fastStallPolls: 0,\n      fastLastObservedProgress: 0,\n      fastRecoveryAttempts: 0\n    });",
        'FAST_STATE_FIELDS'
    )

    text = replace_once(
        text,
        "    quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,\n    harshnessGuard: true,",
        "    quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,\n    fast80RescueProfile: FAST_80_RESCUE_PROFILE,\n    harshnessGuard: true,",
        'FAST_METADATA_MARKER'
    )

    text = replace_once(
        text,
        "    const completedByArtifacts = status === 0 && highProgress && refs.length >= expectedCount;",
        """    const isFast = String(payload?.sonara_generation_profile || 'quality').trim().toLowerCase() === 'fast';
    const fastBand = isFast && status === 0 && info.progress >= FAST_STALL_THRESHOLD;
    if (fastBand) {
      const previousFast = Number(state.fastLastObservedProgress || 0);
      state.fastStallPolls = info.progress <= previousFast + 0.1
        ? Number(state.fastStallPolls || 0) + 1
        : 1;
      state.fastLastObservedProgress = info.progress;
    } else {
      state.fastStallPolls = 0;
      state.fastLastObservedProgress = info.progress;
    }

    const completedFastByArtifacts = isFast && status === 0 && info.progress >= FAST_ARTIFACT_RESCUE_THRESHOLD && refs.length >= expectedCount;
    const completedByArtifacts = (status === 0 && highProgress && refs.length >= expectedCount) || completedFastByArtifacts;""",
        'FAST_ARTIFACT_COMPLETION'
    )

    rescue_anchor = "    if (status === 0 && highProgress && Number(state.highProgressPolls || 0) >= HIGH_PROGRESS_MAX_POLLS) {"
    rescue_block = """    if (fastBand && Number(state.fastStallPolls || 0) >= FAST_STALL_MAX_POLLS) {
      const recoveryAttempts = Number(state.fastRecoveryAttempts || 0);
      if (recoveryAttempts < FAST_RECOVERY_MAX_ATTEMPTS) {
        const retryTaskId = await submit(state.baseUrl, env, payload);
        state.taskId = retryTaskId;
        state.fastRecoveryAttempts = recoveryAttempts + 1;
        state.fastStallPolls = 0;
        state.fastLastObservedProgress = 0;
        state.updatedAt = Date.now();
        await saveState(env, jobId, state);
        return json(request, {
          jobId,
          status: 'PROCESSING',
          progress: 86,
          retryable: true,
          audioUrl: null,
          audioUrls: [],
          candidates: [],
          metadata: {
            ...meta,
            fast80RescueProfile: FAST_80_RESCUE_PROFILE,
            fastRecoveryAttempts: state.fastRecoveryAttempts,
            observedProgress: info.progress,
            currentStage: 'Fast anti-stallo: render riavviato automaticamente'
          }
        }, 202);
      }

      await saveState(env, jobId, state);
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 100,
        retryable: true,
        error: 'Fast e rimasto fermo nella fase finale anche dopo il recupero automatico. Il job e stato chiuso invece di restare bloccato all 80%.',
        metadata: {
          ...meta,
          fast80RescueProfile: FAST_80_RESCUE_PROFILE,
          fastStallPolls: state.fastStallPolls,
          fastRecoveryAttempts: state.fastRecoveryAttempts,
          observedProgress: info.progress,
          currentStage: 'Fast anti-stallo: retry esaurito'
        }
      }, 504);
    }

""" + rescue_anchor
    text = replace_once(text, rescue_anchor, rescue_block, 'FAST_AUTO_RECOVERY')

    text = replace_once(
        text,
        "        quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,\n        highProgressPolls: Number(state.highProgressPolls || 0),",
        "        quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,\n        fast80RescueProfile: FAST_80_RESCUE_PROFILE,\n        highProgressPolls: Number(state.highProgressPolls || 0),\n        fastStallPolls: Number(state.fastStallPolls || 0),\n        fastRecoveryAttempts: Number(state.fastRecoveryAttempts || 0),",
        'FAST_PROCESSING_METADATA'
    )

    text = replace_once(
        text,
        "    richArrangementProfile: RICH_ARRANGEMENT_PROFILE,\n    fullInstrumentation: true,",
        "    richArrangementProfile: RICH_ARRANGEMENT_PROFILE,\n    fast80RescueProfile: FAST_80_RESCUE_PROFILE,\n    fullInstrumentation: true,",
        'FAST_READINESS_MARKER'
    )

    text = replace_once(
        text,
        "  headers.set('x-sonara-natural-tone', NATURAL_TONE_PROFILE);\n  return new Response(response.body,",
        "  headers.set('x-sonara-natural-tone', NATURAL_TONE_PROFILE);\n  headers.set('x-sonara-fast-80-rescue', FAST_80_RESCUE_PROFILE);\n  return new Response(response.body,",
        'FAST_RESPONSE_HEADER'
    )

    ROUTER.write_text(text, encoding='utf-8')
    if MARKER not in text:
        raise SystemExit('FAST_80_RESCUE_MARKER_MISSING')
    print('SONARA_FAST_80_RESCUE=PATCHED')
    print('FAST_ARTIFACT_RESCUE=progress>=70 and audio refs => COMPLETED')
    print('FAST_AUTO_RECOVERY=4 stagnant polls >=75 => one automatic resubmit')
    print('FAST_INFERENCE_STEPS=UNCHANGED_1')


if __name__ == '__main__':
    main()
