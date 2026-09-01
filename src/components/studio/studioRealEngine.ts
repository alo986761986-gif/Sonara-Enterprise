export type StudioMidiNote = {
  note: number;
  velocity: number;
  channel: number;
  start: number;
  duration: number;
};

export type ParsedStudioMidi = {
  notes: StudioMidiNote[];
  duration: number;
  ppq: number;
};

type RawMidiEvent = {
  tick: number;
  kind: 'on' | 'off';
  note: number;
  velocity: number;
  channel: number;
};

type TempoEvent = { tick: number; microsecondsPerQuarter: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function readAscii(view: DataView, offset: number, length: number) {
  let out = '';
  for (let index = 0; index < length; index += 1) out += String.fromCharCode(view.getUint8(offset + index));
  return out;
}

function readVlq(view: DataView, start: number, end: number) {
  let value = 0;
  let offset = start;
  let count = 0;
  while (offset < end && count < 4) {
    const byte = view.getUint8(offset++);
    value = (value << 7) | (byte & 0x7f);
    count += 1;
    if ((byte & 0x80) === 0) break;
  }
  return { value, offset };
}

function normalizeTempos(tempos: TempoEvent[]) {
  const byTick = new Map<number, number>();
  byTick.set(0, 500000);
  for (const tempo of tempos) byTick.set(Math.max(0, tempo.tick), Math.max(1000, tempo.microsecondsPerQuarter));
  return [...byTick.entries()]
    .map(([tick, microsecondsPerQuarter]) => ({ tick, microsecondsPerQuarter }))
    .sort((a, b) => a.tick - b.tick);
}

function createTickConverter(ppq: number, tempos: TempoEvent[]) {
  const ordered = normalizeTempos(tempos);
  const segments: Array<{ tick: number; seconds: number; microsecondsPerQuarter: number }> = [];
  let previousTick = 0;
  let previousSeconds = 0;
  let currentTempo = ordered[0]?.microsecondsPerQuarter || 500000;
  segments.push({ tick: 0, seconds: 0, microsecondsPerQuarter: currentTempo });

  for (const event of ordered.slice(1)) {
    previousSeconds += ((event.tick - previousTick) * currentTempo) / 1_000_000 / ppq;
    previousTick = event.tick;
    currentTempo = event.microsecondsPerQuarter;
    segments.push({ tick: event.tick, seconds: previousSeconds, microsecondsPerQuarter: currentTempo });
  }

  return (tick: number) => {
    const safeTick = Math.max(0, tick);
    let segment = segments[0];
    for (const candidate of segments) {
      if (candidate.tick > safeTick) break;
      segment = candidate;
    }
    return segment.seconds + ((safeTick - segment.tick) * segment.microsecondsPerQuarter) / 1_000_000 / ppq;
  };
}

export async function parseMidiBlob(blob: Blob): Promise<ParsedStudioMidi> {
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  if (view.byteLength < 14 || readAscii(view, 0, 4) !== 'MThd') throw new Error('File MIDI non valido: header MThd mancante.');
  const headerLength = view.getUint32(4, false);
  if (headerLength < 6 || view.byteLength < 8 + headerLength) throw new Error('File MIDI non valido: header incompleto.');
  const trackCount = view.getUint16(10, false);
  const division = view.getUint16(12, false);
  const ppq = (division & 0x8000) === 0 ? Math.max(24, division) : 480;
  let offset = 8 + headerLength;
  const events: RawMidiEvent[] = [];
  const tempos: TempoEvent[] = [];

  for (let trackIndex = 0; trackIndex < trackCount && offset + 8 <= view.byteLength; trackIndex += 1) {
    const chunkId = readAscii(view, offset, 4);
    const chunkLength = view.getUint32(offset + 4, false);
    const trackStart = offset + 8;
    const trackEnd = Math.min(view.byteLength, trackStart + chunkLength);
    offset = trackEnd;
    if (chunkId !== 'MTrk') continue;

    let cursor = trackStart;
    let absoluteTick = 0;
    let runningStatus = 0;
    while (cursor < trackEnd) {
      const delta = readVlq(view, cursor, trackEnd);
      absoluteTick += delta.value;
      cursor = delta.offset;
      if (cursor >= trackEnd) break;

      let status = view.getUint8(cursor);
      if (status < 0x80) {
        if (!runningStatus) throw new Error('File MIDI non valido: running status senza stato precedente.');
        status = runningStatus;
      } else {
        cursor += 1;
        if (status < 0xf0) runningStatus = status;
      }

      if (status === 0xff) {
        if (cursor >= trackEnd) break;
        const metaType = view.getUint8(cursor++);
        const lengthInfo = readVlq(view, cursor, trackEnd);
        cursor = lengthInfo.offset;
        const length = Math.min(lengthInfo.value, trackEnd - cursor);
        if (metaType === 0x51 && length >= 3) {
          const microsecondsPerQuarter = (view.getUint8(cursor) << 16) | (view.getUint8(cursor + 1) << 8) | view.getUint8(cursor + 2);
          tempos.push({ tick: absoluteTick, microsecondsPerQuarter });
        }
        cursor += length;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const lengthInfo = readVlq(view, cursor, trackEnd);
        cursor = Math.min(trackEnd, lengthInfo.offset + lengthInfo.value);
        continue;
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;
      const data1 = cursor < trackEnd ? view.getUint8(cursor++) : 0;
      const needsSecond = command !== 0xc0 && command !== 0xd0;
      const data2 = needsSecond && cursor < trackEnd ? view.getUint8(cursor++) : 0;
      if (command === 0x90 && data2 > 0) {
        events.push({ tick: absoluteTick, kind: 'on', note: data1, velocity: data2, channel });
      } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
        events.push({ tick: absoluteTick, kind: 'off', note: data1, velocity: data2, channel });
      }
    }
  }

  if (!events.some(event => event.kind === 'on')) throw new Error('Il file MIDI non contiene note riproducibili.');
  events.sort((a, b) => a.tick - b.tick || (a.kind === 'off' ? -1 : 1));
  const toSeconds = createTickConverter(ppq, tempos);
  const open = new Map<string, RawMidiEvent[]>();
  const notes: StudioMidiNote[] = [];

  for (const event of events) {
    const key = `${event.channel}:${event.note}`;
    if (event.kind === 'on') {
      const stack = open.get(key) || [];
      stack.push(event);
      open.set(key, stack);
      continue;
    }
    const stack = open.get(key);
    const startEvent = stack?.shift();
    if (!startEvent) continue;
    const start = toSeconds(startEvent.tick);
    const end = Math.max(start + 0.02, toSeconds(event.tick));
    notes.push({
      note: clamp(startEvent.note, 0, 127),
      velocity: clamp(startEvent.velocity / 127, 0.03, 1),
      channel: startEvent.channel,
      start,
      duration: end - start
    });
  }

  for (const stack of open.values()) {
    for (const startEvent of stack) {
      const start = toSeconds(startEvent.tick);
      notes.push({
        note: clamp(startEvent.note, 0, 127),
        velocity: clamp(startEvent.velocity / 127, 0.03, 1),
        channel: startEvent.channel,
        start,
        duration: 0.25
      });
    }
  }

  notes.sort((a, b) => a.start - b.start || a.note - b.note);
  const duration = Math.max(0.1, ...notes.map(note => note.start + note.duration));
  return { notes, duration, ppq };
}

export async function parseMidiFile(file: File): Promise<ParsedStudioMidi> {
  return parseMidiBlob(file);
}

export function midiNoteFrequency(note: number) {
  return 440 * Math.pow(2, (clamp(note, 0, 127) - 69) / 12);
}

export function createStudioReverbImpulse(context: BaseAudioContext, seconds = 1.6, decay = 3) {
  const sampleRate = context.sampleRate || 48000;
  const frames = Math.max(1, Math.floor(sampleRate * clamp(seconds, 0.2, 4)));
  const buffer = context.createBuffer(2, frames, sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < frames; index += 1) {
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / frames, decay);
    }
  }
  return buffer;
}

const DB_NAME = 'sonara-studio-real-assets-v1';
const STORE_NAME = 'assets';

type StoredStudioAsset = {
  id: string;
  name: string;
  blob: Blob;
  createdAt: number;
};

function openAssetDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function saveStudioAsset(blob: Blob, name = 'audio') {
  const db = await openAssetDatabase();
  if (!db) return '';
  const id = `studio-asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return new Promise<string>(resolve => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const asset: StoredStudioAsset = { id, name, blob, createdAt: Date.now() };
    store.put(asset);
    transaction.oncomplete = () => { db.close(); resolve(id); };
    transaction.onerror = () => { db.close(); resolve(''); };
    transaction.onabort = () => { db.close(); resolve(''); };
  });
}

export async function loadStudioAsset(id: string) {
  if (!id) return null;
  const db = await openAssetDatabase();
  if (!db) return null;
  return new Promise<Blob | null>(resolve => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => {
      const asset = request.result as StoredStudioAsset | undefined;
      db.close();
      resolve(asset?.blob instanceof Blob ? asset.blob : null);
    };
    request.onerror = () => { db.close(); resolve(null); };
  });
}
