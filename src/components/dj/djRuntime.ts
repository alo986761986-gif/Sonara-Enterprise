export type DJDeckId = 'A' | 'B';

export type DJControlAction =
  | { type: 'deck.play'; deck: DJDeckId; pressed?: boolean }
  | { type: 'deck.cue'; deck: DJDeckId; pressed: boolean }
  | { type: 'deck.sync'; deck: DJDeckId; pressed?: boolean }
  | { type: 'deck.pitch'; deck: DJDeckId; value: number }
  | { type: 'deck.volume'; deck: DJDeckId; value: number }
  | { type: 'deck.gain'; deck: DJDeckId; value: number }
  | { type: 'deck.filter'; deck: DJDeckId; value: number }
  | { type: 'deck.eqLow'; deck: DJDeckId; value: number }
  | { type: 'deck.eqMid'; deck: DJDeckId; value: number }
  | { type: 'deck.eqHigh'; deck: DJDeckId; value: number }
  | { type: 'deck.hotcue'; deck: DJDeckId; index: number; pressed?: boolean }
  | { type: 'deck.loop'; deck: DJDeckId; beats: number; pressed?: boolean }
  | { type: 'mixer.crossfader'; value: number }
  | { type: 'mixer.master'; value: number }
  | { type: 'mixer.filter'; value: number };

export const SONARA_DJ_CONTROL_EVENT = 'sonara:dj-control';
export const SONARA_DJ_FEEDBACK_EVENT = 'sonara:dj-feedback';

export type DJFeedback = {
  control: string;
  deck?: DJDeckId;
  value: number | boolean;
};

export function emitDJControl(action: DJControlAction) {
  window.dispatchEvent(new CustomEvent<DJControlAction>(SONARA_DJ_CONTROL_EVENT, { detail: action }));
}

export function onDJControl(listener: (action: DJControlAction) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<DJControlAction>).detail);
  window.addEventListener(SONARA_DJ_CONTROL_EVENT, handler);
  return () => window.removeEventListener(SONARA_DJ_CONTROL_EVENT, handler);
}

export function emitDJFeedback(feedback: DJFeedback) {
  window.dispatchEvent(new CustomEvent<DJFeedback>(SONARA_DJ_FEEDBACK_EVENT, { detail: feedback }));
}

export function onDJFeedback(listener: (feedback: DJFeedback) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<DJFeedback>).detail);
  window.addEventListener(SONARA_DJ_FEEDBACK_EVENT, handler);
  return () => window.removeEventListener(SONARA_DJ_FEEDBACK_EVENT, handler);
}

export function normalizedMidiValue(value: number) {
  return Math.max(0, Math.min(1, value / 127));
}

export function bipolarMidiValue(value: number) {
  return normalizedMidiValue(value) * 2 - 1;
}
