import { useEffect, useRef, useState } from 'react';
import { Check, Download, LoaderCircle, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  clampEqDb, createEqNodes, eqIsFlat, renderRemixEqWav,
  REMIX_EQ_CLARITY, REMIX_EQ_FLAT,
  type RemixEqBands,
} from './remixAudioEq';

type Props = {
  audioUrl: string;
  label: string;
  onUse: (file: File) => void;
};

type LiveEq = ReturnType<typeof createEqNodes>;

export default function SonaraRemixResultEq({ audioUrl, label, onUse }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const liveRef = useRef<LiveEq | null>(null);
  const [bands, setBands] = useState<RemixEqBands>({ ...REMIX_EQ_CLARITY });
  const [enabled, setEnabled] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const bandsRef = useRef(bands);
  const enabledRef = useRef(enabled);
  bandsRef.current = bands;
  enabledRef.current = enabled;

  // Audio graph is created on the first real play gesture, not in mount effects.
  // This avoids duplicate MediaElementAudioSourceNode errors under React StrictMode.
  const activateAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (contextRef.current) {
      void contextRef.current.resume();
      return;
    }
    try {
      const context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const initial = enabledRef.current ? bandsRef.current : REMIX_EQ_FLAT;
      const filters = createEqNodes(context, initial);
      source.connect(filters.low);
      filters.preamp.connect(context.destination);
      contextRef.current = context;
      liveRef.current = filters;
      void context.resume();
    } catch {
      setError('Anteprima equalizzata non disponibile in questo browser.');
    }
  };

  useEffect(() => () => {
    const context = contextRef.current;
    liveRef.current = null;
    contextRef.current = null;
    void context?.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const filters = createEqNodes(context, enabledRef.current ? bandsRef.current : REMIX_EQ_FLAT);
      source.connect(filters.low);
      filters.preamp.connect(context.destination);
      contextRef.current = context;
      liveRef.current = filters;
    } catch {
      // If Web Audio is blocked, still show the normal HTML audio player.
      void context?.close().catch(() => undefined);
      contextRef.current = null;
      liveRef.current = null;
      setError('Anteprima equalizzata non disponibile in questo browser.');
    }
    return () => {
      liveRef.current = null;
      contextRef.current = null;
      void context?.close().catch(() => undefined);
    };
  }, [audioUrl]);

  useEffect(() => {
    const filters = liveRef.current;
    const context = contextRef.current;
    if (!filters || !context) return;
    const next = enabled ? bands : REMIX_EQ_FLAT;
    for (const [node, gain] of [
      [filters.low, next.low],
      [filters.mid, next.mid],
      [filters.high, next.high],
    ] as const) node.gain.setTargetAtTime(clampEqDb(gain), context.currentTime, 0.012);
    const activeEq = enabled && !eqIsFlat(next);
    filters.preamp.gain.setTargetAtTime(activeEq ? Math.pow(10, -2.5 / 20) : 1, context.currentTime, 0.012);
  }, [bands, enabled]);

  const updateBand = (key: keyof RemixEqBands, value: number) => {
    setBands(current => ({ ...current, [key]: clampEqDb(value) }));
    setError('');
  };

  const buildFile = async (): Promise<File> => {
    const blob = await renderRemixEqWav(audioUrl, bands, enabled);
    return new File([blob], 'SONARA-REMIX-EQ.wav', { type: 'audio/wav' });
  };

  const runAction = async (action: 'download' | 'use') => {
    if (rendering) return;
    setRendering(true);
    setError('');
    try {
      const file = await buildFile();
      if (action === 'use') {
        onUse(file);
      } else {
        const objectUrl = URL.createObjectURL(file);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = 'SONARA-REMIX-EQ.wav';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      }
    } catch {
      setError('Impossibile elaborare il WAV equalizzato. Il Remix originale rimane disponibile.');
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="sonara-remix-eq">
      <audio
        ref={audioRef}
        controls
        crossOrigin="anonymous"
        preload="metadata"
        src={audioUrl}
        aria-label={'Anteprima audio equalizzata ' + label}
        onPlay={activateAudio}
      />
      <div className="sonara-remix-eq-head">
        <span><SlidersHorizontal /> Mini EQ · 3 bande</span>
        <button type="button" className="sonara-remix-eq-bypass" aria-pressed={!enabled}
          onClick={() => setEnabled(value => !value)}>{enabled ? 'ON' : 'BYPASS'}</button>
      </div>
      <div className="sonara-remix-eq-presets">
        <button type="button" data-active={enabled && !eqIsFlat(bands)}
          onClick={() => { setBands({ ...REMIX_EQ_CLARITY }); setEnabled(true); }}>Più chiaro</button>
        <button type="button" data-active={enabled && eqIsFlat(bands)}
          onClick={() => { setBands({ ...REMIX_EQ_FLAT }); setEnabled(true); }}>Flat</button>
        <button type="button" title="Ripristina il preset chiaro" aria-label="Ripristina equalizzatore"
          onClick={() => { setBands({ ...REMIX_EQ_CLARITY }); setEnabled(true); }}><RotateCcw /></button>
      </div>
      <div className="sonara-remix-eq-bands">
        {([
          ['low', 'Bassi'],
          ['mid', 'Presenza'],
          ['high', 'Alti'],
        ] as const).map(([key, title]) => (
          <label key={key}>
            <span>{title} <b>{bands[key] > 0 ? '+' : ''}{bands[key].toFixed(1)} dB</b></span>
            <input aria-label={title + ' equalizzatore'} type="range" min={-6} max={6} step={0.5}
              disabled={!enabled} value={bands[key]}
              onChange={event => updateBand(key, Number(event.currentTarget.value))} />
          </label>
        ))}
      </div>
      <small className="sonara-remix-eq-info">Equalizzazione reale in ascolto e nel WAV esportato. Bypass = EQ neutro.</small>
      <div className="sonara-remix-eq-actions">
        <button type="button" disabled={rendering} onClick={() => void runAction('use')}>
          {rendering ? <LoaderCircle className="sonara-spin" /> : <Check />} Usa EQ
        </button>
        <button type="button" disabled={rendering} onClick={() => void runAction('download')}>
          <Download /> WAV EQ
        </button>
      </div>
      {error && <small className="sonara-remix-eq-error" role="status">{error}</small>}
    </div>
  );
}
