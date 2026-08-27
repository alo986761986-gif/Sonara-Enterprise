export type DJBrand =
  | 'Native Instruments'
  | 'AlphaTheta / Pioneer DJ'
  | 'Denon DJ'
  | 'Hercules'
  | 'Reloop'
  | 'Numark'
  | 'Allen & Heath'
  | 'RANE'
  | 'Roland'
  | 'Generic';

export type DJTransport = 'midi' | 'hid' | 'bridge' | 'network';

export type DJCapability =
  | 'decks-2'
  | 'decks-4'
  | 'jog'
  | 'motorized-jog'
  | 'hot-cues'
  | 'pads'
  | 'rgb-pads'
  | 'loop'
  | 'beat-jump'
  | 'browser'
  | 'mixer'
  | 'eq-3'
  | 'filter'
  | 'fx'
  | 'stems'
  | 'display'
  | 'led-feedback'
  | 'midi-clock'
  | 'network-sync'
  | 'audio-interface'
  | 'mic-input'
  | 'standalone';

export type DJDeviceProfile = {
  id: string;
  brand: DJBrand;
  model: string;
  aliases: string[];
  transports: DJTransport[];
  capabilities: DJCapability[];
  deckCount: 1 | 2 | 4;
  connection: 'browser-midi' | 'browser-hid' | 'bridge-preferred' | 'bridge-required';
  mapping: 'midi-learn' | 'profile-template' | 'bridge-native';
  notes: string;
};

const profile = (
  id: string,
  brand: DJBrand,
  model: string,
  aliases: string[],
  transports: DJTransport[],
  capabilities: DJCapability[],
  deckCount: 1 | 2 | 4,
  connection: DJDeviceProfile['connection'],
  mapping: DJDeviceProfile['mapping'],
  notes: string
): DJDeviceProfile => ({ id, brand, model, aliases, transports, capabilities, deckCount, connection, mapping, notes });

const COMMON_TWO_DECK: DJCapability[] = ['decks-2', 'jog', 'hot-cues', 'pads', 'loop', 'browser', 'mixer', 'eq-3', 'filter', 'fx', 'led-feedback'];
const COMMON_FOUR_DECK: DJCapability[] = ['decks-4', 'jog', 'hot-cues', 'pads', 'loop', 'beat-jump', 'browser', 'mixer', 'eq-3', 'filter', 'fx', 'stems', 'led-feedback'];

export const DJ_DEVICE_PROFILES: DJDeviceProfile[] = [
  profile('ni-x1-mk1', 'Native Instruments', 'Traktor Kontrol X1 MK1', ['kontrol x1', 'traktor x1', 'x1 mk1'], ['midi', 'bridge'], ['decks-2', 'hot-cues', 'loop', 'browser', 'fx', 'led-feedback'], 2, 'browser-midi', 'midi-learn', 'X1 originale: SHIFT + HOTCUE per MIDI mode; mapping persistente SONARA.'),
  profile('ni-z1-original', 'Native Instruments', 'Traktor Kontrol Z1 Original', ['kontrol z1', 'traktor z1', 'z1 original'], ['midi', 'bridge'], ['decks-2', 'mixer', 'eq-3', 'filter', 'fx', 'audio-interface', 'led-feedback'], 2, 'browser-midi', 'midi-learn', 'Z1 originale: MODE + CUE A + CUE B per MIDI mode; gain, EQ, filter, fader e crossfader.'),
  profile('ni-s4-mk3', 'Native Instruments', 'Traktor Kontrol S4 MK3', ['kontrol s4 mk3', 'traktor s4 mk3'], ['midi', 'bridge'], [...COMMON_FOUR_DECK, 'motorized-jog', 'display', 'audio-interface', 'mic-input'], 4, 'bridge-preferred', 'profile-template', 'MIDI is usable for user mappings; high-resolution/native features are reserved for DJ Bridge adapters.'),
  profile('ni-s3', 'Native Instruments', 'Traktor Kontrol S3', ['kontrol s3', 'traktor s3'], ['midi', 'bridge'], [...COMMON_FOUR_DECK, 'audio-interface', 'mic-input'], 4, 'bridge-preferred', 'profile-template', 'Generic MIDI + SONARA profile; native-only functions can be exposed by the Bridge when available.'),
  profile('ni-s2-mk3', 'Native Instruments', 'Traktor Kontrol S2 MK3', ['kontrol s2 mk3', 'traktor s2 mk3'], ['midi', 'bridge'], [...COMMON_TWO_DECK, 'audio-interface', 'mic-input'], 2, 'bridge-preferred', 'profile-template', 'Two-deck controller profile with MIDI Learn fallback.'),
  profile('ni-x1-mk3', 'Native Instruments', 'Traktor X1 MK3', ['x1 mk3', 'traktor x1 mk3'], ['midi', 'bridge'], ['decks-2', 'hot-cues', 'loop', 'beat-jump', 'browser', 'fx', 'display', 'led-feedback'], 2, 'bridge-preferred', 'profile-template', 'Deck/FX add-on controller; audio mixing remains on the mixer or another device.'),
  profile('ni-f1', 'Native Instruments', 'Traktor Kontrol F1', ['kontrol f1', 'traktor f1'], ['midi', 'bridge'], ['pads', 'rgb-pads', 'hot-cues', 'loop', 'stems', 'led-feedback'], 1, 'browser-midi', 'profile-template', 'Pad/stem/remix oriented controller profile.'),
  profile('ni-z1-mk2', 'Native Instruments', 'Traktor Z1 MK2', ['z1 mk2', 'traktor z1 mk2'], ['midi', 'bridge'], ['decks-2', 'mixer', 'eq-3', 'filter', 'fx', 'audio-interface', 'led-feedback'], 2, 'bridge-preferred', 'profile-template', 'Compact mixer/audio interface profile.'),

  profile('at-ddj-flx4', 'AlphaTheta / Pioneer DJ', 'DDJ-FLX4', ['ddj-flx4', 'ddj flx4', 'pioneer flx4'], ['midi', 'hid', 'bridge'], [...COMMON_TWO_DECK, 'audio-interface', 'mic-input'], 2, 'browser-midi', 'profile-template', 'Browser MIDI is the safest universal path; deeper HID/audio integration can use DJ Bridge.'),
  profile('at-ddj-flx10', 'AlphaTheta / Pioneer DJ', 'DDJ-FLX10', ['ddj-flx10', 'ddj flx10', 'pioneer flx10'], ['midi', 'hid', 'bridge'], [...COMMON_FOUR_DECK, 'rgb-pads', 'display', 'audio-interface', 'mic-input'], 4, 'bridge-preferred', 'profile-template', 'Four-deck/stems controller profile with LED/display feedback path.'),
  profile('at-ddj-grv6', 'AlphaTheta / Pioneer DJ', 'DDJ-GRV6', ['ddj-grv6', 'ddj grv6'], ['midi', 'hid', 'bridge'], [...COMMON_FOUR_DECK, 'rgb-pads', 'audio-interface'], 4, 'bridge-preferred', 'profile-template', 'Four-deck performance controller blueprint.'),
  profile('at-xdj-az', 'AlphaTheta / Pioneer DJ', 'XDJ-AZ', ['xdj-az', 'xdj az'], ['hid', 'bridge', 'network'], [...COMMON_FOUR_DECK, 'display', 'audio-interface', 'mic-input', 'standalone', 'network-sync'], 4, 'bridge-required', 'bridge-native', 'Standalone/network functionality is only enabled through a local Bridge adapter and supported vendor interfaces.'),
  profile('at-xdj-an', 'AlphaTheta / Pioneer DJ', 'XDJ-AN', ['xdj-an', 'xdj an'], ['hid', 'bridge', 'network'], [...COMMON_FOUR_DECK, 'display', 'audio-interface', 'mic-input', 'standalone', 'network-sync'], 4, 'bridge-required', 'bridge-native', 'Network/standalone profile. SONARA does not probe PRO DJ LINK directly from the browser.'),
  profile('at-opus-quad', 'AlphaTheta / Pioneer DJ', 'OPUS-QUAD', ['opus-quad', 'opus quad'], ['hid', 'bridge', 'network'], [...COMMON_FOUR_DECK, 'display', 'audio-interface', 'mic-input', 'standalone', 'network-sync'], 4, 'bridge-required', 'bridge-native', 'Standalone four-deck unit; professional connectivity is delegated to the Bridge.'),
  profile('at-cdj-3000', 'AlphaTheta / Pioneer DJ', 'CDJ-3000', ['cdj-3000', 'cdj 3000'], ['hid', 'bridge', 'network'], ['jog', 'hot-cues', 'loop', 'beat-jump', 'browser', 'display', 'led-feedback', 'network-sync', 'standalone'], 1, 'bridge-required', 'bridge-native', 'Player profile; secure PRO DJ LINK access requires vendor-compatible Bridge support.'),
  profile('at-cdj-1500x', 'AlphaTheta / Pioneer DJ', 'CDJ-1500X', ['cdj-1500x', 'cdj 1500x'], ['hid', 'bridge', 'network'], ['jog', 'hot-cues', 'loop', 'beat-jump', 'browser', 'display', 'led-feedback', 'network-sync', 'standalone'], 1, 'bridge-required', 'bridge-native', 'Player profile for current-generation AlphaTheta hardware.'),
  profile('at-djm-a9', 'AlphaTheta / Pioneer DJ', 'DJM-A9', ['djm-a9', 'djm a9'], ['midi', 'bridge', 'network'], ['decks-4', 'mixer', 'eq-3', 'filter', 'fx', 'audio-interface', 'mic-input', 'network-sync', 'led-feedback'], 4, 'bridge-preferred', 'profile-template', 'Mixer MIDI can be mapped in-browser; multi-channel audio/network routing belongs in the Bridge.'),

  profile('denon-prime4plus', 'Denon DJ', 'PRIME 4+', ['prime 4+', 'prime4+', 'prime 4 plus'], ['midi', 'hid', 'bridge', 'network'], [...COMMON_FOUR_DECK, 'display', 'audio-interface', 'mic-input', 'standalone', 'network-sync'], 4, 'bridge-required', 'bridge-native', 'Standalone Engine DJ profile; network sync/Link is handled by the local Bridge.'),
  profile('denon-sc6000', 'Denon DJ', 'SC6000 / SC6000M', ['sc6000', 'sc6000m'], ['midi', 'hid', 'bridge', 'network'], ['decks-2', 'jog', 'motorized-jog', 'hot-cues', 'pads', 'loop', 'beat-jump', 'display', 'led-feedback', 'standalone', 'network-sync'], 2, 'bridge-required', 'bridge-native', 'Dual-layer player profile. Motorized-jog capability applies to SC6000M.'),
  profile('denon-sc5000', 'Denon DJ', 'SC5000 / SC5000M', ['sc5000', 'sc5000m'], ['midi', 'hid', 'bridge', 'network'], ['decks-2', 'jog', 'motorized-jog', 'hot-cues', 'pads', 'loop', 'display', 'led-feedback', 'standalone', 'network-sync'], 2, 'bridge-required', 'bridge-native', 'Legacy Prime player family profile.'),
  profile('denon-lc6000', 'Denon DJ', 'LC6000 PRIME', ['lc6000', 'lc6000 prime'], ['midi', 'hid', 'bridge'], ['jog', 'hot-cues', 'pads', 'loop', 'beat-jump', 'display', 'led-feedback'], 1, 'bridge-preferred', 'profile-template', 'Layer controller profile with MIDI/HID paths.'),
  profile('denon-prime-go-plus', 'Denon DJ', 'PRIME GO+', ['prime go+', 'prime go plus'], ['midi', 'hid', 'bridge', 'network'], [...COMMON_TWO_DECK, 'display', 'audio-interface', 'mic-input', 'standalone', 'network-sync'], 2, 'bridge-required', 'bridge-native', 'Portable standalone Engine DJ profile.'),
  profile('denon-sc-live4', 'Denon DJ', 'SC LIVE 4', ['sc live 4', 'sclive4'], ['midi', 'hid', 'bridge', 'network'], [...COMMON_FOUR_DECK, 'display', 'audio-interface', 'mic-input', 'standalone', 'network-sync'], 4, 'bridge-required', 'bridge-native', 'Four-deck standalone controller profile.'),

  profile('hercules-inpulse500', 'Hercules', 'DJControl Inpulse 500', ['inpulse 500', 'djcontrol inpulse 500'], ['midi', 'bridge'], [...COMMON_TWO_DECK, 'rgb-pads', 'audio-interface', 'mic-input'], 2, 'browser-midi', 'profile-template', 'Class-compliant MIDI-first profile with MIDI Learn fallback.'),
  profile('hercules-inpulse300mk2', 'Hercules', 'DJControl Inpulse 300 MK2', ['inpulse 300 mk2', 'djcontrol inpulse 300 mk2'], ['midi', 'bridge'], [...COMMON_TWO_DECK, 'rgb-pads', 'audio-interface'], 2, 'browser-midi', 'profile-template', 'MIDI-first controller profile.'),
  profile('hercules-inpulset7', 'Hercules', 'DJControl Inpulse T7', ['inpulse t7', 'djcontrol inpulse t7'], ['midi', 'bridge'], [...COMMON_TWO_DECK, 'motorized-jog', 'rgb-pads', 'audio-interface', 'mic-input'], 2, 'bridge-preferred', 'profile-template', 'Motorized platters benefit from the low-latency Bridge path.'),
  profile('hercules-starlight', 'Hercules', 'DJControl Starlight', ['starlight', 'djcontrol starlight'], ['midi'], ['decks-2', 'jog', 'hot-cues', 'pads', 'loop', 'mixer', 'filter', 'audio-interface', 'led-feedback'], 2, 'browser-midi', 'midi-learn', 'Compact MIDI controller profile.'),

  profile('reloop-mixon8pro', 'Reloop', 'Mixon 8 Pro', ['mixon 8 pro', 'mixon8pro'], ['midi', 'hid', 'bridge'], [...COMMON_FOUR_DECK, 'rgb-pads', 'audio-interface', 'mic-input'], 4, 'bridge-preferred', 'profile-template', 'Four-deck controller profile.'),
  profile('reloop-ready', 'Reloop', 'Ready', ['reloop ready'], ['midi', 'bridge'], [...COMMON_TWO_DECK, 'rgb-pads', 'audio-interface'], 2, 'browser-midi', 'profile-template', 'Portable MIDI-first profile.'),
  profile('reloop-buddy', 'Reloop', 'Buddy', ['reloop buddy'], ['midi', 'bridge'], [...COMMON_TWO_DECK, 'rgb-pads', 'audio-interface'], 2, 'browser-midi', 'profile-template', 'Compact MIDI-first profile.'),
  profile('reloop-beatmix4mk2', 'Reloop', 'Beatmix 4 MK2', ['beatmix 4 mk2', 'beatmix4 mk2'], ['midi', 'bridge'], [...COMMON_FOUR_DECK, 'audio-interface'], 4, 'browser-midi', 'profile-template', 'Four-deck MIDI controller profile.'),

  profile('numark-mixtrack-platinum-fx', 'Numark', 'Mixtrack Platinum FX', ['mixtrack platinum fx'], ['midi', 'bridge'], [...COMMON_FOUR_DECK, 'display', 'audio-interface'], 4, 'browser-midi', 'profile-template', 'MIDI-first four-layer controller profile.'),
  profile('numark-ns4fx', 'Numark', 'NS4FX', ['ns4fx', 'ns4 fx'], ['midi', 'bridge'], [...COMMON_FOUR_DECK, 'audio-interface', 'mic-input'], 4, 'bridge-preferred', 'profile-template', 'Four-deck controller with audio interface.'),
  profile('numark-party-mix2', 'Numark', 'Party Mix II', ['party mix ii', 'party mix 2'], ['midi'], ['decks-2', 'jog', 'hot-cues', 'pads', 'loop', 'mixer', 'eq-3', 'filter', 'led-feedback'], 2, 'browser-midi', 'midi-learn', 'Entry controller; universal MIDI Learn is the primary path.'),

  profile('rane-four', 'RANE', 'FOUR', ['rane four', 'rane 4'], ['midi', 'hid', 'bridge'], [...COMMON_FOUR_DECK, 'rgb-pads', 'audio-interface', 'mic-input'], 4, 'bridge-preferred', 'profile-template', 'Four-deck/stems performance controller profile.'),
  profile('rane-performer', 'RANE', 'PERFORMER', ['rane performer'], ['midi', 'hid', 'bridge'], [...COMMON_FOUR_DECK, 'motorized-jog', 'rgb-pads', 'display', 'audio-interface', 'mic-input'], 4, 'bridge-preferred', 'profile-template', 'Motorized four-deck performance controller profile.'),
  profile('rane-one', 'RANE', 'ONE', ['rane one'], ['midi', 'hid', 'bridge'], [...COMMON_TWO_DECK, 'motorized-jog', 'rgb-pads', 'audio-interface', 'mic-input'], 2, 'bridge-preferred', 'profile-template', 'Motorized two-deck controller profile.'),
  profile('rane-twelve2', 'RANE', 'TWELVE MKII', ['rane twelve mkii', 'rane twelve mk2', 'twelve mkii'], ['midi', 'hid', 'bridge'], ['jog', 'motorized-jog', 'hot-cues', 'loop', 'led-feedback'], 1, 'bridge-preferred', 'profile-template', 'Motorized deck controller; mixer/audio path is external.'),

  profile('ah-xonek2', 'Allen & Heath', 'Xone:K2', ['xone:k2', 'xone k2', 'xonek2'], ['midi', 'bridge'], ['decks-4', 'mixer', 'eq-3', 'filter', 'fx', 'led-feedback', 'audio-interface'], 4, 'browser-midi', 'profile-template', 'Flexible MIDI controller/mixer profile.'),
  profile('ah-xonek3', 'Allen & Heath', 'Xone:K3', ['xone:k3', 'xone k3', 'xonek3'], ['midi', 'bridge'], ['decks-4', 'mixer', 'eq-3', 'filter', 'fx', 'led-feedback', 'audio-interface'], 4, 'browser-midi', 'profile-template', 'Current Xone compact controller profile; MIDI Learn remains available.'),
  profile('ah-xone96', 'Allen & Heath', 'Xone:96', ['xone:96', 'xone 96'], ['midi', 'bridge'], ['decks-4', 'mixer', 'eq-3', 'filter', 'audio-interface', 'midi-clock'], 4, 'bridge-preferred', 'profile-template', 'Club mixer profile; multi-channel audio routing requires DJ Bridge.'),

  profile('roland-dj707m', 'Roland', 'DJ-707M', ['dj-707m', 'dj707m'], ['midi', 'bridge'], [...COMMON_FOUR_DECK, 'audio-interface', 'mic-input'], 4, 'bridge-preferred', 'profile-template', 'Four-deck mobile/event controller profile.'),
  profile('roland-dj505', 'Roland', 'DJ-505', ['dj-505', 'dj505'], ['midi', 'bridge'], [...COMMON_TWO_DECK, 'rgb-pads', 'audio-interface', 'mic-input', 'midi-clock'], 2, 'bridge-preferred', 'profile-template', 'Two-deck performance controller profile.'),
  profile('roland-dj202', 'Roland', 'DJ-202', ['dj-202', 'dj202'], ['midi', 'bridge'], [...COMMON_TWO_DECK, 'rgb-pads', 'midi-clock'], 2, 'browser-midi', 'profile-template', 'Portable MIDI controller profile.'),

  profile('generic-midi', 'Generic', 'Generic MIDI Controller', ['midi controller', 'usb midi', 'generic midi'], ['midi'], ['decks-2', 'mixer', 'eq-3', 'filter', 'fx', 'led-feedback'], 2, 'browser-midi', 'midi-learn', 'Universal fallback. SONARA learns every control from the actual messages produced by the device.')
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();

export function findDJDeviceProfile(name = '', manufacturer = ''): DJDeviceProfile {
  const haystack = normalize(`${name} ${manufacturer}`);
  let best: { score: number; profile: DJDeviceProfile } | null = null;
  for (const candidate of DJ_DEVICE_PROFILES) {
    const terms = [candidate.model, candidate.brand, ...candidate.aliases].map(normalize).filter(Boolean);
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? term.length : 0), 0);
    if (!best || score > best.score) best = { score, profile: candidate };
  }
  return best && best.score >= 4 ? best.profile : DJ_DEVICE_PROFILES[DJ_DEVICE_PROFILES.length - 1];
}

export function profilesByBrand() {
  return DJ_DEVICE_PROFILES.reduce<Record<DJBrand, DJDeviceProfile[]>>((result, item) => {
    (result[item.brand] ||= []).push(item);
    return result;
  }, {} as Record<DJBrand, DJDeviceProfile[]>);
}

export const DJ_CAPABILITY_LABELS: Record<DJCapability, string> = {
  'decks-2': '2 deck', 'decks-4': '4 deck', jog: 'Jog', 'motorized-jog': 'Jog motorizzato', 'hot-cues': 'Hot Cue', pads: 'Performance Pad', 'rgb-pads': 'RGB Pad', loop: 'Loop', 'beat-jump': 'Beat Jump', browser: 'Browser', mixer: 'Mixer', 'eq-3': '3-band EQ', filter: 'Filter', fx: 'FX', stems: 'Stems', display: 'Display', 'led-feedback': 'LED feedback', 'midi-clock': 'MIDI Clock', 'network-sync': 'Network Sync', 'audio-interface': 'Audio Interface', 'mic-input': 'Mic', standalone: 'Standalone'
};
