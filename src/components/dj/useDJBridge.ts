import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BridgeClientMessage, BridgeDevice, BridgeServerMessage, DJ_BRIDGE_PROTOCOL_VERSION, bridgeUrl, createBridgeSessionId } from './djBridgeProtocol';

export type DJBridgeState = 'offline' | 'connecting' | 'online' | 'incompatible' | 'error';

export function useDJBridge() {
  const [state, setState] = useState<DJBridgeState>('offline');
  const [devices, setDevices] = useState<BridgeDevice[]>([]);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [bridgeVersion, setBridgeVersion] = useState('');
  const [lastError, setLastError] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const sessionId = useMemo(createBridgeSessionId, []);

  const send = useCallback((message: BridgeClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const close = useCallback(() => {
    if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    setState('offline');
  }, []);

  const connect = useCallback(() => {
    close();
    setState('connecting');
    setLastError('');
    const url = bridgeUrl();
    try {
      const socket = new WebSocket(url);
      socketRef.current = socket;
      const timeout = window.setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          setLastError(`Bridge non raggiungibile su ${url}`);
          socket.close();
        }
      }, 2200);

      socket.onopen = () => {
        window.clearTimeout(timeout);
        const hello: BridgeClientMessage = { type: 'hello', protocol: DJ_BRIDGE_PROTOCOL_VERSION, client: 'sonara-web', sessionId };
        socket.send(JSON.stringify(hello));
      };
      socket.onmessage = event => {
        let message: BridgeServerMessage;
        try { message = JSON.parse(String(event.data)) as BridgeServerMessage; } catch { return; }
        if (message.type === 'hello.ok') {
          if (message.protocol !== DJ_BRIDGE_PROTOCOL_VERSION) {
            setState('incompatible');
            setLastError(`Protocollo Bridge ${message.protocol}; SONARA richiede ${DJ_BRIDGE_PROTOCOL_VERSION}.`);
            return;
          }
          setBridgeVersion(message.bridgeVersion);
          setState('online');
          send({ type: 'devices.list' });
          heartbeatRef.current = window.setInterval(() => {
            const id = `${Date.now()}`;
            send({ type: 'ping', id, at: performance.now() });
          }, 3000);
        }
        if (message.type === 'devices') setDevices(message.devices);
        if (message.type === 'device.added') setDevices(current => [...current.filter(item => item.id !== message.device.id), message.device]);
        if (message.type === 'device.removed') setDevices(current => current.filter(item => item.id !== message.deviceId));
        if (message.type === 'pong') setLatencyMs(Math.max(0, performance.now() - message.at));
        if (message.type === 'error') { setLastError(`${message.code}: ${message.message}`); setState('error'); }
      };
      socket.onerror = () => {
        setState('error');
        setLastError(`Connessione Bridge non riuscita su ${url}.`);
      };
      socket.onclose = () => {
        if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
        setState(current => current === 'incompatible' ? current : 'offline');
      };
    } catch (error) {
      setState('error');
      setLastError(error instanceof Error ? error.message : 'Impossibile aprire SONARA DJ Bridge.');
    }
  }, [close, send, sessionId]);

  // DJ Bridge is an optional native helper. Never probe loopback automatically:
  // browser MIDI/HID/audio must stay fully usable without a local installation.
  useEffect(() => close, [close]);

  return { state, devices, latencyMs, bridgeVersion, lastError, url: bridgeUrl(), connect, close, send };
}
