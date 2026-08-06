import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sliders,
  Play,
  Pause,
  RotateCcw,
  Save,
  Download,
  Upload,
  Copy,
  Volume2,
  Activity,
  Layers,
  Zap,
  Radio,
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export type FilterType = 'bell' | 'highpass' | 'lowpass' | 'highshelf' | 'lowshelf' | 'notch';

export interface EqBandConfig {
  id: string;
  group: 'LOW' | 'LOW MID' | 'HIGH MID' | 'HIGH';
  freq: number;
  gain: number;
  q: number;
  type: FilterType;
  enabled: boolean;
  solo?: boolean;
  bypass?: boolean;
}

export interface EqPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  bands: Partial<Record<number, { gain: number; q?: number; type?: FilterType; enabled?: boolean }>>;
}

const FREQ_GROUPS = [
  { name: 'LOW', freqs: [20, 40, 60, 80, 100, 150, 200], color: 'border-cyan-500/40 text-cyan-400 bg-cyan-950/20' },
  { name: 'LOW MID', freqs: [250, 300, 400, 500, 600, 800, 1000], color: 'border-blue-500/40 text-blue-400 bg-blue-950/20' },
  { name: 'HIGH MID', freqs: [2000, 3000, 4000, 5000, 6000, 8000], color: 'border-purple-500/40 text-purple-400 bg-purple-950/20' },
  { name: 'HIGH', freqs: [10000, 12000, 14000, 16000, 18000, 20000], color: 'border-pink-500/40 text-pink-400 bg-pink-950/20' }
];

const INITIAL_BANDS: EqBandConfig[] = [
  // LOW
  { id: 'b_20', group: 'LOW', freq: 20, gain: 0, q: 0.7, type: 'highpass', enabled: true },
  { id: 'b_40', group: 'LOW', freq: 40, gain: 0, q: 1.2, type: 'lowshelf', enabled: true },
  { id: 'b_60', group: 'LOW', freq: 60, gain: 0, q: 1.4, type: 'bell', enabled: true },
  { id: 'b_80', group: 'LOW', freq: 80, gain: 0, q: 1.4, type: 'bell', enabled: true },
  { id: 'b_100', group: 'LOW', freq: 100, gain: 0, q: 1.2, type: 'bell', enabled: true },
  { id: 'b_150', group: 'LOW', freq: 150, gain: 0, q: 1.0, type: 'bell', enabled: true },
  { id: 'b_200', group: 'LOW', freq: 200, gain: 0, q: 1.0, type: 'bell', enabled: true },

  // LOW MID
  { id: 'b_250', group: 'LOW MID', freq: 250, gain: 0, q: 1.0, type: 'bell', enabled: true },
  { id: 'b_300', group: 'LOW MID', freq: 300, gain: 0, q: 1.5, type: 'bell', enabled: true },
  { id: 'b_400', group: 'LOW MID', freq: 400, gain: 0, q: 1.5, type: 'bell', enabled: true },
  { id: 'b_500', group: 'LOW MID', freq: 500, gain: 0, q: 1.2, type: 'bell', enabled: true },
  { id: 'b_600', group: 'LOW MID', freq: 600, gain: 0, q: 1.2, type: 'bell', enabled: true },
  { id: 'b_800', group: 'LOW MID', freq: 800, gain: 0, q: 1.0, type: 'bell', enabled: true },
  { id: 'b_1000', group: 'LOW MID', freq: 1000, gain: 0, q: 1.0, type: 'bell', enabled: true },

  // HIGH MID
  { id: 'b_2000', group: 'HIGH MID', freq: 2000, gain: 0, q: 1.0, type: 'bell', enabled: true },
  { id: 'b_3000', group: 'HIGH MID', freq: 3000, gain: 0, q: 1.2, type: 'bell', enabled: true },
  { id: 'b_4000', group: 'HIGH MID', freq: 4000, gain: 0, q: 1.4, type: 'bell', enabled: true },
  { id: 'b_5000', group: 'HIGH MID', freq: 5000, gain: 0, q: 1.4, type: 'bell', enabled: true },
  { id: 'b_6000', group: 'HIGH MID', freq: 6000, gain: 0, q: 1.2, type: 'bell', enabled: true },
  { id: 'b_8000', group: 'HIGH MID', freq: 8000, gain: 0, q: 1.0, type: 'bell', enabled: true },

  // HIGH
  { id: 'b_10000', group: 'HIGH', freq: 10000, gain: 0, q: 1.0, type: 'bell', enabled: true },
  { id: 'b_12000', group: 'HIGH', freq: 12000, gain: 0, q: 1.2, type: 'highshelf', enabled: true },
  { id: 'b_14000', group: 'HIGH', freq: 14000, gain: 0, q: 1.4, type: 'highshelf', enabled: true },
  { id: 'b_16000', group: 'HIGH', freq: 16000, gain: 0, q: 1.4, type: 'highshelf', enabled: true },
  { id: 'b_18000', group: 'HIGH', freq: 18000, gain: 0, q: 1.0, type: 'highshelf', enabled: true },
  { id: 'b_20000', group: 'HIGH', freq: 20000, gain: 0, q: 0.7, type: 'lowpass', enabled: true }
];

export interface ProfessionalAudioEqualizerProps {
  audioUrl?: string;
  onProcessedAudio?: (newAudioUrl: string, metrics: any) => void;
  isEmbedded?: boolean;
}

export function ProfessionalAudioEqualizer({
  audioUrl,
  onProcessedAudio,
  isEmbedded = false
}: ProfessionalAudioEqualizerProps = {}) {
  const [bands, setBands] = useState<EqBandConfig[]>(INITIAL_BANDS);
  const [presets, setPresets] = useState<EqPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('flat');
  const [activeGroup, setActiveGroup] = useState<string>('ALL');
  const [selectedBandId, setSelectedBandId] = useState<string>('b_60');
  
  // Master EQ Controls
  const [globalBypass, setGlobalBypass] = useState<boolean>(false);
  const [inputGainDb, setInputGainDb] = useState<number>(0);
  const [outputGainDb, setOutputGainDb] = useState<number>(0);
  
  // Custom Preset Modal & Save State
  const [savePresetName, setSavePresetName] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Audio Playback & Realtime DSP State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isProcessingBackend, setIsProcessingBackend] = useState<boolean>(false);
  const [backendNotice, setBackendNotice] = useState<string | null>(null);

  // Active audio URL
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string>(audioUrl || '');
  const hasAudio = Boolean(currentAudioUrl || audioUrl);

  useEffect(() => {
    setCurrentAudioUrl(audioUrl || '');
    setIsPlaying(false);
    setBackendNotice(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [audioUrl]);

  // Metering State
  const [metrics, setMetrics] = useState({
    lufs: -60,
    truePeakDbtp: -60,
    peakL: 0,
    peakR: 0,
    gainReductionDb: 0.0,
    stereoPhaseCorrelation: 0
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const filterNodesRef = useRef<BiquadFilterNode[]>([]);
  const inputGainNodeRef = useRef<GainNode | null>(null);
  const outputGainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const lastMeterUpdateRef = useRef<number>(0);

  // Load Presets on Mount
  useEffect(() => {
    fetch('/api/eq/presets')
      .then(res => res.json())
      .then(data => {
        if (data.presets) {
          setPresets(data.presets);
        }
      })
      .catch(err => console.error('Failed to load EQ presets:', err));
  }, []);

  // Web Audio Context Setup
  const initWebAudio = () => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      return;
    }
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      const inputGainNode = ctx.createGain();
      const outputGainNode = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.72;
      analyser.minDecibels = -100;
      analyser.maxDecibels = -6;

      inputGainNodeRef.current = inputGainNode;
      outputGainNodeRef.current = outputGainNode;
      analyserRef.current = analyser;

      // Build chain of 26 Biquad Filter Nodes
      const filterNodes: BiquadFilterNode[] = bands.map(b => {
        const node = ctx.createBiquadFilter();
        const bypassed = globalBypass || b.bypass || !b.enabled;
        node.type = bypassed ? 'allpass' : mapFilterTypeToWebAudio(b.type);
        node.frequency.setValueAtTime(b.freq, ctx.currentTime);
        node.Q.setValueAtTime(b.q, ctx.currentTime);
        node.gain.setValueAtTime(bypassed ? 0 : b.gain, ctx.currentTime);
        return node;
      });

      filterNodesRef.current = filterNodes;

      // Connect input gain -> filter chain -> output gain -> analyser -> destination
      inputGainNode.connect(filterNodes[0]);
      for (let i = 0; i < filterNodes.length - 1; i++) {
        filterNodes[i].connect(filterNodes[i + 1]);
      }
      filterNodes[filterNodes.length - 1].connect(outputGainNode);
      outputGainNode.connect(analyser);
      analyser.connect(ctx.destination);

      // Connect HTML Audio Element via MediaElementAudioSourceNode
      if (audioRef.current && !mediaSourceNodeRef.current) {
        try {
          const source = ctx.createMediaElementSource(audioRef.current);
          source.connect(inputGainNode);
          mediaSourceNodeRef.current = source;
        } catch (err) {
          console.warn('MediaElementSource initialization notice:', err);
        }
      }
    } catch (e) {
      console.error('Web Audio init error:', e);
    }
  };

  const mapFilterTypeToWebAudio = (type: FilterType): BiquadFilterType => {
    switch (type) {
      case 'highpass': return 'highpass';
      case 'lowpass': return 'lowpass';
      case 'lowshelf': return 'lowshelf';
      case 'highshelf': return 'highshelf';
      case 'notch': return 'notch';
      default: return 'peaking';
    }
  };

  // Synchronize Web Audio DSP Nodes when state changes
  useEffect(() => {
    if (!audioCtxRef.current || filterNodesRef.current.length !== bands.length) return;
    const ctx = audioCtxRef.current;

    if (inputGainNodeRef.current) {
      const g = Math.pow(10, inputGainDb / 20);
      inputGainNodeRef.current.gain.setValueAtTime(g, ctx.currentTime);
    }
    if (outputGainNodeRef.current) {
      const g = Math.pow(10, outputGainDb / 20);
      outputGainNodeRef.current.gain.setValueAtTime(g, ctx.currentTime);
    }

    // Check if any band is soloed
    const hasSolo = bands.some(b => b.solo);

    bands.forEach((b, idx) => {
      const node = filterNodesRef.current[idx];
      if (!node) return;

      const bypassed =
        globalBypass ||
        Boolean(b.bypass) ||
        !b.enabled ||
        (hasSolo && !b.solo);

      node.type = bypassed ? 'allpass' : mapFilterTypeToWebAudio(b.type);
      node.frequency.setTargetAtTime(b.freq, ctx.currentTime, 0.01);
      node.Q.setTargetAtTime(b.q, ctx.currentTime, 0.01);
      node.gain.setTargetAtTime(bypassed ? 0 : b.gain, ctx.currentTime, 0.01);
    });
  }, [bands, globalBypass, inputGainDb, outputGainDb]);

  // Real analyser-driven level metering. Values come from the processed Web Audio
  // signal, not from decorative animation.
  useEffect(() => {
    if (!isPlaying || !analyserRef.current) return;

    const analyser = analyserRef.current;
    const timeDomain = new Float32Array(analyser.fftSize);

    const updateMeters = (timestamp: number) => {
      analyser.getFloatTimeDomainData(timeDomain);

      if (timestamp - lastMeterUpdateRef.current >= 100) {
        let peak = 0;
        let sumSquares = 0;

        for (let index = 0; index < timeDomain.length; index += 1) {
          const sample = timeDomain[index];
          peak = Math.max(peak, Math.abs(sample));
          sumSquares += sample * sample;
        }

        const rms = Math.sqrt(sumSquares / Math.max(1, timeDomain.length));
        const rmsDb = Math.max(-60, 20 * Math.log10(rms + 1e-9));
        const peakDb = Math.max(-60, 20 * Math.log10(peak + 1e-9));

        setMetrics(previous => ({
          ...previous,
          lufs: Number(rmsDb.toFixed(1)),
          truePeakDbtp: Number(peakDb.toFixed(1)),
          peakL: Number(peak.toFixed(3)),
          peakR: Number(peak.toFixed(3))
        }));

        lastMeterUpdateRef.current = timestamp;
      }

      meterFrameRef.current = requestAnimationFrame(updateMeters);
    };

    meterFrameRef.current = requestAnimationFrame(updateMeters);

    return () => {
      if (meterFrameRef.current !== null) {
        cancelAnimationFrame(meterFrameRef.current);
        meterFrameRef.current = null;
      }
    };
  }, [isPlaying]);

  useEffect(() => () => {
    if (meterFrameRef.current !== null) {
      cancelAnimationFrame(meterFrameRef.current);
    }
    void audioCtxRef.current?.close();
  }, []);

  // Handle Preset Selection
  const applyPreset = (preset: EqPreset) => {
    setSelectedPresetId(preset.id);
    setBands(prevBands =>
      prevBands.map(b => {
        const pBand = preset.bands[b.freq];
        if (pBand) {
          return {
            ...b,
            gain: pBand.gain !== undefined ? pBand.gain : b.gain,
            q: pBand.q !== undefined ? pBand.q : b.q,
            type: pBand.type || b.type,
            enabled: pBand.enabled !== undefined ? pBand.enabled : true,
            bypass: false,
            solo: false
          };
        } else {
          return { ...b, gain: 0, enabled: true, bypass: false, solo: false };
        }
      })
    );
  };

  // Single Band Parameter Handlers
  const updateBand = (id: string, updates: Partial<EqBandConfig>) => {
    setSelectedPresetId('custom');
    setBands(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const resetBand = (id: string) => {
    setBands(prev => prev.map(b => b.id === id ? { ...b, gain: 0, q: 1.0, enabled: true, solo: false, bypass: false } : b));
  };

  const resetAllBands = () => {
    setBands(INITIAL_BANDS.map(b => ({ ...b, solo: false, bypass: false })));
    setSelectedPresetId('flat');
    setInputGainDb(0);
    setOutputGainDb(0);
    setGlobalBypass(false);
  };

  // Selected Band Object
  const selectedBand = useMemo(() => bands.find(b => b.id === selectedBandId) || bands[0], [bands, selectedBandId]);

  // Audio Playback Toggle
  const togglePlay = () => {
    if (!hasAudio) {
      setBackendNotice('Generate a track first to enable real-time EQ audition.');
      return;
    }
    initWebAudio();
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play()
          .then(() => setIsPlaying(true))
          .catch((err) => {
            console.warn('Audio play failed:', err);
            setBackendNotice('Playback could not start. Check the browser audio permission and try again.');
            setIsPlaying(false);
          });
      }
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  // Draw Interactive Frequency Response Canvas (20Hz to 20kHz, -24dB to +24dB)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const width = canvas.width;
    const height = canvas.height;

    const renderCanvas = () => {
      ctx.clearRect(0, 0, width, height);

      // Background Grid
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);

      // Draw Grid Lines (dB: +24, +12, 0, -12, -24)
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;

      const dbValues = [24, 12, 0, -12, -24];
      dbValues.forEach(db => {
        const y = height / 2 - (db / 24) * (height / 2 - 15);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        ctx.fillStyle = db === 0 ? '#94a3b8' : '#475569';
        ctx.font = '10px monospace';
        ctx.fillText(`${db > 0 ? '+' : ''}${db}dB`, 10, y - 3);
      });

      // Frequency Grid Lines (100Hz, 1kHz, 10kHz)
      const fLines = [100, 1000, 10000];
      fLines.forEach(freq => {
        const logMin = Math.log10(20);
        const logMax = Math.log10(20000);
        const logF = Math.log10(freq);
        const x = ((logF - logMin) / (logMax - logMin)) * width;

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        ctx.fillStyle = '#475569';
        ctx.font = '10px monospace';
        ctx.fillText(`${freq >= 1000 ? freq / 1000 + 'k' : freq}Hz`, x + 4, height - 8);
      });

      // Live spectrum from the post-EQ analyser.
      if (isPlaying && analyserRef.current) {
        const analyser = analyserRef.current;
        const spectrum = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(spectrum);
        ctx.fillStyle = 'rgba(168, 85, 247, 0.22)';

        const visibleBars = 64;
        const barWidth = width / visibleBars;
        for (let index = 0; index < visibleBars; index += 1) {
          const sourceIndex = Math.floor((index / visibleBars) * spectrum.length);
          const magnitude = spectrum[sourceIndex] / 255;
          const barHeight = magnitude * (height * 0.48);
          ctx.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight);
        }
      }

      // Compute & Render Frequency Response Curve
      ctx.beginPath();
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2.5;

      const hasSolo = bands.some(b => b.solo);

      for (let px = 0; px < width; px += 2) {
        const logMin = Math.log10(20);
        const logMax = Math.log10(20000);
        const logF = logMin + (px / width) * (logMax - logMin);
        const freq = Math.pow(10, logF);

        // Sum magnitude response across active bands
        let totalGainDb = 0;

        if (!globalBypass) {
          bands.forEach(b => {
            if (!b.enabled || b.bypass || (hasSolo && !b.solo)) return;
            const fRatio = freq / b.freq;
            let magDb = 0;

            if (b.type === 'bell') {
              const bandwidth = 1.0 / Math.max(0.1, b.q);
              magDb = b.gain / (1.0 + Math.pow((fRatio - 1.0 / fRatio) / bandwidth, 2));
            } else if (b.type === 'lowshelf') {
              magDb = b.gain / (1.0 + Math.pow(fRatio, 2));
            } else if (b.type === 'highshelf') {
              magDb = b.gain / (1.0 + Math.pow(1.0 / fRatio, 2));
            } else if (b.type === 'highpass') {
              magDb = fRatio < 1 ? -24 * Math.log2(1.0 / fRatio) : 0;
            } else if (b.type === 'lowpass') {
              magDb = fRatio > 1 ? -24 * Math.log2(fRatio) : 0;
            } else if (b.type === 'notch') {
              magDb = Math.abs(freq - b.freq) < b.freq * 0.1 ? -24 : 0;
            }

            totalGainDb += magDb;
          });
        }

        const py = height / 2 - (Math.max(-24, Math.min(24, totalGainDb)) / 24) * (height / 2 - 15);
        if (px === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Draw Gradient Fill Under Curve
      ctx.lineTo(width, height / 2);
      ctx.lineTo(0, height / 2);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, 'rgba(192, 132, 252, 0.25)');
      grad.addColorStop(1, 'rgba(192, 132, 252, 0.0)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Render Band Nodes
      bands.forEach(b => {
        const logMin = Math.log10(20);
        const logMax = Math.log10(20000);
        const logF = Math.log10(b.freq);
        const nx = ((logF - logMin) / (logMax - logMin)) * width;
        const ny = height / 2 - (Math.max(-24, Math.min(24, b.gain)) / 24) * (height / 2 - 15);

        ctx.beginPath();
        ctx.arc(nx, ny, b.id === selectedBandId ? 7 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = b.id === selectedBandId ? '#a855f7' : (b.enabled ? '#38bdf8' : '#64748b');
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      animId = requestAnimationFrame(renderCanvas);
    };

    renderCanvas();
    return () => cancelAnimationFrame(animId);
  }, [bands, selectedBandId, globalBypass, isPlaying]);

  // Execute Server-Side WAV Processing
  const processServerAudio = async () => {
    if (!hasAudio) {
      setBackendNotice('Generate a track first to render an equalized master.');
      return;
    }
    setIsProcessingBackend(true);
    setBackendNotice(null);
    try {
      const res = await fetch('/api/eq/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bands,
          audioUrl: currentAudioUrl || audioUrl,
          inputGainDb,
          outputGainDb,
          globalBypass
        })
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.error || `EQ processing failed with HTTP ${res.status}`);
      }
      if (data.status === 'success') {
        setMetrics({
          lufs: data.metrics.lufs,
          truePeakDbtp: data.metrics.truePeakDbtp,
          peakL: data.metrics.peakL,
          peakR: data.metrics.peakR,
          gainReductionDb: 0.0,
          stereoPhaseCorrelation: data.metrics.stereoPhaseCorrelation
        });

        if (data.audioUrl) {
          setCurrentAudioUrl(data.audioUrl);
          if (onProcessedAudio) {
            onProcessedAudio(data.audioUrl, data.metrics);
          }
        }

        setBackendNotice(`EQ Processing Complete! Audio rendered & mastered at ${data.metrics.lufs} LUFS, ${data.metrics.truePeakDbtp} dBTP (${data.metrics.activeBandsCount} active filters applied). Saved to ${data.audioUrl}`);
      }
    } catch (e) {
      console.error('EQ process failed', e);
      setBackendNotice('Server EQ processing failed. Please try again.');
    } finally {
      setIsProcessingBackend(false);
    }
  };

  // Save Custom User Preset
  const handleSavePreset = () => {
    if (!savePresetName.trim()) return;
    const newPreset: EqPreset = {
      id: `user_${Date.now()}`,
      name: savePresetName.trim(),
      category: 'User Custom',
      description: 'Custom user defined parametric EQ curve',
      bands: bands.reduce((acc, b) => {
        if (b.gain !== 0 || b.type !== 'bell') {
          acc[b.freq] = { gain: b.gain, q: b.q, type: b.type, enabled: b.enabled };
        }
        return acc;
      }, {} as any)
    };

    setPresets(prev => [newPreset, ...prev]);
    setSelectedPresetId(newPreset.id);
    setSavePresetName('');
    setSaveStatus('Preset saved successfully!');
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // Export Preset JSON
  const handleExportPreset = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bands, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `Sonara_EQ_Preset_${selectedPresetId}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  };

  // Filter bands for active group display
  const filteredBands = useMemo(() => {
    if (activeGroup === 'ALL') return bands;
    return bands.filter(b => b.group === activeGroup);
  }, [bands, activeGroup]);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top Header & Toolbar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-slate-900/90 border border-slate-800 p-5 rounded-xl gap-4 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-purple-600/20 border border-purple-500/30 rounded-lg">
            <Sliders className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Professional Audio Equalizer
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-500/30 rounded-full">
                26-BAND PARAMETRIC DSP
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Cascaded Direct Form II Biquad Filter Engine • Real-time Playback & Production Export
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={togglePlay}
            disabled={!hasAudio}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-md ${
              isPlaying ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span>{isPlaying ? 'Pause EQ Audition' : 'Real-time Audition'}</span>
          </button>

          <button
            onClick={() => setGlobalBypass(!globalBypass)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
              globalBypass ? 'bg-red-950/50 border-red-500/50 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            {globalBypass ? 'BYPASSED' : 'Bypass EQ'}
          </button>

          <button
            onClick={resetAllBands}
            className="flex items-center space-x-1 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>

          <button
            onClick={processServerAudio}
            disabled={isProcessingBackend || !hasAudio}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            <span>{isProcessingBackend ? 'Rendering DSP...' : 'Render & Export Master'}</span>
          </button>
        </div>
      </div>

      {backendNotice && (
        <div className="flex items-center space-x-2 p-3 bg-emerald-950/50 border border-emerald-500/40 rounded-lg text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <span>{backendNotice}</span>
        </div>
      )}

      {!hasAudio && !backendNotice && (
        <div className="flex items-center space-x-2 rounded-lg border border-purple-500/30 bg-purple-950/30 p-3 text-xs text-purple-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-purple-400" />
          <span>The equalizer is ready. Generate a track to activate real-time audition and master export.</span>
        </div>
      )}

      {hasAudio && (
        <div className="rounded-xl border border-emerald-500/30 bg-slate-900 p-4 shadow-xl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Live DSP Monitor</p>
              <p className="text-[11px] text-slate-400">This player is routed through all active EQ bands, input gain and output gain.</p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
              globalBypass
                ? 'border-red-500/40 bg-red-950/40 text-red-300'
                : 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
            }`}>
              {globalBypass ? 'DSP BYPASSED' : 'DSP ACTIVE'}
            </span>
          </div>

          <audio
            ref={audioRef}
            src={currentAudioUrl || undefined}
            controls
            preload="metadata"
            crossOrigin="anonymous"
            onPlay={() => {
              initWebAudio();
              setIsPlaying(true);
            }}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            className="w-full"
          />
        </div>
      )}

      {/* Main Equalizer Display & Metering Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Interactive Response Curve Canvas (3 Cols) */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-purple-400" />
              <span className="text-xs font-bold text-slate-200">Magnitude Response (20Hz - 20kHz)</span>
            </div>

            {/* Frequency Group Selector */}
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveGroup('ALL')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded ${
                  activeGroup === 'ALL' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All (26 Bands)
              </button>
              {FREQ_GROUPS.map(g => (
                <button
                  key={g.name}
                  onClick={() => setActiveGroup(g.name)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-all ${
                    activeGroup === g.name ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full h-64 bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
            <canvas ref={canvasRef} width={800} height={256} className="w-full h-full cursor-crosshair" />
          </div>

          {/* Preset Selector Strip */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">18 Professional Genre Presets</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleExportPreset}
                  className="flex items-center space-x-1 px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
                >
                  <Download className="h-3 w-3" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
              {presets.map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                    selectedPresetId === p.id
                      ? 'bg-purple-600 border-purple-500 text-white shadow-md shadow-purple-600/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Master Metering & Audit Panel (1 Col) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5 shadow-xl">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
            <Radio className="h-4 w-4 text-purple-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Master Metrics & Meters</h3>
          </div>

          {/* Level Sliders */}
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Input Gain</span>
                <span className="font-mono text-purple-300">{inputGainDb > 0 ? '+' : ''}{inputGainDb} dB</span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={inputGainDb}
                onChange={e => setInputGainDb(parseFloat(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Output Gain</span>
                <span className="font-mono text-purple-300">{outputGainDb > 0 ? '+' : ''}{outputGainDb} dB</span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={outputGainDb}
                onChange={e => setOutputGainDb(parseFloat(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>
          </div>

          {/* Meters Grid */}
          <div className="space-y-3 pt-2">
            {/* Peak Meter */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400">Peak Level (L/R)</span>
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono text-slate-500 w-3">L</span>
                  <div className="flex-1 h-2 bg-slate-900 rounded overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, metrics.peakL * 100)}%` }} />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono text-slate-500 w-3">R</span>
                  <div className="flex-1 h-2 bg-slate-900 rounded overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, metrics.peakR * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* LUFS & True Peak */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 block">{isPlaying ? 'Live RMS' : 'Measured Loudness'}</span>
                <span className="text-sm font-bold font-mono text-emerald-400">{metrics.lufs} LUFS</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 block">True Peak</span>
                <span className="text-sm font-bold font-mono text-cyan-400">{metrics.truePeakDbtp} dBTP</span>
              </div>
            </div>

            {/* Stereo Phase Correlation */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Stereo Phase</span>
                <span className="font-mono text-purple-300">+{metrics.stereoPhaseCorrelation}</span>
              </div>
              <div className="h-2 bg-slate-900 rounded overflow-hidden flex">
                <div className="h-full bg-purple-500" style={{ width: `${((metrics.stereoPhaseCorrelation + 1) / 2) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Custom Preset Save */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <span className="text-xs font-semibold text-slate-300">Save Custom Preset</span>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Preset Name..."
                value={savePresetName}
                onChange={e => setSavePresetName(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={handleSavePreset}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded"
              >
                Save
              </button>
            </div>
            {saveStatus && <p className="text-[11px] text-emerald-400">{saveStatus}</p>}
          </div>
        </div>
      </div>

      {/* Selected Band Inspector & Parametric Bands Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 shadow-xl">
        {/* Selected Band Detailed Controls */}
        <div className="bg-slate-950 border border-purple-500/30 p-5 rounded-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-3">
              <span className="px-2.5 py-1 text-xs font-extrabold bg-purple-600 text-white rounded">
                BAND {selectedBand.freq >= 1000 ? `${selectedBand.freq / 1000}kHz` : `${selectedBand.freq}Hz`}
              </span>
              <span className="text-xs text-slate-400">Section: <strong className="text-slate-200">{selectedBand.group}</strong></span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => updateBand(selectedBand.id, { enabled: !selectedBand.enabled })}
                className={`px-2.5 py-1 text-xs font-semibold rounded border ${
                  selectedBand.enabled ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}
              >
                {selectedBand.enabled ? 'ENABLED' : 'DISABLED'}
              </button>

              <button
                onClick={() => updateBand(selectedBand.id, { solo: !selectedBand.solo })}
                className={`px-2 py-1 text-xs font-semibold rounded border ${
                  selectedBand.solo ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                SOLO
              </button>

              <button
                onClick={() => updateBand(selectedBand.id, { bypass: !selectedBand.bypass })}
                className={`px-2 py-1 text-xs font-semibold rounded border ${
                  selectedBand.bypass ? 'bg-red-600 text-white border-red-500' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                BYPASS
              </button>

              <button
                onClick={() => resetBand(selectedBand.id)}
                className="px-2 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Reset Band
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Filter Type */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Filter Type</label>
              <select
                value={selectedBand.type}
                onChange={e => updateBand(selectedBand.id, { type: e.target.value as FilterType })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-xs font-semibold text-purple-300 focus:outline-none focus:border-purple-500"
              >
                <option value="bell">Bell / Peak</option>
                <option value="highpass">High Pass</option>
                <option value="lowpass">Low Pass</option>
                <option value="highshelf">High Shelf</option>
                <option value="lowshelf">Low Shelf</option>
                <option value="notch">Notch</option>
              </select>
            </div>

            {/* Frequency */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Frequency</span>
                <span className="font-mono text-purple-300">{selectedBand.freq} Hz</span>
              </div>
              <input
                type="range"
                min="20"
                max="20000"
                value={selectedBand.freq}
                onChange={e => updateBand(selectedBand.id, { freq: parseInt(e.target.value) })}
                className="w-full accent-purple-500"
              />
            </div>

            {/* Gain */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Gain (dB)</span>
                <span className="font-mono text-purple-300">{selectedBand.gain > 0 ? '+' : ''}{selectedBand.gain} dB</span>
              </div>
              <input
                type="range"
                min="-24"
                max="24"
                step="0.5"
                value={selectedBand.gain}
                onChange={e => updateBand(selectedBand.id, { gain: parseFloat(e.target.value) })}
                className="w-full accent-purple-500"
              />
            </div>

            {/* Q Factor */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Q Factor</span>
                <span className="font-mono text-purple-300">{selectedBand.q}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="18.0"
                step="0.1"
                value={selectedBand.q}
                onChange={e => updateBand(selectedBand.id, { q: parseFloat(e.target.value) })}
                className="w-full accent-purple-500"
              />
            </div>
          </div>
        </div>

        {/* 26-Band Parameter Sliders Matrix */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">26-Band Parametric Console</h3>
            <span className="text-[11px] text-slate-500">Click any band to adjust in detail</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 lg:grid-cols-13 gap-2">
            {filteredBands.map(b => (
              <div
                key={b.id}
                onClick={() => setSelectedBandId(b.id)}
                className={`p-2 rounded-lg border flex flex-col items-center cursor-pointer transition-all ${
                  selectedBandId === b.id
                    ? 'bg-purple-950/80 border-purple-500 shadow-md shadow-purple-900/40'
                    : b.gain !== 0
                    ? 'bg-slate-950 border-slate-700'
                    : 'bg-slate-950/50 border-slate-850 hover:border-slate-700'
                }`}
              >
                <span className="text-[10px] font-mono text-slate-400 font-bold mb-1">
                  {b.freq >= 1000 ? `${b.freq / 1000}k` : b.freq}
                </span>

                <div className="h-20 flex items-center py-1">
                  <input
                    type="range"
                    min="-24"
                    max="24"
                    step="0.5"
                    value={b.gain}
                    onChange={e => {
                      e.stopPropagation();
                      updateBand(b.id, { gain: parseFloat(e.target.value) });
                    }}
                    className="h-16 -rotate-90 accent-purple-500 cursor-pointer w-12"
                  />
                </div>

                <span className={`text-[10px] font-mono font-bold mt-1 ${b.gain > 0 ? 'text-emerald-400' : b.gain < 0 ? 'text-pink-400' : 'text-slate-500'}`}>
                  {b.gain > 0 ? `+${b.gain}` : b.gain}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
