import React, { useState } from 'react';
import { 
  Music, 
  Cpu, 
  Workflow, 
  Layers, 
  Database, 
  ShieldCheck, 
  X, 
  CheckCircle2, 
  Send, 
  Activity,
  History,
  Settings,
  RefreshCcw,
  Sliders,
  Radio,
  Download
} from 'lucide-react';

interface MusicProviderEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MusicProviderEngineModal: React.FC<MusicProviderEngineModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'prompt' | 'pipeline' | 'imports' | 'settings'>('providers');
  const [selectedProvider, setSelectedProvider] = useState('Udio');
  const [promptData, setPromptData] = useState({
    title: 'Neon Odyssey',
    genre: 'Cyberpunk Synthwave',
    mood: 'Energetic & Dark',
    tempo: '128 BPM',
    instruments: 'Analog Synthesizers, 809 Bass, Vocoder',
    lyrics: 'Neon lights flashing in the rain...\nElectric dreams we cannot contain...',
  });
  const [providers, setProviders] = useState([
    { id: 'udio', name: 'Udio', status: 'Ready for Official Integration', active: true },
    { id: 'suno', name: 'Suno', status: 'Waiting Official Platform Access', active: false },
    { id: 'lyria', name: 'Google Lyria', status: 'Future Integration', active: false },
    { id: 'stable_audio', name: 'Stable Audio', status: 'Future Integration', active: false },
    { id: 'custom', name: 'Custom Provider API', status: 'Supported', active: true },
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none font-sans">
      <div className="bg-[#0b1021] border border-cyan-500/30 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400">
              <Radio size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">Universal Music Provider Engine (Version 2.1)</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold">MULTI-PROVIDER ROUTER</span>
              </div>
              <p className="text-xs text-slate-400">Udio, Suno, Google Lyria, Stable Audio & Custom Music Provider Architecture</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="px-6 py-3 bg-slate-900/50 border-b border-slate-800 flex items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('providers')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'providers' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            Music Providers ({providers.filter(p => p.active).length} Active)
          </button>
          <button
            onClick={() => setActiveTab('prompt')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'prompt' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            Universal Prompt Builder
          </button>
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'pipeline' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            Generation Pipeline
          </button>
          <button
            onClick={() => setActiveTab('imports')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'imports' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            Import System & Stems
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'settings' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            Provider Fallback & Vault
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-300">
          {activeTab === 'providers' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <h3 className="text-sm font-black text-white">Registered Music Generation Providers</h3>
              <div className="space-y-2 font-mono text-[11px]">
                {providers.map(p => (
                  <div key={p.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-white text-xs">{p.name}</div>
                      <div className="text-[10px] text-cyan-400 mt-1">Status: {p.status}</div>
                    </div>
                    <button
                      onClick={() => setSelectedProvider(p.name)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors ${
                        selectedProvider === p.name ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {selectedProvider === p.name ? 'Selected Provider' : 'Select'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'prompt' && (
            <div className="grid grid-cols-2 gap-6 max-w-5xl mx-auto">
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                <h3 className="text-sm font-black text-white">Universal Prompt Builder</h3>
                <div className="space-y-2 text-xs">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Song Title</label>
                    <input 
                      type="text" 
                      value={promptData.title}
                      onChange={(e) => setPromptData({...promptData, title: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white" 
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Genre & Style</label>
                    <input 
                      type="text" 
                      value={promptData.genre}
                      onChange={(e) => setPromptData({...promptData, genre: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white" 
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Mood & Energy</label>
                    <input 
                      type="text" 
                      value={promptData.mood}
                      onChange={(e) => setPromptData({...promptData, mood: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white" 
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Tempo & Instruments</label>
                    <input 
                      type="text" 
                      value={promptData.tempo}
                      onChange={(e) => setPromptData({...promptData, tempo: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white" 
                    />
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <h3 className="text-sm font-black text-white">Lyrics & Execution Config</h3>
                  <textarea 
                    rows={6}
                    value={promptData.lyrics}
                    onChange={(e) => setPromptData({...promptData, lyrics: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono text-xs resize-none"
                  />
                </div>
                <button className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20">
                  <Send size={14} /> Generate via {selectedProvider}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'pipeline' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <h3 className="text-sm font-black text-white">Generation Pipeline Telemetry</h3>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-400 flex items-center gap-2">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>Pipeline active: Workspace → Prompt Builder → {selectedProvider} → Stems → Workspace Sync</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'imports' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <h3 className="text-sm font-black text-white">Song & Stem Import System</h3>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 border-dashed text-center space-y-2">
                  <Download size={24} className="mx-auto text-cyan-400" />
                  <div className="font-bold text-white">Drag & Drop External Audio, Stems, or Metadata JSON</div>
                  <div className="text-[10px] text-slate-400">Supports WAV, FLAC, MP3 up to 500MB</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <h3 className="text-sm font-black text-white">Provider Fallback & Encrypted Vault</h3>
                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span>Automatic Fallback Provider</span>
                    <span className="text-emerald-400 font-bold font-mono">Custom Provider API</span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span>Credential Vault Encryption</span>
                    <span className="text-emerald-400 font-bold font-mono">AES-256 Active</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MusicProviderEngineModal;
