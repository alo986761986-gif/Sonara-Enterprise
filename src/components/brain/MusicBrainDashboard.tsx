import React, { useState, useEffect } from 'react';
import {
  Brain,
  Award,
  TrendingUp,
  Search,
  Database,
  Sparkles,
  CheckCircle2,
  BarChart2,
  Sliders,
  Disc,
  Filter,
  Activity,
  Zap,
  Music,
  Layers,
  RefreshCw,
  Clock,
  ChevronRight
} from 'lucide-react';

export interface QualityScoreBreakdown {
  genreFidelity: number;
  grooveScore: number;
  mixingScore: number;
  masteringScore: number;
  dynamicScore: number;
  stereoScore: number;
  clarityScore: number;
  creativityScore: number;
  overallScore: number;
}

export interface TrackDnaRecord {
  id: string;
  prompt: string;
  genre: string;
  subgenre: string;
  bpm: number;
  keySignature: string;
  structure: string[];
  instruments: string[];
  swingPct: number;
  chords: string[];
  audioQuality: {
    lufs: number;
    truePeakDbtp: number;
    stereoPhaseCorrelation: number;
    noiseFloorDbfs: number;
  };
  scores: QualityScoreBreakdown;
  isBenchmark: boolean;
  createdAt: string;
  usageCount: number;
}

export interface BrainStats {
  totalAnalyzedTracks: number;
  benchmarkDnaCount: number;
  averageOverallScore: number;
  genreBreakdown: Record<string, number>;
  categoryScores: QualityScoreBreakdown;
  evolutionGrowthPercent: number;
  topProductions: TrackDnaRecord[];
}

export const MusicBrainDashboard: React.FC = () => {
  const [stats, setStats] = useState<BrainStats | null>(null);
  const [dnaRecords, setDnaRecords] = useState<TrackDnaRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [onlyBenchmarks, setOnlyBenchmarks] = useState<boolean>(false);
  const [selectedTrack, setSelectedTrack] = useState<TrackDnaRecord | null>(null);

  useEffect(() => {
    fetchBrainStats();
    fetchDnaLibrary();
  }, [selectedGenre, onlyBenchmarks]);

  const fetchBrainStats = async () => {
    try {
      const res = await fetch('/api/music/brain/stats');
      const data = await res.json();
      if (data.status === 'success' && data.brainStats) {
        setStats(data.brainStats);
      }
    } catch (e) {
      console.error('Failed to fetch Music Brain stats', e);
    }
  };

  const fetchDnaLibrary = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('query', searchQuery);
      if (selectedGenre !== 'All') params.append('genre', selectedGenre);
      if (onlyBenchmarks) params.append('onlyBenchmarks', 'true');

      const res = await fetch(`/api/music/brain/library?${params.toString()}`);
      const data = await res.json();
      if (data.status === 'success' && data.dnaRecords) {
        setDnaRecords(data.dnaRecords);
        if (data.dnaRecords.length > 0 && !selectedTrack) {
          setSelectedTrack(data.dnaRecords[0]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch DNA library', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDnaLibrary();
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner: Music Brain Header */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950/60 to-slate-900 border border-purple-800/40 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
          <Brain className="w-64 h-64 text-purple-400 animate-pulse" />
        </div>
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full bg-purple-950 text-purple-300 text-[10px] font-bold uppercase tracking-wider border border-purple-700/50 flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>Sonara V12 Continuous Learning System</span>
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-2 flex items-center space-x-3">
            <Brain className="w-7 h-7 text-purple-400" />
            <span>Sonara AI Music Brain (Memory & Learning Engine)</span>
          </h1>
          <p className="text-sm text-slate-300 mt-2 leading-relaxed">
            Every audio production is analyzed, scored across 8 audio dimensions, and indexed into the <strong className="text-purple-300">Music DNA Library</strong>. High-scoring productions are saved as reference benchmarks to train and optimize future generations automatically.
          </p>
        </div>
      </div>

      {/* Top Metric Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
              <span>Analyzed Tracks</span>
              <Database className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-3xl font-extrabold text-white font-mono">{stats.totalAnalyzedTracks}</p>
            <p className="text-[11px] text-purple-400 flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3 text-purple-400" />
              <span>Full Audio & Quality DNA Stored</span>
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
              <span>Benchmark DNA Profiles</span>
              <Award className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-3xl font-extrabold text-white font-mono">{stats.benchmarkDnaCount}</p>
            <p className="text-[11px] text-amber-300 flex items-center space-x-1">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>High Score (&gt;=8.5) Master Benchmarks</span>
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
              <span>Average Production Score</span>
              <BarChart2 className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-3xl font-extrabold text-white font-mono">{stats.averageOverallScore} <span className="text-xs font-normal text-slate-400">/ 10</span></p>
            <p className="text-[11px] text-emerald-400 flex items-center space-x-1">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              <span>+{stats.evolutionGrowthPercent}% Quality Evolution</span>
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
              <span>Primary Reference Genre</span>
              <Music className="w-4 h-4 text-pink-400" />
            </div>
            <p className="text-xl font-bold text-white truncate">Afro & Deep House</p>
            <p className="text-[11px] text-slate-400 flex items-center space-x-1">
              <Disc className="w-3 h-3 text-pink-400" />
              <span>{Object.keys(stats.genreBreakdown).length} Genres Covered</span>
            </p>
          </div>
        </div>
      )}

      {/* Multi-Dimensional Audio Evaluation Matrix */}
      {stats && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="font-bold text-sm text-slate-100 flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-purple-400" />
              <span>System-Wide 8-Axis Evaluation Scores</span>
            </h2>
            <span className="text-xs text-slate-400">Automated Multi-Dimensional Quality Audit</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Genre Fidelity', score: stats.categoryScores.genreFidelity, color: 'from-purple-500 to-indigo-500' },
              { label: 'Groove & Swing', score: stats.categoryScores.grooveScore, color: 'from-pink-500 to-rose-500' },
              { label: 'Mixing Balance', score: stats.categoryScores.mixingScore, color: 'from-blue-500 to-cyan-500' },
              { label: 'Mastering & LUFS', score: stats.categoryScores.masteringScore, color: 'from-emerald-500 to-teal-500' },
              { label: 'Dynamic Range', score: stats.categoryScores.dynamicScore, color: 'from-amber-500 to-yellow-500' },
              { label: 'Stereo Spatial Width', score: stats.categoryScores.stereoScore, color: 'from-indigo-500 to-purple-500' },
              { label: 'Spectral Clarity', score: stats.categoryScores.clarityScore, color: 'from-teal-500 to-emerald-500' },
              { label: 'Harmonic Creativity', score: stats.categoryScores.creativityScore, color: 'from-fuchsia-500 to-pink-500' }
            ].map((axis, idx) => (
              <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-medium">{axis.label}</span>
                  <span className="font-bold text-slate-100 font-mono">{axis.score}</span>
                </div>
                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${axis.color} transition-all duration-500`}
                    style={{ width: `${(axis.score / 10.0) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main DNA Explorer View & Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: DNA Search & List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="font-bold text-sm text-slate-100 flex items-center space-x-2">
                <Database className="w-4 h-4 text-purple-400" />
                <span>Music DNA Library Explorer</span>
              </h2>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setOnlyBenchmarks(!onlyBenchmarks)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center space-x-1.5 ${
                    onlyBenchmarks
                      ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  <span>Only Benchmarks</span>
                </button>

                <button
                  onClick={() => { fetchBrainStats(); fetchDnaLibrary(); }}
                  className="p-1.5 bg-slate-950 text-slate-400 hover:text-slate-200 rounded-lg border border-slate-800"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by prompt, genre, key, chords..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="All">All Genres</option>
                <option value="House">House</option>
                <option value="Tech House">Tech House</option>
                <option value="Melodic House">Melodic House</option>
                <option value="Afro House">Afro House</option>
                <option value="Progressive House">Progressive House</option>
              </select>

              <button
                type="submit"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl transition-all"
              >
                Search
              </button>
            </form>

            {/* List of DNA Records */}
            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
                <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                <span>Loading Music Brain records...</span>
              </div>
            ) : dnaRecords.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No matching DNA records found in memory.
              </div>
            ) : (
              <div className="space-y-3">
                {dnaRecords.map((track) => {
                  const isSelected = selectedTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      onClick={() => setSelectedTrack(track)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-purple-950/40 border-purple-500/80 shadow-lg shadow-purple-500/10'
                          : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-xs text-slate-100">{track.genre}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({track.subgenre})</span>
                            {track.isBenchmark && (
                              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-bold rounded-full border border-amber-800/40 flex items-center space-x-1">
                                <Award className="w-2.5 h-2.5 text-amber-400" />
                                <span>BENCHMARK</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-300 line-clamp-2">{track.prompt}</p>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <span className="text-sm font-bold text-emerald-400 bg-emerald-950 px-2.5 py-1 rounded-lg border border-emerald-800/40 font-mono">
                            {track.scores.overallScore}
                          </span>
                          <span className="block text-[10px] text-slate-400 mt-1 font-mono">{track.usageCount} Recalls</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 mt-3 pt-2.5 border-t border-slate-800/60 text-[10px] text-slate-400">
                        <div>
                          <span className="text-slate-500 block">Tempo</span>
                          <span className="font-mono text-slate-200">{track.bpm} BPM</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Key</span>
                          <span className="font-mono text-slate-200">{track.keySignature}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Swing</span>
                          <span className="font-mono text-slate-200">{track.swingPct}%</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Chords</span>
                          <span className="font-mono text-purple-300 truncate block">{track.chords.slice(0, 2).join(', ')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: DNA Detail Inspector */}
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4 sticky top-20">
            <h3 className="font-bold text-sm text-slate-100 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>DNA Profile Inspector</span>
            </h3>

            {selectedTrack ? (
              <div className="space-y-4">
                <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-purple-300">{selectedTrack.genre}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{selectedTrack.id}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{selectedTrack.prompt}</p>
                </div>

                {/* Score breakdown */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400 block">Quality Breakdown</span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 bg-slate-950 rounded border border-slate-800/60 flex justify-between">
                      <span className="text-slate-400">Genre Fidelity</span>
                      <span className="font-bold text-slate-200">{selectedTrack.scores.genreFidelity}</span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800/60 flex justify-between">
                      <span className="text-slate-400">Groove Tightness</span>
                      <span className="font-bold text-slate-200">{selectedTrack.scores.grooveScore}</span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800/60 flex justify-between">
                      <span className="text-slate-400">Mixing Clarity</span>
                      <span className="font-bold text-slate-200">{selectedTrack.scores.mixingScore}</span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800/60 flex justify-between">
                      <span className="text-slate-400">Mastering LUFS</span>
                      <span className="font-bold text-slate-200">{selectedTrack.scores.masteringScore}</span>
                    </div>
                  </div>
                </div>

                {/* Audio DSP Metrics */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400 block">DSP Measurement Signals</span>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Integrated LUFS</span>
                      <span className="font-mono text-purple-300">{selectedTrack.audioQuality.lufs} LUFS</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">True Peak</span>
                      <span className="font-mono text-purple-300">{selectedTrack.audioQuality.truePeakDbtp} dBTP</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Phase Correlation</span>
                      <span className="font-mono text-emerald-400">+{selectedTrack.audioQuality.stereoPhaseCorrelation} (Mono Safe)</span>
                    </div>
                  </div>
                </div>

                {/* Chords & Instruments */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400 block">Harmonic Progression</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTrack.chords.map((chord, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-purple-950/80 text-purple-300 text-xs font-mono rounded border border-purple-800/50">
                        {chord}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400 block">Instrument Layer Assignment</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTrack.instruments.map((inst, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-slate-950 text-slate-300 text-[11px] rounded border border-slate-800">
                        {inst}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Select a DNA record from the library to inspect details.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
