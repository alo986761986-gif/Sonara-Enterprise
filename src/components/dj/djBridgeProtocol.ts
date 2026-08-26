export const DJ_BRIDGE_PROTOCOL_VERSION = 2;
export const DJ_BRIDGE_PORT = 49686;

export type BridgeDevice = {
  id: string;
  name: string;
  manufacturer?: string;
  transport: 'midi' | 'hid' | 'audio' | 'network';
  input?: boolean;
  output?: boolean;
  channelsIn?: number;
  channelsOut?: number;
  sampleRates?: number[];
  hostApi?: string;
};

export type BridgeHello = {
  type: 'hello';
  protocol: number;
  client: 'sonara-web';
  sessionId: string;
};

export type BridgeClientMessage =
  | BridgeHello
  | { type: 'ping'; id: string; at: number }
  | { type: 'devices.list' }
  | { type: 'midi.send'; deviceId: string; bytes: number[] }
  | { type: 'profile.activate'; profileId: string }
  | { type: 'audio.route'; masterDeviceId?: string; cueDeviceId?: string; sampleRate?: number; bufferFrames?: number }
  | { type: 'network.enable'; adapter: 'ableton-link' | 'engine-link' | 'vendor-certified'; enabled: boolean };

export type BridgeServerMessage =
  | { type: 'hello.ok'; protocol: number; bridgeVersion: string; platform: string; sessionId: string }
  | { type: 'pong'; id: string; at: number; bridgeAt: number }
  | { type: 'devices'; devices: BridgeDevice[] }
  | { type: 'device.added'; device: BridgeDevice }
  | { type: 'device.removed'; deviceId: string }
  | { type: 'midi'; deviceId: string; bytes: number[]; timestamp: number }
  | { type: 'hid'; deviceId: string; reportId: number; bytes: number[]; timestamp: number }
  | { type: 'audio.status'; sampleRate: number; bufferFrames: number; latencyMs?: number; masterDeviceId?: string; cueDeviceId?: string }
  | { type: 'network.status'; adapter: string; enabled: boolean; tempo?: number; phase?: number }
  | { type: 'error'; code: string; message: string };

export function bridgeUrl() {
  const configured = localStorage.getItem('sonara.dj.bridge-url');
  if (configured) return configured;
  // Chrome 147+ gates loopback WebSockets behind Local Network Access permission.
  // The local Bridge starts as plain WS by default; WSS remains available through
  // the explicit sonara.dj.bridge-url override when a trusted local TLS cert is used.
  return `ws://127.0.0.1:${DJ_BRIDGE_PORT}`;
}

export function createBridgeSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `sonara-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
