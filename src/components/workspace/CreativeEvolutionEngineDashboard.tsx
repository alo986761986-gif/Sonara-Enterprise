// CreativeEvolutionEngineDashboard.tsx - Sonara Creative Evolution Engine Visual Console
import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  Plus,
  Trash2,
  Database,
  Sliders,
  Flame,
  Activity,
  Heart,
  Music,
  Check,
  Disc,
  ArrowRight,
  GitPullRequest,
  Binary,
  Atom,
  Settings,
  Zap,
  TrendingUp,
  AlertTriangle,
  Layers,
  HelpCircle
} from 'lucide-react';

export interface CreativeIdea {
  id: string;
  category: 'genre' | 'subgenre' | 'mood' | 'chord_progression' | 'bassline' | 'drum_pattern' | 'orchestral' | 'transition' | 'intro' | 'outro' | 'bridge' | 'drop' | 'breakdown' | 'style_signature';
  name: string;
  description: string;
  novelty: number;
  compatibility: string[];
  successProbability: number;
  creativeScore: number;
  creativeIndex: number;
  parentIds?: string[];
  parameters: {
    key?: string;
    bpm?: number;
    intensityPattern?: number[];
    instruments?: string[];
    chordSequence?: string[];
    tempoSignature?: string;
    styleRoots?: string[];
  };
  passedQualityEngine: boolean;
  qualityScore?: number;
  timestamp: string;
}

export interface DnaElement {
  id: string;
  category: string;
  name: string;
  description: string;
  idealBpm: number;
  key: string;
  energy: number;
  intensity: number;
  compatibility: string[];
  qualityScore: number;
}

export const CreativeEvolutionEngineDashboard: React.FC = () => {
  const [ideas, setIdeas] = useState<CreativeIdea[]>([]);
  const [dnaElements, setDnaElements] = useState<DnaElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [creativeIndex, setCreativeIndex] = useState<number>(50);
  const [generating, setGenerating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  // Mutation sandbox state
  const [selectedBaseElement, setSelectedBaseElement] = useState<string>('');
  const [sandboxCreativeIndex, setSandboxCreativeIndex] = useState<number>(60);
  const [mutatedResult, setMutatedResult] = useState<any>(null);
  const [mutating, setMutating] = useState(false);

  // Custom genre builder input
  const [customGenreContext, setCustomGenreContext] = useState<string>('');

  const fetchIdeasAndDna = async () => {
    try {
      setLoading(true);
      const [ideasRes, dnaRes] = await Promise.all([
        fetch('/api/music/evolution/ideas'),
        fetch('/api/music/dna/elements')
      ]);

      if (ideasRes.ok) {
        const data = await ideasRes.json();
        if (data.success) {
          setIdeas(data.ideas || []);
        }
      }

      if (dnaRes.ok) {
        const data = await dnaRes.json();
        if (data.success) {
          setDnaElements(data.elements || []);
          if (data.elements?.length > 0 && !selectedBaseElement) {
            setSelectedBaseElement(data.elements[0].id);
          }
        }
      }
    } catch (err) {
      console.error('[EVOLUTION_FRONTEND] Fetching error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIdeasAndDna();
  }, []);

  // Mutate pattern in local sandbox (using client-side simulation aligned with backend)
  const handleMutateSandbox = () => {
    if (!selectedBaseElement) return;
    setMutating(true);
    const base = dnaElements.find(el => el.id === selectedBaseElement);
    if (!base) {
      setMutating(false);
      return;
    }

    // Client-side visual preview of the backend APIs mutateHarmony, mutateRhythm, mutateStructure
    setTimeout(() => {
      const isHarmony = base.category === 'chord_progression';
      const isRhythm = base.category === 'drum_pattern';
      
      const bpmDelta = Math.round((sandboxCreativeIndex / 10) * (Math.random() > 0.5 ? 1 : -1));
      const targetBpm = base.idealBpm + bpmDelta;
      
      let chords = ['i', 'VI', 'VII', 'v'];
      let instruments = base.compatibility;
      
      if (isHarmony) {
        if (sandboxCreativeIndex > 40) {
          chords = ['i(add9)', 'VI(maj7)', 'iv7', 'v9'];
        }
        if (sandboxCreativeIndex > 70) {
          chords = ['i(add9)', 'VI(maj7)', 'bVIdim', 'v7', 'bII7'];
        }
      }

      if (isRhythm) {
        if (sandboxCreativeIndex > 50) {
          instruments = ['Kick 808', 'Trap Snare', 'Glitch Percussion'];
        }
        if (sandboxCreativeIndex > 80) {
          instruments = ['Granular Organic Percussion', 'FM Sub-Kick', 'Micro-Metal Hat'];
        }
      }

      setMutatedResult({
        id: `mutated_${base.id}_${Date.now()}`,
        name: `Mutated ${base.name}`,
        bpm: targetBpm,
        key: isHarmony && sandboxCreativeIndex > 30 ? 'E minor' : base.key,
        chords: isHarmony ? chords : undefined,
        instruments: instruments.slice(0, 4),
        noveltyScore: Math.min(100, Math.round(sandboxCreativeIndex * 1.15)),
        successProbability: Math.max(12, Math.round(100 - sandboxCreativeIndex * 0.75)),
        qualityRating: Math.round(82 + Math.random() * 15)
      });
      setMutating(false);
    }, 450);
  };

  useEffect(() => {
    if (selectedBaseElement) {
      handleMutateSandbox();
    }
  }, [selectedBaseElement, sandboxCreativeIndex, dnaElements]);

  const handleGenerateIdea = async (category?: string) => {
    try {
      setGenerating(true);
      const res = await fetch('/api/music/evolution/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creativeIndex,
          category,
          context: customGenreContext ? { suggestedName: customGenreContext } : {}
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setIdeas(prev => [data.idea, ...prev]);
          setCustomGenreContext('');
        }
      }
    } catch (err) {
      console.error('[EVOLUTION_FRONTEND] Idea generation failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handlePromoteToDna = async (ideaId: string) => {
    try {
      setPromotingId(ideaId);
      // Simulated Quality Engine check: determines a score. If >= 85, saves to DNA Library
      const calculatedScore = Math.round(75 + Math.random() * 23); // 75 to 98

      const res = await fetch('/api/music/evolution/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ideaId,
          qualityScore: calculatedScore
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // Update local ideas list state
          setIdeas(prev => prev.map(id => {
            if (id.id === ideaId) {
              return {
                ...id,
                passedQualityEngine: calculatedScore >= 85,
                qualityScore: calculatedScore
              };
            }
            return id;
          }));

          // Re-fetch DNA elements to display the newly integrated seed
          if (calculatedScore >= 85) {
            const dnaRes = await fetch('/api/music/dna/elements');
            if (dnaRes.ok) {
              const dData = await dnaRes.json();
              if (dData.success) {
                setDnaElements(dData.elements || []);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[EVOLUTION_FRONTEND] Promotion error:', err);
    } finally {
      setPromotingId(null);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset entire creative evolution log and restore defaults?')) return;
    try {
      setResetting(true);
      const res = await fetch('/api/music/evolution/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          await fetchIdeasAndDna();
        }
      }
    } catch (err) {
      console.error('[EVOLUTION_FRONTEND] Reset error:', err);
    } finally {
      setResetting(false);
    }
  };

  const getCreativeLabel = (idx: number) => {
    if (idx <= 20) return { text: 'Traditional & Commercial', color: 'text-emerald-400' };
    if (idx <= 40) return { text: 'Radio Compatible', color: 'text-cyan-400' };
    if (idx <= 60) return { text: 'Modern / Standard Pop', color: 'text-indigo-400' };
    if (idx <= 80) return { text: 'Avant-Garde Experimental', color: 'text-purple-400' };
    return { text: 'Completely Innovative', color: 'text-pink-400 animate-pulse' };
  };

  const label = getCreativeLabel(creativeIndex);

  return (
    <div className="space-y-6 flex-1 flex flex-col font-mono" id="sonara-evolution-engine-dashboard">
      
      {/* HEADER SECTION */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Atom className="w-5 h-5 text-purple-400 animate-spin" style={{ animationDuration: '6s' }} />
            <h3 className="font-extrabold text-white text-sm">SONARA CREATIVE EVOLUTION ENGINE</h3>
          </div>
          <p className="text-[11px] text-slate-400 max-w-2xl mt-1 leading-relaxed">
            The active brain of Sonara. Rather than recycling old patterns, this engine mutates, breeds, and synthesizes entirely new rhythms, harmonic progressions, and hypothetical hybrid genres.
          </p>
        </div>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-850 hover:bg-red-500/10 text-slate-400 hover:text-red-400 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
        >
          {resetting ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-yellow-500" /> : <Trash2 className="w-3.5 h-3.5" />}
          <span>Purge Engine History</span>
        </button>
      </div>

      {/* CORE CONTROL ROW: CREATIVE INDEX SLIDER */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <span className="text-white font-extrabold text-xs uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-purple-400" />
            <span>Producer AI: Creative Index Controller</span>
          </span>
          <span className="text-xs font-black bg-slate-950 border border-slate-850 text-purple-400 px-3 py-1 rounded-xl">
            INDEX: {creativeIndex} / 100
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-8 space-y-2">
            <input
              type="range"
              min="0"
              max="100"
              value={creativeIndex}
              onChange={(e) => setCreativeIndex(Number(e.target.value))}
              className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500 focus:outline-none"
            />
            <div className="flex justify-between text-[9px] text-slate-500 font-bold px-1">
              <span>0 (Traditional)</span>
              <span>30 (Radio)</span>
              <span>50 (Modern)</span>
              <span>70 (Experimental)</span>
              <span>100 (Radical)</span>
            </div>
          </div>

          <div className="md:col-span-4 p-3.5 bg-slate-950 rounded-xl border border-slate-850 text-center space-y-0.5">
            <span className="text-[9px] text-slate-500 uppercase font-black block">Active Stylistic Trajectory</span>
            <span className={`text-xs font-black ${label.color}`}>{label.text}</span>
          </div>
        </div>

        {/* AUTOMATIC GENERATION BUTTONS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <button
            onClick={() => handleGenerateIdea('chord_progression')}
            disabled={generating}
            className="p-3 bg-slate-950 hover:bg-purple-950/20 rounded-xl border border-slate-850 text-left space-y-1 hover:border-purple-500/40 transition-all cursor-pointer"
          >
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-extrabold text-white">Synthesize Chords</span>
              <Atom className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <span className="text-[9px] text-slate-500 block leading-normal">Generate custom mutated harmony</span>
          </button>

          <button
            onClick={() => handleGenerateIdea('drum_pattern')}
            disabled={generating}
            className="p-3 bg-slate-950 hover:bg-cyan-950/20 rounded-xl border border-slate-850 text-left space-y-1 hover:border-cyan-500/40 transition-all cursor-pointer"
          >
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-extrabold text-white">Synthesize Beat</span>
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <span className="text-[9px] text-slate-500 block leading-normal">Spawn dynamic rhythmic pattern</span>
          </button>

          <button
            onClick={() => handleGenerateIdea('bridge')}
            disabled={generating}
            className="p-3 bg-slate-950 hover:bg-pink-950/20 rounded-xl border border-slate-850 text-left space-y-1 hover:border-pink-500/40 transition-all cursor-pointer"
          >
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-extrabold text-white">Synthesize Structure</span>
              <GitPullRequest className="w-3.5 h-3.5 text-pink-400" />
            </div>
            <span className="text-[9px] text-slate-500 block leading-normal">Mutate sections arrangements</span>
          </button>

          <div className="bg-slate-950 rounded-xl border border-slate-850 p-2.5 flex items-center gap-2">
            <input
              type="text"
              placeholder="Breed Gen: e.g. Ambient Metal"
              value={customGenreContext}
              onChange={(e) => setCustomGenreContext(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={() => handleGenerateIdea('genre')}
              disabled={generating}
              className="p-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg cursor-pointer"
              title="Spawn Hypothetical Genre"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* TWO COLUMN INTERACTIVE BODY */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: INTERACTIVE MUTATION SANDBOX (REALTIME PREVIEW ON SLIDER ACTION) */}
        <div className="xl:col-span-4 flex flex-col justify-between">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 flex-1 flex flex-col justify-between">
            
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <span className="text-white font-extrabold text-xs uppercase tracking-wider block">
                  Interactive Mutation Sandbox
                </span>
                <span className="text-[9px] text-slate-500 block mt-0.5">
                  Load a physical seed from the Music DNA catalog and observe mutations.
                </span>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9.5px] text-slate-400 font-bold uppercase block">1. Select Target DNA Seed:</label>
                  <select
                    value={selectedBaseElement}
                    onChange={(e) => setSelectedBaseElement(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-white text-xs focus:outline-none"
                  >
                    {dnaElements.map(el => (
                      <option key={el.id} value={el.id}>
                        {el.name} ({el.category.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[9.5px] text-slate-400 font-bold uppercase">
                    <span>2. Sandbox Mutation Index:</span>
                    <span className="text-cyan-400">{sandboxCreativeIndex}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={sandboxCreativeIndex}
                    onChange={(e) => setSandboxCreativeIndex(Number(e.target.value))}
                    className="w-full accent-cyan-400 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* MUTATED VISUAL FEEDBACK BOX */}
              {mutating ? (
                <div className="p-8 rounded-xl bg-slate-950 border border-slate-850 flex flex-col items-center justify-center space-y-2">
                  <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                  <span className="text-[10px] text-slate-500 font-mono">Calibrating harmonics...</span>
                </div>
              ) : mutatedResult ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-850 space-y-3 font-mono animate-fadeIn">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-cyan-400 font-bold uppercase">GENETIC MUTATION RESULT</span>
                    <span className="text-[8px] bg-slate-900 px-1.5 py-0.5 rounded text-slate-500 border border-slate-800">
                      ID: {mutatedResult.id.slice(0, 15)}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between border-b border-slate-900/60 pb-1 text-[11px]">
                      <span className="text-slate-500">Target Tempo:</span>
                      <span className="text-white font-bold">{mutatedResult.bpm} BPM</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900/60 pb-1 text-[11px]">
                      <span className="text-slate-500">Root Scale:</span>
                      <span className="text-white font-bold">{mutatedResult.key}</span>
                    </div>

                    {mutatedResult.chords && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] text-slate-500 block">Synthesized Chord Progression:</span>
                        <div className="flex gap-1.5">
                          {mutatedResult.chords.map((ch: string, i: number) => (
                            <span key={i} className="px-2 py-1 rounded bg-purple-950/40 text-purple-300 border border-purple-500/20 text-[10px] font-black">
                              {ch}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {mutatedResult.instruments && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] text-slate-500 block">Instrument / Timbre Couplings:</span>
                        <div className="flex flex-wrap gap-1">
                          {mutatedResult.instruments.map((inst: string, i: number) => (
                            <span key={i} className="px-1.5 py-0.5 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-500/20 text-[8.5px]">
                              {inst}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-900 text-[10px]">
                    <div className="bg-slate-900 p-2 rounded border border-slate-850">
                      <span className="text-[8px] text-slate-500 block">NOVELTY</span>
                      <span className="text-emerald-400 font-bold">{mutatedResult.noveltyScore}%</span>
                    </div>
                    <div className="bg-slate-900 p-2 rounded border border-slate-850">
                      <span className="text-[8px] text-slate-500 block">SUCCESS RATE</span>
                      <span className="text-indigo-400 font-bold">{mutatedResult.successProbability}%</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* REALTIME SYSTEM HEALTH FOOTER */}
            <div className="pt-3 border-t border-slate-950 text-[9px] text-slate-500 font-mono flex items-center justify-between">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                <span>GENETIC COMBINATOR ACTIVE:</span>
              </span>
              <span className="text-purple-400 font-black">READY TO FLUX</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: EVOLVED CREATIVE IDEAS REGISTRY */}
        <div className="xl:col-span-8">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 flex flex-col justify-between h-full">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <span className="text-white font-extrabold text-xs uppercase tracking-wider block">
                Evolved Creative Ideas Registry
              </span>
              <span className="text-[10px] bg-purple-950/40 text-purple-400 px-3 py-0.5 rounded-full border border-purple-500/20">
                {ideas.length} Brainstorms Archived
              </span>
            </div>

            {loading ? (
              <div className="py-24 flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
                <span className="text-slate-400 font-mono text-xs">Scanning deep creative databases...</span>
              </div>
            ) : ideas.length === 0 ? (
              <div className="py-24 text-center text-slate-500 font-mono text-xs italic">
                No custom creative brainstorms found. Adjust Creative Index and synthesize a new structure above.
              </div>
            ) : (
              <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
                {ideas.map((idea) => (
                  <div
                    key={idea.id}
                    className={`p-4 rounded-xl bg-slate-950 border ${
                      idea.passedQualityEngine 
                        ? 'border-emerald-500/30' 
                        : 'border-slate-850 hover:border-purple-500/30'
                    } transition-all space-y-3`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-black text-xs block">{idea.name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-500 text-[8px] uppercase">
                            {idea.category.toUpperCase()}
                          </span>
                        </div>
                        <span className="text-[8px] text-slate-500 font-mono block">
                          ID: {idea.id}
                        </span>
                      </div>

                      {/* QUALITY STATE OVERLAY */}
                      {idea.passedQualityEngine ? (
                        <span className="px-2.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 text-[9px] font-black border border-emerald-500/20 flex items-center gap-1 animate-fadeIn">
                          <Check className="w-3 h-3" />
                          <span>APPROVED & PROMOTED ({idea.qualityScore}%)</span>
                        </span>
                      ) : idea.qualityScore !== undefined ? (
                        <span className="px-2.5 py-0.5 rounded bg-red-950/40 text-red-400 text-[9px] font-black border border-red-500/20 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>REJECTED BY QUALITY ENGINE ({idea.qualityScore}%)</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handlePromoteToDna(idea.id)}
                          disabled={promotingId !== null}
                          className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-[9.5px] font-black flex items-center gap-1 transition-all cursor-pointer shadow-md shadow-purple-600/10 disabled:opacity-50"
                        >
                          {promotingId === idea.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Zap className="w-3 h-3 text-yellow-300" />
                          )}
                          <span>Run Quality Screening</span>
                        </button>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-400 leading-normal">
                      {idea.description}
                    </p>

                    <div className="pt-2 border-t border-slate-900/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-600 uppercase text-[8px] font-black block">Scale & Key:</span>
                        <span className="text-white font-bold">{idea.parameters.key || 'Any Scale'}</span>
                      </div>
                      <div>
                        <span className="text-slate-600 uppercase text-[8px] font-black block">Ideal Tempo:</span>
                        <span className="text-white font-bold">{idea.parameters.bpm || '120'} BPM</span>
                      </div>
                      <div>
                        <span className="text-slate-600 uppercase text-[8px] font-black block">Novelty Index:</span>
                        <span className="text-emerald-400 font-bold">{idea.novelty}%</span>
                      </div>
                      <div>
                        <span className="text-slate-600 uppercase text-[8px] font-black block">Creative Score:</span>
                        <span className="text-purple-400 font-bold">{idea.creativeScore}%</span>
                      </div>
                    </div>

                    {idea.parameters.chordSequence && idea.parameters.chordSequence.length > 0 && (
                      <div className="flex gap-1 items-center bg-slate-900/50 p-1.5 rounded-lg border border-slate-900">
                        <span className="text-[8px] text-slate-500 font-bold uppercase mr-1">CHORDS:</span>
                        {idea.parameters.chordSequence.map((ch, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-purple-950/30 text-purple-300 text-[9px] border border-purple-500/10 font-bold">
                            {ch}
                          </span>
                        ))}
                      </div>
                    )}

                    {idea.parameters.instruments && idea.parameters.instruments.length > 0 && (
                      <div className="flex flex-wrap gap-1 items-center bg-slate-900/50 p-1.5 rounded-lg border border-slate-900">
                        <span className="text-[8px] text-slate-500 font-bold uppercase mr-1">TIMBRES:</span>
                        {idea.parameters.instruments.map((inst, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-cyan-950/30 text-cyan-300 text-[9px] border border-cyan-500/10 font-medium">
                            {inst}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default CreativeEvolutionEngineDashboard;
