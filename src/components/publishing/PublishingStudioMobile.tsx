import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Search,
  Bell,
  Settings,
  Music,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  Pause,
  Upload,
  Sparkles,
  SlidersHorizontal,
  DollarSign,
  Share2,
  Globe,
  Radio,
  Clock,
  ShieldCheck,
  ChevronRight,
  Maximize2,
  X,
  Edit3,
  Check,
  Zap,
  Tag,
  Calendar,
  Layers,
  Wand2,
  TrendingUp,
  FileText,
  HelpCircle,
  Plus
} from 'lucide-react';
import { Card } from '../core/Card';
import { Button } from '../core/Button';
import { Input } from '../ui/Input';
import { variants, transitions } from '../../lib/motion';

export interface ReleaseItem {
  id: string;
  title: string;
  artist: string;
  genre: string;
  subGenre: string;
  label: string;
  type: 'Single' | 'EP' | 'Album';
  status: 'Draft' | 'Ready' | 'Scheduled' | 'Published' | 'Needs Attention';
  releaseDate: string;
  upc: string;
  isrc: string;
  coverImage: string;
  tracksCount: number;
  readinessScore: number;
}

export interface ChecklistItem {
  id: string;
  label: string;
  status: 'Completed' | 'Warning' | 'Missing';
  detail: string;
  sheetKey: 'metadata' | 'artwork' | 'audio' | 'distribution' | 'licensing' | 'pricing' | 'ai';
}

export interface DistributionPlatform {
  id: string;
  name: string;
  category: 'Streaming' | 'Download' | 'Web3 Marketplace';
  status: 'Active' | 'Pending' | 'Disabled';
  payoutRate: string;
  iconBg: string;
}

export const PublishingStudioMobile: React.FC = () => {
  // 1. RELEASES STATE
  const [releases, setReleases] = useState<ReleaseItem[]>([
    {
      id: 'rel-1',
      title: 'Midnight Echoes EP',
      artist: 'Aria Sterling & Sonara AI',
      genre: 'Cyberpunk Synthwave',
      subGenre: 'Vocal Ambient',
      label: 'Sonara Records',
      type: 'EP',
      status: 'Ready',
      releaseDate: '2026-08-15',
      upc: '198273649102',
      isrc: 'US-S3A-26-00124',
      coverImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop',
      tracksCount: 4,
      readinessScore: 94
    },
    {
      id: 'rel-2',
      title: 'Urban Afro Vibe',
      artist: 'Kofi Beats',
      genre: 'Afro-House',
      subGenre: 'Vocal Chops',
      label: 'Independent',
      type: 'Single',
      status: 'Draft',
      releaseDate: '2026-09-01',
      upc: '198273649999',
      isrc: 'US-S3A-26-00125',
      coverImage: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop',
      tracksCount: 1,
      readinessScore: 65
    },
    {
      id: 'rel-3',
      title: 'Neon Nights OST',
      artist: 'Sonara Collective',
      genre: 'Cinematic Orchestral',
      subGenre: 'Synth Score',
      label: 'Sonara Records',
      type: 'Album',
      status: 'Published',
      releaseDate: '2026-05-20',
      upc: '198273641111',
      isrc: 'US-S3A-26-00099',
      coverImage: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=800&auto=format&fit=crop',
      tracksCount: 8,
      readinessScore: 100
    }
  ]);

  const [activeReleaseId, setActiveReleaseId] = useState<string>('rel-1');
  const activeRelease = releases.find(r => r.id === activeReleaseId) || releases[0];

  // 2. SEARCH & NOTIFICATION STATE
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationCount] = useState(3);

  // 3. CHECKLIST STATE
  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    { id: 'chk-1', label: 'Artwork Studio', status: 'Completed', detail: '3000x3000px Lossless JPG', sheetKey: 'artwork' },
    { id: 'chk-2', label: 'Audio Mastering', status: 'Completed', detail: '24-bit 48kHz WAV (-14.1 LUFS)', sheetKey: 'audio' },
    { id: 'chk-3', label: 'Lyrics & Sync', status: 'Completed', detail: 'LRC Timestamped Lyrics Attached', sheetKey: 'audio' },
    { id: 'chk-4', label: 'Metadata & Codes', status: 'Completed', detail: 'ISRC & UPC Barcodes Registered', sheetKey: 'metadata' },
    { id: 'chk-5', label: 'Genres & Tags', status: 'Completed', detail: 'Primary & Secondary Genres Set', sheetKey: 'metadata' },
    { id: 'chk-6', label: 'Copyright & License', status: 'Completed', detail: 'C & P 2026 Sonara Records', sheetKey: 'licensing' },
    { id: 'chk-7', label: 'Distribution Outlets', status: 'Completed', detail: '9 Store Channels Connected', sheetKey: 'distribution' },
    { id: 'chk-8', label: 'Marketplace Pricing', status: 'Warning', detail: 'Stem License Bundle Unassigned', sheetKey: 'pricing' },
    { id: 'chk-9', label: 'Marketing Pre-Save', status: 'Completed', detail: 'Smart Link & Landing Page Active', sheetKey: 'ai' },
  ]);

  // 4. DISTRIBUTION PLATFORMS
  const [platforms, setPlatforms] = useState<DistributionPlatform[]>([
    { id: 'p-1', name: 'Spotify', category: 'Streaming', status: 'Active', payoutRate: '$0.0038 / stream', iconBg: 'bg-emerald-500/20 text-emerald-400' },
    { id: 'p-2', name: 'Apple Music', category: 'Streaming', status: 'Active', payoutRate: '$0.0075 / stream', iconBg: 'bg-rose-500/20 text-rose-400' },
    { id: 'p-3', name: 'YouTube Music', category: 'Streaming', status: 'Active', payoutRate: '$0.0020 / stream', iconBg: 'bg-red-500/20 text-red-400' },
    { id: 'p-4', name: 'Amazon Music', category: 'Streaming', status: 'Active', payoutRate: '$0.0040 / stream', iconBg: 'bg-blue-500/20 text-blue-400' },
    { id: 'p-5', name: 'Deezer', category: 'Streaming', status: 'Active', payoutRate: '$0.0064 / stream', iconBg: 'bg-purple-500/20 text-purple-400' },
    { id: 'p-6', name: 'Tidal', category: 'Streaming', status: 'Active', payoutRate: '$0.0120 / stream', iconBg: 'bg-cyan-500/20 text-cyan-400' },
    { id: 'p-7', name: 'SoundCloud', category: 'Streaming', status: 'Active', payoutRate: 'Monetized Repost', iconBg: 'bg-amber-500/20 text-amber-400' },
    { id: 'p-8', name: 'Bandcamp', category: 'Download', status: 'Active', payoutRate: '85% Direct Sale', iconBg: 'bg-teal-500/20 text-teal-400' },
    { id: 'p-9', name: 'Sonara Marketplace', category: 'Web3 Marketplace', status: 'Active', payoutRate: '95% Creator Split', iconBg: 'bg-indigo-500/20 text-indigo-400' }
  ]);

  // 5. AUDIO PREVIEW STATE
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [activeAudioTrack, setActiveAudioTrack] = useState('Midnight Echoes (Master WAV)');

  // 6. BOTTOM SHEETS STATE
  const [activeSheet, setActiveSheet] = useState<'metadata' | 'artwork' | 'audio' | 'distribution' | 'licensing' | 'pricing' | 'ai' | null>(null);

  // 7. MODALS
  const [isFullscreenArtworkOpen, setIsFullscreenArtworkOpen] = useState(false);
  const [isNewReleaseModalOpen, setIsNewReleaseModalOpen] = useState(false);

  // New Release Form
  const [newReleaseTitle, setNewReleaseTitle] = useState('');
  const [newReleaseType, setNewReleaseType] = useState<'Single' | 'EP' | 'Album'>('Single');
  const [newReleaseGenre, setNewReleaseGenre] = useState('');

  // Editable Form Fields State
  const [editableTitle, setEditableTitle] = useState(activeRelease.title);
  const [editableArtist, setEditableArtist] = useState(activeRelease.artist);
  const [editableGenre, setEditableGenre] = useState(activeRelease.genre);
  const [editableLabel, setEditableLabel] = useState(activeRelease.label);
  const [editableIsrc, setEditableIsrc] = useState(activeRelease.isrc);
  const [editableUpc, setEditableUpc] = useState(activeRelease.upc);
  const [editableDate, setEditableDate] = useState(activeRelease.releaseDate);

  // Pricing State
  const [marketplacePrice, setMarketplacePrice] = useState('29.99');
  const [distributionPrice, setDistributionPrice] = useState('1.29');
  const [isBundleEnabled, setIsBundleEnabled] = useState(true);

  // AI Assistant Suggestions
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // Toggle platform
  const togglePlatform = (id: string) => {
    setPlatforms(prev => prev.map(p => {
      if (p.id === id) {
        const nextStatus = p.status === 'Active' ? 'Disabled' : 'Active';
        return { ...p, status: nextStatus };
      }
      return p;
    }));
  };

  // Create Release Handler
  const handleCreateNewRelease = () => {
    if (!newReleaseTitle.trim()) return;
    const newRel: ReleaseItem = {
      id: `rel-${Date.now()}`,
      title: newReleaseTitle.trim(),
      artist: 'Aria Sterling',
      genre: newReleaseGenre.trim() || 'Electronic',
      subGenre: 'Melodic Ambient',
      label: 'Sonara Records',
      type: newReleaseType,
      status: 'Draft',
      releaseDate: '2026-09-15',
      upc: `198273${Math.floor(100000 + Math.random() * 900000)}`,
      isrc: `US-S3A-26-${Math.floor(10000 + Math.random() * 90000)}`,
      coverImage: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop',
      tracksCount: newReleaseType === 'Single' ? 1 : newReleaseType === 'EP' ? 4 : 10,
      readinessScore: 40
    };

    setReleases(prev => [newRel, ...prev]);
    setActiveReleaseId(newRel.id);
    setIsNewReleaseModalOpen(false);
    setNewReleaseTitle('');
    setNewReleaseGenre('');
  };

  // Run AI Inspection
  const handleRunAiInspection = () => {
    setIsAiProcessing(true);
    setAiAnalysisResult(null);
    setTimeout(() => {
      setIsAiProcessing(false);
      setAiAnalysisResult(
        `• Audio Quality: Passed (-14.1 LUFS / 24-bit 48kHz WAV)\n• Artwork Check: Passed (3000x3000px 300DPI)\n• Metadata Recommendation: Add secondary genre tag "Melodic Techno" to boost editorial playlist matching by ~22%.\n• Best Global Release Window: Friday August 15 @ 00:00 EST.`
      );
    }, 900);
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-5 pb-28 text-slate-100 select-none px-3.5 sm:px-5 pt-1 font-sans">
      
      {/* 1. TOP APP BAR */}
      <motion.div 
        variants={variants.slideUp} 
        transition={transitions.comfort}
        className="flex items-center justify-between pt-2 pb-2 border-b border-white/5"
      >
        <div className="flex items-center gap-3">
          <button 
            onClick={() => window.history.back()}
            className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:bg-white/10 active:scale-95 transition-all text-slate-300"
            title="Go Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <span className="text-[10px] font-extrabold tracking-widest text-indigo-400 uppercase block">Sonara Release Engine</span>
            <h1 className="text-xl font-black text-white tracking-tight leading-none">Publishing Studio</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsSearching(!isSearching)}
            className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:bg-white/10 active:scale-95 transition-all text-slate-300"
            title="Search Releases"
          >
            <Search size={18} />
          </button>

          <button 
            className="relative p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:bg-white/10 active:scale-95 transition-all text-slate-300"
            title="Notifications"
          >
            <Bell size={18} />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-[9px] font-black text-white flex items-center justify-center border-2 border-slate-950">
                {notificationCount}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveSheet('metadata')}
            className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:bg-white/10 active:scale-95 transition-all text-slate-300"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </motion.div>

      {/* SEARCH BAR INPUT (Togglable) */}
      <AnimatePresence>
        {isSearching && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="relative flex items-center">
              <Input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search releases by title, ISRC, genre..."
                className="bg-slate-900 border-white/10 text-xs pr-10 rounded-2xl"
              />
              <button onClick={() => { setSearchQuery(''); setIsSearching(false); }} className="absolute right-3 text-slate-400">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. SUBTITLE & INTRO */}
      <motion.div variants={variants.slideUp} transition={transitions.comfort} className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 font-medium">Prepare, license, and distribute your release globally.</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider shrink-0">
          <ShieldCheck size={12} />
          <span>Stores Connected</span>
        </div>
      </motion.div>

      {/* 3. RELEASE SELECTOR */}
      <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          <span>Active Release Package</span>
          <button 
            onClick={() => setIsNewReleaseModalOpen(true)}
            className="text-indigo-400 hover:underline flex items-center gap-1"
          >
            <Plus size={14} />
            <span>Create New Release</span>
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {releases.map((rel) => {
            const isSelected = rel.id === activeRelease.id;
            return (
              <div 
                key={rel.id}
                onClick={() => {
                  setActiveReleaseId(rel.id);
                  setEditableTitle(rel.title);
                  setEditableArtist(rel.artist);
                  setEditableGenre(rel.genre);
                  setEditableLabel(rel.label);
                  setEditableIsrc(rel.isrc);
                  setEditableUpc(rel.upc);
                  setEditableDate(rel.releaseDate);
                }}
                className={`p-3 rounded-2xl border flex items-center gap-3 cursor-pointer shrink-0 transition-all min-w-[200px] ${
                  isSelected 
                    ? 'bg-indigo-600/20 border-indigo-500/60 shadow-lg shadow-indigo-600/10' 
                    : 'bg-slate-900/60 border-white/10 hover:border-white/20'
                }`}
              >
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 shrink-0 bg-slate-950">
                  <img src={rel.coverImage} alt={rel.title} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-white text-xs truncate">{rel.title}</h4>
                  <span className="text-[10px] text-slate-400 block truncate">{rel.type} • {rel.genre}</span>
                </div>
                {isSelected && <Check size={16} className="text-indigo-400 shrink-0" />}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* 4. RELEASE STATUS CARDS */}
      <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">Release Status & Pipeline</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <StatusCard 
            label="Draft" 
            count={1} 
            color="border-slate-700 bg-slate-900/50 text-slate-400" 
            isActive={activeRelease.status === 'Draft'}
          />
          <StatusCard 
            label="Ready" 
            count={1} 
            color="border-emerald-500/40 bg-emerald-500/10 text-emerald-300" 
            isActive={activeRelease.status === 'Ready'}
          />
          <StatusCard 
            label="Scheduled" 
            count={1} 
            color="border-indigo-500/40 bg-indigo-500/10 text-indigo-300" 
            isActive={activeRelease.status === 'Scheduled'}
          />
          <StatusCard 
            label="Published" 
            count={12} 
            color="border-purple-500/40 bg-purple-500/10 text-purple-300" 
            isActive={activeRelease.status === 'Published'}
          />
          <StatusCard 
            label="Needs Attention" 
            count={1} 
            color="border-amber-500/40 bg-amber-500/10 text-amber-300" 
            isActive={activeRelease.status === 'Needs Attention'}
          />
          <div className="p-3 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 flex flex-col justify-between">
            <span className="text-[9px] font-extrabold text-indigo-300 uppercase tracking-wider">Readiness Score</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-white">{activeRelease.readinessScore}</span>
              <span className="text-[10px] text-slate-400 font-bold">/100</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 5. PUBLISHING CHECKLIST */}
      <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span>Publishing Checklist ({checklist.filter(c => c.status === 'Completed').length}/{checklist.length})</span>
          </div>
          <button onClick={() => setActiveSheet('ai')} className="text-xs font-bold text-indigo-400 hover:underline">
            Auto Inspect
          </button>
        </div>

        <Card variant="standard" className="p-2 bg-slate-900/70 border-white/10 rounded-2xl divide-y divide-white/5 backdrop-blur-md">
          {checklist.map((item) => (
            <div 
              key={item.id}
              onClick={() => setActiveSheet(item.sheetKey)}
              className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {item.status === 'Completed' && <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />}
                {item.status === 'Warning' && <AlertTriangle size={18} className="text-amber-400 shrink-0" />}
                {item.status === 'Missing' && <XCircle size={18} className="text-rose-400 shrink-0" />}

                <div className="min-w-0">
                  <h4 className="font-bold text-white text-xs truncate">{item.label}</h4>
                  <p className="text-[10px] text-slate-400 truncate">{item.detail}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                  item.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  item.status === 'Warning' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                  'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}>
                  {item.status}
                </span>
                <ChevronRight size={14} className="text-slate-500" />
              </div>
            </div>
          ))}
        </Card>
      </motion.div>

      {/* 6. DISTRIBUTION CHANNELS */}
      <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <Globe size={16} className="text-indigo-400" />
            <span>Distribution Outlets ({platforms.filter(p => p.status === 'Active').length}/{platforms.length})</span>
          </div>
          <button onClick={() => setActiveSheet('distribution')} className="text-xs font-bold text-indigo-400 hover:underline">
            Manage Outlets
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {platforms.map((plat) => (
            <div 
              key={plat.id}
              onClick={() => togglePlatform(plat.id)}
              className={`p-3 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                plat.status === 'Active' ? 'bg-slate-900/80 border-white/10' : 'bg-slate-950/40 border-white/5 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 rounded-xl shrink-0 ${plat.iconBg}`}>
                  <Radio size={16} />
                </div>
                <div className="min-w-0">
                  <h5 className="font-bold text-white text-xs truncate">{plat.name}</h5>
                  <p className="text-[10px] text-slate-400 truncate">{plat.payoutRate}</p>
                </div>
              </div>

              <div className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${plat.status === 'Active' ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${plat.status === 'Active' ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* 7. METADATA SUMMARY */}
      <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <FileText size={16} className="text-purple-400" />
            <span>Release Metadata</span>
          </div>
          <button onClick={() => setActiveSheet('metadata')} className="text-xs font-bold text-indigo-400 hover:underline">
            Edit Metadata
          </button>
        </div>

        <Card variant="standard" className="p-4 bg-slate-900/70 border-white/10 rounded-2xl space-y-3 backdrop-blur-md">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Title</span>
              <p className="font-bold text-white truncate">{editableTitle}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Primary Artist</span>
              <p className="font-bold text-white truncate">{editableArtist}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Genre</span>
              <p className="font-bold text-white truncate">{editableGenre}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Record Label</span>
              <p className="font-bold text-white truncate">{editableLabel}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">ISRC Code</span>
              <p className="font-mono text-indigo-300 font-bold truncate">{editableIsrc}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Target Launch Date</span>
              <p className="font-bold text-emerald-400 truncate">{editableDate}</p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* 8. ARTWORK STUDIO */}
      <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <ImageIcon size={16} className="text-rose-400" />
            <span>Release Cover Artwork</span>
          </div>
          <button onClick={() => setActiveSheet('artwork')} className="text-xs font-bold text-indigo-400 hover:underline">
            Replace Cover
          </button>
        </div>

        <Card variant="standard" className="p-3 bg-slate-900/70 border-white/10 rounded-2xl flex items-center gap-4 backdrop-blur-md">
          <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 bg-slate-950 shrink-0 group">
            <img src={activeRelease.coverImage} alt="Cover" className="w-full h-full object-cover" />
            <button 
              onClick={() => setIsFullscreenArtworkOpen(true)}
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
            >
              <Maximize2 size={16} />
            </button>
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[9px] font-bold">
                1:1 Aspect Ratio
              </span>
              <span className="text-[10px] text-slate-400 font-mono">3000 x 3000 px</span>
            </div>
            <h4 className="font-bold text-white text-xs truncate">{activeRelease.title} Cover</h4>
            <div className="flex items-center gap-2 pt-0.5">
              <button 
                onClick={() => setIsFullscreenArtworkOpen(true)}
                className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-[10px] font-bold flex items-center gap-1"
              >
                <Maximize2 size={12} />
                <span>Fullscreen</span>
              </button>
              <button 
                onClick={() => setActiveSheet('ai')}
                className="px-2.5 py-1 rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold flex items-center gap-1"
              >
                <Wand2 size={12} />
                <span>AI Enhance</span>
              </button>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* 9. AUDIO MASTERING & TRACKS */}
      <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <Music size={16} className="text-amber-400" />
            <span>Master Audio Tracks ({activeRelease.tracksCount})</span>
          </div>
          <button onClick={() => setActiveSheet('audio')} className="text-xs font-bold text-indigo-400 hover:underline">
            Audio Studio
          </button>
        </div>

        <Card variant="standard" className="p-3 bg-slate-900/70 border-white/10 rounded-2xl space-y-3 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button 
                onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shrink-0 shadow-md active:scale-95 transition-all"
              >
                {isPlayingAudio ? <Pause size={18} /> : <Play size={18} className="ml-0.5 fill-current" />}
              </button>

              <div className="min-w-0">
                <h4 className="font-bold text-white text-xs truncate">{activeAudioTrack}</h4>
                <p className="text-[10px] text-slate-400 font-mono">24-bit / 48kHz WAV • -14.1 LUFS Integrated</p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold shrink-0">
              Master Verified
            </span>
          </div>

          {/* Fake Waveform Visualizer */}
          <div className="h-8 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between px-2 gap-1">
            {[40, 70, 30, 90, 60, 100, 45, 80, 50, 95, 30, 60, 85, 40, 75, 90, 50, 30, 70, 90, 40, 60, 80, 30, 90].map((h, idx) => (
              <div 
                key={idx}
                style={{ height: `${h}%` }}
                className={`w-1 rounded-full transition-all ${isPlayingAudio ? 'bg-indigo-400 animate-pulse' : 'bg-slate-700'}`}
              />
            ))}
          </div>
        </Card>
      </motion.div>

      {/* 10. LICENSING & RIGHTS */}
      <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <ShieldCheck size={16} className="text-emerald-400" />
            <span>Licensing & Rights</span>
          </div>
          <button onClick={() => setActiveSheet('licensing')} className="text-xs font-bold text-indigo-400 hover:underline">
            Manage License
          </button>
        </div>

        <Card variant="standard" className="p-3.5 bg-slate-900/70 border-white/10 rounded-2xl space-y-2 text-xs">
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-slate-400 font-medium">Copyright Holder (C)</span>
            <span className="font-bold text-white">© 2026 Sonara Audio LLC</span>
          </div>
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-slate-400 font-medium">Sound Recording (P)</span>
            <span className="font-bold text-white">℗ 2026 Sonara Records</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400 font-medium">Commercial Sync Rights</span>
            <span className="font-bold text-indigo-300">Monetized Commercial</span>
          </div>
        </Card>
      </motion.div>

      {/* 11. PRICING & MONETIZATION */}
      <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <DollarSign size={16} className="text-emerald-400" />
            <span>Monetization & Pricing</span>
          </div>
          <button onClick={() => setActiveSheet('pricing')} className="text-xs font-bold text-indigo-400 hover:underline">
            Edit Pricing
          </button>
        </div>

        <Card variant="standard" className="p-3.5 bg-slate-900/70 border-white/10 rounded-2xl space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Marketplace Stem License</span>
              <span className="text-base font-black text-emerald-400">${marketplacePrice}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Store Download Rate</span>
              <span className="text-base font-black text-white">${distributionPrice}</span>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* 12. AI SUGGESTIONS & INSPECTOR */}
      <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-3 pt-1">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <Sparkles size={16} className="text-amber-400" />
          <span>AI Release Quality Inspector</span>
        </div>

        <Card variant="standard" className="p-4 bg-gradient-to-br from-indigo-950/80 via-slate-900 to-purple-950/70 border-indigo-500/30 rounded-3xl space-y-3 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wand2 size={18} className="text-indigo-400" />
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">Sonara AI Copilot</h4>
            </div>
            <button 
              onClick={handleRunAiInspection}
              disabled={isAiProcessing}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-md disabled:opacity-50"
            >
              <Zap size={14} className={isAiProcessing ? 'animate-spin' : ''} />
              <span>{isAiProcessing ? 'Analyzing...' : 'Run Analysis'}</span>
            </button>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            AI evaluated your audio stems, artwork resolution, and metadata completeness.
          </p>

          {aiAnalysisResult && (
            <motion.div 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-2xl bg-black/60 border border-indigo-500/30 text-xs font-mono text-indigo-200 whitespace-pre-line leading-relaxed"
            >
              {aiAnalysisResult}
            </motion.div>
          )}
        </Card>
      </motion.div>

      {/* 13. RELEASE TIMELINE */}
      <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-3 pt-1">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <Clock size={16} className="text-indigo-400" />
          <span>Release Lifecycle Timeline</span>
        </div>

        <Card variant="standard" className="p-4 bg-slate-900/70 border-white/10 rounded-2xl space-y-4">
          <div className="relative flex items-center justify-between px-2">
            <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-white/10 -translate-y-1/2 z-0" />
            
            {['Draft', 'Review', 'Approval', 'Scheduled', 'Published'].map((step, idx) => {
              const isDone = idx <= 3;
              const isCurrent = idx === 3;
              return (
                <div key={step} className="relative z-10 flex flex-col items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] border transition-all ${
                    isCurrent ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/50 scale-110' :
                    isDone ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'bg-slate-900 border-white/20 text-slate-500'
                  }`}>
                    {isDone ? <Check size={12} /> : idx + 1}
                  </div>
                  <span className={`text-[9px] font-bold tracking-tight ${isCurrent ? 'text-indigo-300' : isDone ? 'text-slate-300' : 'text-slate-600'}`}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </motion.div>

      {/* 14. FLOATING THUMB-FRIENDLY PUBLISH BUTTON */}
      <div className="fixed bottom-4 left-3.5 right-3.5 max-w-xl mx-auto z-40">
        <motion.div
          whileTap={{ scale: 0.98 }}
          className="p-2 rounded-3xl bg-slate-900/90 border border-white/10 shadow-2xl backdrop-blur-2xl flex items-center justify-between gap-3"
        >
          <div className="pl-3">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Ready for Launch</span>
            <span className="text-xs font-black text-white truncate block max-w-[180px]">{activeRelease.title}</span>
          </div>

          <Button 
            onClick={() => setActiveSheet('distribution')}
            variant="primary"
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 font-extrabold text-xs tracking-wide uppercase shadow-lg shadow-indigo-600/30 shrink-0"
          >
            Distribute Release Now
          </Button>
        </motion.div>
      </div>

      {/* ========================================================================= */}
      {/* BOTTOM SHEETS */}
      {/* ========================================================================= */}

      <AnimatePresence>
        {activeSheet && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={transitions.comfort}
              className="w-full max-w-lg bg-slate-900 border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10 sticky top-0 bg-slate-900 z-10">
                <h3 className="font-extrabold text-white text-base capitalize flex items-center gap-2">
                  <Sparkles size={18} className="text-indigo-400" />
                  <span>{activeSheet.replace('_', ' ')} Studio Editor</span>
                </h3>
                <button onClick={() => setActiveSheet(null)} className="p-1.5 rounded-full bg-white/10 text-slate-300">
                  <X size={16} />
                </button>
              </div>

              {/* SHEET 1: METADATA */}
              {activeSheet === 'metadata' && (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Release Title</label>
                    <Input value={editableTitle} onChange={(e) => setEditableTitle(e.target.value)} className="bg-white/5 border-white/10 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Primary Artist</label>
                    <Input value={editableArtist} onChange={(e) => setEditableArtist(e.target.value)} className="bg-white/5 border-white/10 text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Primary Genre</label>
                      <Input value={editableGenre} onChange={(e) => setEditableGenre(e.target.value)} className="bg-white/5 border-white/10 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Record Label</label>
                      <Input value={editableLabel} onChange={(e) => setEditableLabel(e.target.value)} className="bg-white/5 border-white/10 text-xs" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">ISRC Code</label>
                      <Input value={editableIsrc} onChange={(e) => setEditableIsrc(e.target.value)} className="bg-white/5 border-white/10 text-xs font-mono" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">UPC / EAN Barcode</label>
                      <Input value={editableUpc} onChange={(e) => setEditableUpc(e.target.value)} className="bg-white/5 border-white/10 text-xs font-mono" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Target Release Date</label>
                    <Input type="date" value={editableDate} onChange={(e) => setEditableDate(e.target.value)} className="bg-white/5 border-white/10 text-xs" />
                  </div>
                </div>
              )}

              {/* SHEET 2: ARTWORK */}
              {activeSheet === 'artwork' && (
                <div className="space-y-3 text-xs">
                  <p className="text-slate-300">Upload high-resolution 3000x3000px cover art or let AI generate artwork concepts.</p>
                  <div className="aspect-square w-full rounded-2xl overflow-hidden border border-white/10 bg-slate-950">
                    <img src={activeRelease.coverImage} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="primary" className="text-xs py-2.5">Upload New File</Button>
                    <Button variant="secondary" onClick={handleRunAiInspection} className="text-xs py-2.5">AI Generate Concept</Button>
                  </div>
                </div>
              )}

              {/* SHEET 3: AUDIO */}
              {activeSheet === 'audio' && (
                <div className="space-y-3 text-xs text-slate-300">
                  <p>Manage audio masters, stems, and loudness verification.</p>
                  <div className="p-3 rounded-2xl bg-white/5 space-y-2">
                    <div className="flex justify-between"><span>Format</span><strong className="text-white">24-bit 48kHz WAV</strong></div>
                    <div className="flex justify-between"><span>Integrated Loudness</span><strong className="text-emerald-400">-14.1 LUFS (Compliant)</strong></div>
                    <div className="flex justify-between"><span>True Peak</span><strong className="text-white">-1.0 dBTP</strong></div>
                  </div>
                  <Button variant="primary" className="w-full text-xs py-2.5">Upload Replacement WAV</Button>
                </div>
              )}

              {/* SHEET 4: DISTRIBUTION */}
              {activeSheet === 'distribution' && (
                <div className="space-y-3 text-xs text-slate-300">
                  <p>Select DSPs and marketplaces for immediate global distribution.</p>
                  <div className="space-y-2">
                    {platforms.map(p => (
                      <div key={p.id} className="flex justify-between items-center p-2.5 rounded-xl bg-white/5">
                        <span className="font-bold text-white">{p.name}</span>
                        <span className="text-emerald-400 font-bold">{p.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SHEET 5: LICENSING */}
              {activeSheet === 'licensing' && (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Copyright Line (C)</label>
                    <Input defaultValue="© 2026 Sonara Audio LLC" className="bg-white/5 border-white/10 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Phonographic Line (P)</label>
                    <Input defaultValue="℗ 2026 Sonara Records" className="bg-white/5 border-white/10 text-xs" />
                  </div>
                </div>
              )}

              {/* SHEET 6: PRICING */}
              {activeSheet === 'pricing' && (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Marketplace Stem Price ($)</label>
                    <Input value={marketplacePrice} onChange={(e) => setMarketplacePrice(e.target.value)} className="bg-white/5 border-white/10 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Store Single Track Price ($)</label>
                    <Input value={distributionPrice} onChange={(e) => setDistributionPrice(e.target.value)} className="bg-white/5 border-white/10 text-xs" />
                  </div>
                </div>
              )}

              {/* SHEET 7: AI ASSISTANT */}
              {activeSheet === 'ai' && (
                <div className="space-y-3 text-xs text-slate-300">
                  <p>AI Release Copilot is ready to analyze and optimize your distribution parameters.</p>
                  <Button onClick={handleRunAiInspection} variant="primary" className="w-full text-xs py-2.5">
                    Run Quality & Metadata Inspection
                  </Button>
                </div>
              )}

              <Button variant="secondary" onClick={() => setActiveSheet(null)} className="w-full text-xs py-2.5">
                Save & Close Sheet
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: FULLSCREEN ARTWORK */}
      <AnimatePresence>
        {isFullscreenArtworkOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl p-4 space-y-3 shadow-2xl relative"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-xs">{activeRelease.title} Artwork</h3>
                <button onClick={() => setIsFullscreenArtworkOpen(false)} className="p-1 rounded-full bg-white/10 text-slate-300">
                  <X size={16} />
                </button>
              </div>

              <div className="rounded-2xl overflow-hidden border border-white/10 aspect-square">
                <img src={activeRelease.coverImage} alt="Artwork" className="w-full h-full object-cover" />
              </div>

              <Button variant="secondary" onClick={() => setIsFullscreenArtworkOpen(false)} className="w-full text-xs py-2">
                Close Viewer
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: CREATE NEW RELEASE */}
      <AnimatePresence>
        {isNewReleaseModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl p-5 space-y-4 shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <h3 className="font-bold text-white text-base">Create New Release</h3>
                <button onClick={() => setIsNewReleaseModalOpen(false)} className="p-1.5 rounded-full bg-white/10 text-slate-300">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Release Title</label>
                  <Input 
                    value={newReleaseTitle}
                    onChange={(e) => setNewReleaseTitle(e.target.value)}
                    placeholder="e.g. Cybernetic Dreams EP"
                    className="bg-white/5 border-white/10 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Package Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Single', 'EP', 'Album'] as const).map((t) => (
                      <button 
                        key={t}
                        type="button"
                        onClick={() => setNewReleaseType(t)}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                          newReleaseType === t ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-white/5 border-white/10 text-slate-400'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Genre</label>
                  <Input 
                    value={newReleaseGenre}
                    onChange={(e) => setNewReleaseGenre(e.target.value)}
                    placeholder="e.g. Synthwave"
                    className="bg-white/5 border-white/10 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button variant="primary" onClick={handleCreateNewRelease} className="flex-1 text-xs py-2.5">
                  Start Release
                </Button>
                <Button variant="secondary" onClick={() => setIsNewReleaseModalOpen(false)} className="px-4 text-xs py-2.5">
                  Cancel
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

function StatusCard({ label, count, color, isActive }: { label: string; count: number; color: string; isActive: boolean }) {
  return (
    <div className={`p-3 rounded-2xl border transition-all flex flex-col justify-between ${color} ${isActive ? 'ring-2 ring-indigo-400' : ''}`}>
      <span className="text-[9px] font-extrabold uppercase tracking-wider block">{label}</span>
      <span className="text-xl font-black text-white">{count}</span>
    </div>
  );
}
