/**
 * Plan a continuous DJ arrangement. Unlike the legacy mixer, this NEVER starts
 * every song at t=0. Only neighbouring clips overlap, for a short transition.
 * No source separation, pitch shifting or synthetic music is claimed here.
 */
export type DjClip = {
  id: string;
  duration: number;
  cue: number;
  take: number;
  bpm?: number | null;
  volume: number;
  muted: boolean;
};

export type DjSegment = {
  id: string;
  sourceStart: number;
  sourceDuration: number;
  timelineStart: number;
  timelineEnd: number;
  fadeIn: number;
  fadeOut: number;
};

export type DjPlan = { segments: DjSegment[]; totalSeconds: number; transitions: number[] };

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function planDjArrangement(input: DjClip[], requestedFade: number, maxSeconds = 600): DjPlan {
  const tracks = input.filter(track => !track.muted && track.volume > 0);
  if (!tracks.length) throw new Error('Attiva almeno una traccia audio.');

  const prepared = tracks.map(track => {
    const duration = finite(track.duration, 0);
    if (duration < 4) throw new Error('Il file ' + track.id + ' dura meno di 4 secondi.');
    const cue = clamp(finite(track.cue, 0), 0, duration - 4);
    const available = duration - cue;
    let take = clamp(finite(track.take, Math.min(64, available)), 4, Math.min(180, available));

    // Keep musical phrases near 4-beat boundaries where tempo has been estimated.
    // This only places edits on approximate bars: it does not beat-match different songs.
    const bpm = finite(track.bpm || 0, 0);
    if (bpm >= 95 && bpm <= 160) {
      const bar = 240 / bpm;
      const snapped = Math.round(take / bar) * bar;
      if (snapped >= 4 && snapped <= available && Math.abs(snapped - take) <= bar / 2) take = snapped;
    }
    return { ...track, cue, take };
  });

  const fadeTarget = clamp(finite(requestedFade, 8), 2, 24);
  const transitions = prepared.slice(0, -1).map((track, index) => {
    const next = prepared[index + 1];
    let fade = Math.min(fadeTarget, track.take * 0.3, next.take * 0.3);
    const a = finite(track.bpm || 0, 0);
    const b = finite(next.bpm || 0, 0);
    if (a >= 95 && a <= 160 && b >= 95 && b <= 160 && Math.abs(a - b) <= 4) {
      const bar = 240 / ((a + b) / 2);
      const snapped = Math.round(fade / bar) * bar;
      if (snapped >= 1 && snapped <= fadeTarget && snapped <= track.take * 0.32 && snapped <= next.take * 0.32) fade = snapped;
    }
    return Math.max(0.05, fade);
  });

  const segments: DjSegment[] = [];
  let cursor = 0;
  prepared.forEach((track, index) => {
    const fadeIn = index === 0 ? 0 : transitions[index - 1];
    const fadeOut = index === prepared.length - 1 ? 0 : transitions[index];
    const timelineStart = index === 0 ? 0 : cursor - fadeIn;
    const timelineEnd = timelineStart + track.take;
    segments.push({
      id: track.id,
      sourceStart: track.cue,
      sourceDuration: track.take,
      timelineStart,
      timelineEnd,
      fadeIn,
      fadeOut
    });
    cursor = timelineEnd;
  });

  if (cursor > maxSeconds + 0.0001) {
    throw new Error('Il DJ Mix dura ' + Math.round(cursor) + ' secondi (massimo 600). Riduci i segmenti.');
  }
  if (cursor < 4) throw new Error('Il DJ Mix deve durare almeno 4 secondi.');
  return { segments, transitions, totalSeconds: cursor };
}
