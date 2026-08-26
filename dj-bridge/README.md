# SONARA DJ Bridge

SONARA DJ Bridge is the local hardware service used by the SONARA DJ section when a browser API is not enough for professional DJ hardware.

## What it does

- Enumerates native MIDI inputs and outputs.
- Streams real incoming MIDI messages to SONARA.
- Sends MIDI feedback back to controller LEDs/displays when the active profile supports it.
- Enumerates HID devices without silently claiming them or changing their driver state.
- Enumerates system audio devices and channel capabilities through RtAudio where available.
- Provides an Ableton Link adapter for tempo/phase/transport/peer synchronization.
- Provides a versioned WebSocket protocol and heartbeat/latency measurement.
- Binds only to `127.0.0.1` by default.
- Allows only approved SONARA and local-development browser origins.

## What it deliberately does not fake

- It does not claim a proprietary HID mapping is working until that controller has a tested mapping/adapter.
- It does not packet-probe PRO DJ LINK or other vendor LAN protocols from the website.
- Vendor-specific network protocols require an explicit licensed/certified adapter.
- Audio enumeration/routing metadata is not the same as a full browser-to-ASIO/CoreAudio multichannel PCM transport. That transport must be implemented and verified separately before SONARA labels it operational.

## Requirements

- Node.js 20 or newer.
- Native build prerequisites required by `node-hid`, RtMidi and RtAudio on the target operating system.
- The official hardware driver when the manufacturer requires one.

## Install

```bash
cd dj-bridge
npm install
```

## Diagnose hardware

```bash
npm run diagnose
```

The command prints the adapters that loaded successfully and the devices currently visible to the operating system.

## Start for local development

```bash
npm start
```

The default development endpoint is:

```text
ws://127.0.0.1:49686
```

## HTTPS SONARA / production

The SONARA web application is served over HTTPS. A secure page must not rely on an insecure remote WebSocket. Configure a locally trusted TLS certificate for the Bridge:

```text
SONARA_DJ_TLS_KEY=/path/to/local-key.pem
SONARA_DJ_TLS_CERT=/path/to/local-cert.pem
```

Then start the Bridge. It will expose:

```text
wss://127.0.0.1:49686
```

For an end-user release this should be packaged as a signed SONARA desktop helper with certificate provisioning handled by the installer instead of asking DJs to configure TLS manually.

## Protocol

The browser and Bridge currently use protocol version 2. See:

- `src/components/dj/djBridgeProtocol.ts`
- `src/components/dj/useDJBridge.ts`

The handshake rejects incompatible protocol versions instead of silently continuing.

## Integration policy

SONARA uses the safest available path for each device:

1. Web MIDI for standard class-compliant controls.
2. Web HID only after explicit user permission and only for mappings that are known/tested.
3. DJ Bridge for native MIDI, audio-device inspection, Ableton Link and low-level adapters.
4. Vendor-certified adapters for proprietary club/network protocols.

This prevents the UI from presenting fake connectivity when a controller feature is not actually available.
