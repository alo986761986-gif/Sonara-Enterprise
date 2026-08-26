import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';

const require = createRequire(import.meta.url);
const HOST = '127.0.0.1';
const PORT = Number(process.env.SONARA_DJ_BRIDGE_PORT || 49686);
const PROTOCOL = 2;
const VERSION = '0.2.0';
const ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  'https://sonaraenterprice.com',
  'https://www.sonaraenterprice.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
]);

let midi = null;
let HID = null;
let audify = null;
try { midi = require('@julusian/midi'); } catch (error) { console.warn('[DJ Bridge] MIDI adapter unavailable:', error.message); }
try { HID = require('node-hid'); } catch (error) { console.warn('[DJ Bridge] HID adapter unavailable:', error.message); }
try { audify = require('audify'); } catch (error) { console.warn('[DJ Bridge] Audio adapter unavailable:', error.message); }

const clients = new Set();
const midiInputs = new Map();
let activeProfileId = 'generic-midi';
let link = null;
let linkTimer = null;

const safeSend = (socket, payload) => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
};
const broadcast = payload => { for (const client of clients) safeSend(client, payload); };

function listMidi() {
  if (!midi) return [];
  const devices = [];
  const input = new midi.Input();
  const output = new midi.Output();
  try {
    for (let index = 0; index < input.getPortCount(); index += 1) {
      devices.push({ id: `midi-in-${index}`, name: input.getPortName(index), manufacturer: '', transport: 'midi', input: true, output: false });
    }
    for (let index = 0; index < output.getPortCount(); index += 1) {
      const name = output.getPortName(index);
      const existing = devices.find(item => item.name === name);
      if (existing) { existing.output = true; existing.id = `midi-io-${index}`; }
      else devices.push({ id: `midi-out-${index}`, name, manufacturer: '', transport: 'midi', input: false, output: true });
    }
  } finally {
    try { input.closePort(); } catch {}
    try { output.closePort(); } catch {}
  }
  return devices;
}

function listHid() {
  if (!HID) return [];
  try {
    const source = typeof HID.devices === 'function' ? HID.devices() : [];
    return source.map((device, index) => ({
      id: `hid-${device.vendorId || 0}-${device.productId || 0}-${index}`,
      name: device.product || `HID ${device.vendorId || 0}:${device.productId || 0}`,
      manufacturer: device.manufacturer || '',
      transport: 'hid', input: true, output: true,
      vendorId: device.vendorId, productId: device.productId, usage: device.usage, usagePage: device.usagePage
    }));
  } catch (error) {
    console.warn('[DJ Bridge] HID enumeration failed:', error.message);
    return [];
  }
}

function listAudio() {
  if (!audify?.RtAudio) return [];
  let rt = null;
  try {
    rt = new audify.RtAudio();
    const source = rt.getDevices?.() || [];
    return source.map(device => ({
      id: `audio-${device.id}`,
      name: device.name || `Audio ${device.id}`,
      manufacturer: device.hostApi || device.api || '',
      transport: 'audio',
      input: Number(device.inputChannels || device.nInputChannels || 0) > 0,
      output: Number(device.outputChannels || device.nOutputChannels || 0) > 0,
      channelsIn: Number(device.inputChannels || device.nInputChannels || 0),
      channelsOut: Number(device.outputChannels || device.nOutputChannels || 0),
      sampleRates: device.sampleRates || [],
      hostApi: device.hostApi || device.api || ''
    }));
  } catch (error) {
    console.warn('[DJ Bridge] Audio enumeration failed:', error.message);
    return [];
  }
}

function listDevices() {
  return [...listMidi(), ...listHid(), ...listAudio()];
}

function stopMidiInputs() {
  for (const entry of midiInputs.values()) {
    try { entry.input.closePort(); } catch {}
  }
  midiInputs.clear();
}

function startMidiInputs() {
  stopMidiInputs();
  if (!midi) return;
  const probe = new midi.Input();
  const count = probe.getPortCount();
  try { probe.closePort(); } catch {}
  for (let index = 0; index < count; index += 1) {
    try {
      const input = new midi.Input();
      const name = input.getPortName(index);
      input.ignoreTypes(false, false, false);
      input.on('message', (deltaTime, bytes) => {
        broadcast({ type: 'midi', deviceId: `midi-in-${index}`, bytes: Array.from(bytes || []), timestamp: Date.now(), deltaTime, name });
      });
      input.openPort(index);
      midiInputs.set(`midi-in-${index}`, { input, name, index });
    } catch (error) {
      console.warn(`[DJ Bridge] MIDI input ${index} unavailable:`, error.message);
    }
  }
}

function sendMidi(deviceId, bytes) {
  if (!midi) throw new Error('MIDI adapter unavailable');
  const match = /midi-(?:out|io)-(\d+)/.exec(String(deviceId));
  if (!match) throw new Error('Invalid MIDI output id');
  const index = Number(match[1]);
  const output = new midi.Output();
  try {
    if (index < 0 || index >= output.getPortCount()) throw new Error('MIDI output no longer exists');
    output.openPort(index);
    output.sendMessage(Array.from(bytes || []).map(value => Math.max(0, Math.min(255, Number(value) || 0))));
  } finally {
    try { output.closePort(); } catch {}
  }
}

async function setAbletonLink(enabled) {
  if (!enabled) {
    if (linkTimer) clearInterval(linkTimer);
    linkTimer = null;
    try { link?.enable?.(false); } catch {}
    link = null;
    broadcast({ type: 'network.status', adapter: 'ableton-link', enabled: false });
    return;
  }
  if (!link) {
    const module = await import('@ktamas77/abletonlink');
    const AbletonLink = module.AbletonLink || module.default?.AbletonLink || module.default;
    if (!AbletonLink) throw new Error('Ableton Link native adapter unavailable');
    link = new AbletonLink(124);
    link.enable(true);
    link.enableStartStopSync?.(true);
  }
  if (linkTimer) clearInterval(linkTimer);
  linkTimer = setInterval(() => {
    try {
      broadcast({ type: 'network.status', adapter: 'ableton-link', enabled: true, tempo: Number(link.getTempo?.() || 0), phase: Number(link.getPhase?.(4) || 0), peers: Number(link.getNumPeers?.() || 0), playing: Boolean(link.isPlaying?.()) });
    } catch {}
  }, 250);
}

function createServer() {
  const keyPath = process.env.SONARA_DJ_TLS_KEY;
  const certPath = process.env.SONARA_DJ_TLS_CERT;
  if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ service: 'sonara-dj-bridge', version: VERSION, protocol: PROTOCOL, tls: true }));
    });
  }
  return http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ service: 'sonara-dj-bridge', version: VERSION, protocol: PROTOCOL, tls: false }));
  });
}

if (process.argv.includes('--diagnose')) {
  console.log(JSON.stringify({
    version: VERSION,
    protocol: PROTOCOL,
    midiAdapter: Boolean(midi),
    hidAdapter: Boolean(HID),
    audioAdapter: Boolean(audify),
    devices: listDevices()
  }, null, 2));
  process.exit(0);
}

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (socket, request) => {
  const origin = String(request.headers.origin || '');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    safeSend(socket, { type: 'error', code: 'ORIGIN_NOT_ALLOWED', message: `Origin ${origin} is not allowed.` });
    socket.close(1008, 'Origin not allowed');
    return;
  }
  clients.add(socket);
  startMidiInputs();
  socket.on('message', async raw => {
    let message;
    try { message = JSON.parse(String(raw)); } catch { safeSend(socket, { type: 'error', code: 'BAD_JSON', message: 'Invalid JSON.' }); return; }
    try {
      if (message.type === 'hello') {
        if (message.protocol !== PROTOCOL) { safeSend(socket, { type: 'error', code: 'PROTOCOL_MISMATCH', message: `Bridge protocol ${PROTOCOL} required.` }); return; }
        safeSend(socket, { type: 'hello.ok', protocol: PROTOCOL, bridgeVersion: VERSION, platform: process.platform, sessionId: String(message.sessionId || '') });
        safeSend(socket, { type: 'devices', devices: listDevices() });
        return;
      }
      if (message.type === 'ping') { safeSend(socket, { type: 'pong', id: String(message.id || ''), at: Number(message.at || 0), bridgeAt: Date.now() }); return; }
      if (message.type === 'devices.list') { startMidiInputs(); safeSend(socket, { type: 'devices', devices: listDevices() }); return; }
      if (message.type === 'midi.send') { sendMidi(message.deviceId, message.bytes); return; }
      if (message.type === 'profile.activate') { activeProfileId = String(message.profileId || 'generic-midi'); safeSend(socket, { type: 'profile.status', profileId: activeProfileId }); return; }
      if (message.type === 'audio.route') {
        const devices = listAudio();
        const master = message.masterDeviceId ? devices.find(item => item.id === message.masterDeviceId) : null;
        const cue = message.cueDeviceId ? devices.find(item => item.id === message.cueDeviceId) : null;
        safeSend(socket, { type: 'audio.status', sampleRate: Number(message.sampleRate || 48000), bufferFrames: Number(message.bufferFrames || 256), masterDeviceId: master?.id, cueDeviceId: cue?.id, latencyMs: null });
        return;
      }
      if (message.type === 'network.enable') {
        if (message.adapter === 'ableton-link') { await setAbletonLink(Boolean(message.enabled)); return; }
        if (message.adapter === 'engine-link') { safeSend(socket, { type: 'error', code: 'ENGINE_LINK_ADAPTER_REQUIRED', message: 'Engine DJ uses Ableton Link for supported sync; use the Ableton Link adapter.' }); return; }
        safeSend(socket, { type: 'error', code: 'VENDOR_ADAPTER_REQUIRED', message: 'Vendor network protocols require an explicitly licensed/certified SONARA adapter.' });
        return;
      }
      safeSend(socket, { type: 'error', code: 'UNKNOWN_MESSAGE', message: `Unknown message type: ${String(message.type || '')}` });
    } catch (error) {
      safeSend(socket, { type: 'error', code: 'BRIDGE_OPERATION_FAILED', message: error instanceof Error ? error.message : String(error) });
    }
  });
  socket.on('close', () => {
    clients.delete(socket);
    if (clients.size === 0) stopMidiInputs();
  });
});

server.listen(PORT, HOST, () => {
  const secure = server instanceof https.Server;
  console.log(`[SONARA DJ Bridge] ${secure ? 'wss' : 'ws'}://${HOST}:${PORT}`);
  console.log(`[SONARA DJ Bridge] protocol=${PROTOCOL} version=${VERSION}`);
  console.log(`[SONARA DJ Bridge] profile=${activeProfileId}`);
  console.log(`[SONARA DJ Bridge] MIDI=${Boolean(midi)} HID=${Boolean(HID)} AUDIO=${Boolean(audify)}`);
  if (!secure) console.log('[SONARA DJ Bridge] Production SONARA uses HTTPS: configure SONARA_DJ_TLS_KEY and SONARA_DJ_TLS_CERT for WSS.');
});

process.on('SIGINT', async () => {
  stopMidiInputs();
  await setAbletonLink(false).catch(() => undefined);
  wss.close();
  server.close(() => process.exit(0));
});
