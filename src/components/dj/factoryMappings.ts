export type DJFactoryMidiRule = {
  status: number;
  data1: number;
  channel: number;
  outputStatus?: number;
  outputData1?: number;
};

export type DJFactoryMidiMapping = Record<string, DJFactoryMidiRule>;

// SONARA factory mappings are deterministic profiles loaded before MIDI Learn.
// Traktor Kontrol Z1 original default Controller Editor layout:
// MIDI channel 1 = left channel, channel 2 = right channel, channel 3 = center/mixer.
export const DJ_FACTORY_MIDI_MAPPINGS: Record<string, DJFactoryMidiMapping> = {
  'ni-z1-original': {
    'deckA.gain': { status: 0xb0, data1: 0, channel: 0 },
    'deckA.eqHigh': { status: 0xb0, data1: 1, channel: 0 },
    'deckA.eqMid': { status: 0xb0, data1: 2, channel: 0 },
    'deckA.eqLow': { status: 0xb0, data1: 3, channel: 0 },
    'deckA.filter': { status: 0xb0, data1: 4, channel: 0 },
    'deckA.volume': { status: 0xb0, data1: 6, channel: 0 },

    'deckB.gain': { status: 0xb1, data1: 0, channel: 1 },
    'deckB.eqHigh': { status: 0xb1, data1: 1, channel: 1 },
    'deckB.eqMid': { status: 0xb1, data1: 2, channel: 1 },
    'deckB.eqLow': { status: 0xb1, data1: 3, channel: 1 },
    'deckB.filter': { status: 0xb1, data1: 4, channel: 1 },
    'deckB.volume': { status: 0xb1, data1: 6, channel: 1 },

    'deckA.cue': { status: 0xb2, data1: 1, channel: 2 },
    'deckB.cue': { status: 0xb2, data1: 2, channel: 2 },
    'mixer.crossfader': { status: 0xb2, data1: 5, channel: 2 }
  }
};

export function getFactoryMidiMapping(profileId: string): DJFactoryMidiMapping {
  return DJ_FACTORY_MIDI_MAPPINGS[profileId] ? { ...DJ_FACTORY_MIDI_MAPPINGS[profileId] } : {};
}

export function hasFactoryMidiMapping(profileId: string) {
  return Boolean(DJ_FACTORY_MIDI_MAPPINGS[profileId]);
}
