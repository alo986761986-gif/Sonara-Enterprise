import React, { useState } from 'react';
import { 
  Music, 
  Sparkles, 
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
  Download,
  FileText
} from 'lucide-react';

interface MusicCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MusicCreatorModal: React.FC<MusicCreatorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'creator' | 'builder' | 'history' | 'export'>('creator');
  const [songTitle, setSongTitle] = useState('Neon Horizon');
  const [artistName, setArtistName] = useState('Sonara AI Creator');
  const [genre, setGenre] = useState('Cyberpunk Synthwave');
  const [mood, setMood] = useState('Energetic & Futuristic');
  const [tempo, setTempo] = useState('128');
  const [key, setKey] = useState('Am');
  const [lyrics, setLyrics] = useState('Neon lights on cyber streets...\nElectric pulses in our beats...');
  const [generationStatus, setGenerationStatus] = useState<string>('Ready');
  const [isGenerating, setIsGenerating] = useState(false);
  const [versions, setVersions] = useState([
    { id: 'v1', name: 'Version 1.0 (Original Master)', date: 'Just now', status: 'Completed' }
  ]);

  if (!isOpen) return null;

  const handleStartGeneration = () => {
    setIsGenerating(true);
    setGenerationStatus('Preparing...');
    setTimeout(() => setGenerationStatus('Sending to Provider...'), 600);
    setTimeout(() => setGenerationStatus('Generating Audio Stems...'), 1400);
    setTimeout(() => setGenerationStatus('Importing into Workspace...'), 2200);
    setTimeout(() => {
      setGenerationStatus('Completed');
      setIsGenerating(false);
      setVersions(prev => [
        { id: `v${prev.length + 1}`, name: `Version ${prev.length + 1}.0 (${genre})`, date: 'Just now', status: 'Completed' },
        ...prev
      ]);
    }, 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none font-sans">
      <div className="bg-[#0b1021] border border-cyan-500/30 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400">
              <Music size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">Music Creator Studio (Version 2.1)</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold">AI STUDIO PRO</span>
              </div>
              <p className="text-xs text-slate-400">Professional Song Creation, Smart Prompt Builder, Universal Provider Routing & Workspace Auto-Sync</p>
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
            onClick={() => setActiveTab('creator')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'creator' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            Song Studio
          </button>
          <button
            onClick={() => setActiveTab('builder')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'builder' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            Smart Prompt Preview
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'history' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            Version History ({versions.length})
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'export' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            Export & Marketplace Draft
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-300">
          {activeTab === 'creator' && (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 space-y-4">
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <h3 className="text-sm font-black text-white">Song Configuration & Parameters</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Song Title</label>
                      <input 
                        type="text" 
                        value={songTitle}
                        onChange={(e) => setSongTitle(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white" 
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Artist Name</label>
                      <input 
                        type="text" 
                        value={artistName}
                        onChange={(e) => setArtistName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white" 
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Genre & Subgenre</label>
                      <input 
                        type="text" 
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white" 
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Mood & Energy</label>
                      <input 
                        type="text" 
                        value={mood}
                        onChange={(e) => setMood(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white" 
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Tempo (BPM)</label>
                      <input 
                        type="text" 
                        value={tempo}
                        onChange={(e) => setTempo(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white" 
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Musical Key</label>
                      <input 
                        type="text" 
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white" 
                      />
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <h3 className="text-sm font-black text-white">Lyrics Editor</h3>
                  <textarea 
                    rows={6}
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono text-xs resize-none"
                  />
                </div>
              </div>

              <div className="col-span-1 space-y-4">
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4 flex flex-col justify-between h-full">
                  <div className="space-y-3">
                    <h3 className="text-sm font-black text-white">Generation Control Center</h3>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <div className="text-[10px] text-slate-400 font-mono uppercase">Status Telemetry</div>
                      <div className="text-cyan-400 font-mono font-bold text-xs flex items-center gap-2">
                        <Activity size={14} className={isGenerating ? 'animate-spin text-cyan-400' : ''} />
                        <span>{generationStatus}</span>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={handleStartGeneration}
                    disabled={isGenerating}
                    className="w-full py-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-colors"
                  >
                    <Sparkles size={14} /> {isGenerating ? 'Generating Song...' : 'Generate Song Studio'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'builder' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <h3 className="text-sm font-black text-white">Smart Prompt Builder Preview</h3>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-300 leading-relaxed">
                  [PROMPT_ENGINE v2.1]: Title: "{songTitle}" | Artist: "{artistName}" | Genre: {genre} | Mood: {mood} | Tempo: {tempo} BPM | Key: {key} | Lyrics: "{lyrics.replace(/\n/g, ' ')}"
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <h3 className="text-sm font-black text-white">Project Song Versions & History</h3>
              <div className="space-y-2">
                {versions.map(v => (
                  <div key={v.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex justify-between items-center font-mono text-xs">
                    <div>
                      <span className="font-bold text-white">{v.name}</span>
                      <div className="text-[10px] text-slate-400 mt-0.5">{v.date}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">{v.status}</span>
                      <button className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold">Compare</button>
                      <button className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold">Regenerate</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'export' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <h3 className="text-sm font-black text-white">Export Package & Automatic Marketplace Draft</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="font-bold text-white text-xs">Full Project Bundle (.zip)</div>
                    <div className="text-[10px] text-slate-400">Includes Audio Stems, Lyrics TXT, JSON Metadata, Cover Art, and Prompt Log.</div>
                    <button className="w-full py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors">Download Package</button>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="font-bold text-white text-xs">Marketplace Draft Sync</div>
                    <div className="text-[10px] text-slate-400">Automatically publish or save draft to Marketplace catalog with generated SEO tags.</div>
                    <button className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors">Publish Draft to Marketplace</button>
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

export default MusicCreatorModal;
