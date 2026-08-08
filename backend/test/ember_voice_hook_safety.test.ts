import assert from 'node:assert/strict';
import React from 'react';

interface FakeAudioInstance {
  onended: (() => void) | null;
  onerror: (() => void) | null;
  currentTime: number;
  src: string;
  pauseCount: number;
  play(): Promise<void>;
  pause(): void;
}

class FakeAudio implements FakeAudioInstance {
  public static instances: FakeAudio[] = [];
  public onended: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public currentTime = 0;
  public pauseCount = 0;

  public constructor(public src: string, private readonly shouldReject: boolean) {
    FakeAudio.instances.push(this);
  }

  public async play(): Promise<void> {
    if (this.shouldReject) throw new Error('Playback blocked');
  }

  public pause(): void {
    this.pauseCount += 1;
  }
}

function enabledConfig() {
  return {
    enabled: true,
    providerConfigured: true,
    capabilities: { speech: true, realtime: false }
  };
}

async function loadHook(shouldRejectPlayback: boolean) {
  const originalUseState = React.useState;
  const originalUseRef = React.useRef;
  const originalUseEffect = React.useEffect;
  const originalFetch = globalThis.fetch;
  const originalAudio = globalThis.Audio;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const stateValues: unknown[] = [enabledConfig(), false, false, null, false, false];
  let stateIndex = 0;
  const refs: Array<{ current: unknown }> = [];
  let refIndex = 0;
  let fetchCalls = 0;
  let revokeCalls = 0;
  FakeAudio.instances = [];

  Object.assign(React, {
    useState: <T,>(initial: T) => {
      const index = stateIndex++;
      const value = stateValues[index] === undefined ? initial : stateValues[index] as T;
      return [value, (next: T) => { stateValues[index] = next; }] as [T, (next: T) => void];
    },
    useRef: <T,>(initial: T) => {
      const index = refIndex++;
      if (!refs[index]) refs[index] = { current: initial };
      return refs[index] as React.RefObject<T>;
    },
    useEffect: () => undefined
  });
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return { ok: true, blob: async () => new Blob(['voice']) } as Response;
  }) as typeof fetch;
  globalThis.Audio = class extends FakeAudio {
    public constructor(src: string) {
      super(src, shouldRejectPlayback);
    }
  } as typeof Audio;
  URL.createObjectURL = () => 'blob:ember-test';
  URL.revokeObjectURL = () => { revokeCalls += 1; };

  const { useEmberVoice } = await import('../../src/hooks/useEmberVoice');
  const voice = useEmberVoice([]);
  return {
    voice,
    getFetchCalls: () => fetchCalls,
    getRevokeCalls: () => revokeCalls,
    getLatestAudio: () => FakeAudio.instances.at(-1),
    restore: () => {
      Object.assign(React, { useState: originalUseState, useRef: originalUseRef, useEffect: originalUseEffect });
      globalThis.fetch = originalFetch;
      globalThis.Audio = originalAudio;
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
    }
  };
}

async function run(): Promise<void> {
  const duplicateCheck = await loadHook(false);
  try {
    await Promise.all([duplicateCheck.voice.speak('One'), duplicateCheck.voice.speak('One')]);
    assert.equal(duplicateCheck.getFetchCalls(), 1);
    await duplicateCheck.voice.replay();
    assert.equal(duplicateCheck.getFetchCalls(), 1);
    duplicateCheck.getLatestAudio()?.onerror?.();
    assert.equal(duplicateCheck.getRevokeCalls(), 2);
  } finally {
    duplicateCheck.restore();
  }

  const cleanupCheck = await loadHook(true);
  try {
    await cleanupCheck.voice.speak('Playback failure');
    assert.equal(cleanupCheck.getFetchCalls(), 1);
    assert.equal(cleanupCheck.getRevokeCalls(), 1);
  } finally {
    cleanupCheck.restore();
  }

  console.log('Voice hook safety checks passed: duplicate guard, playback cleanup, zero-cost replay.');
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});