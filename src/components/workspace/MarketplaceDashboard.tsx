// MarketplaceDashboard.tsx - Sonara Marketplace & Rights Engine UI
import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  DollarSign,
  Globe,
  Percent,
  ShieldCheck,
  Layers,
  Radio,
  TrendingUp,
  BarChart2,
  Disc,
  Sparkles,
  CheckCircle,
  PlusCircle,
  Archive,
  RefreshCw,
  Send,
  Users,
  Award,
  Loader2,
  Lock,
  Music,
  Share2,
  ExternalLink,
  ChevronRight,
  Sliders,
  DollarSign as EuroIcon
} from 'lucide-react';

export type LicenseType = 
  | 'DEMO'
  | 'PRIVATE'
  | 'PUBLIC'
  | 'COMMERCIAL'
  | 'EXCLUSIVE'
  | 'ROYALTY_FREE'
  | 'PREMIUM';

export type DspPlatform = 
  | 'SPOTIFY'
  | 'APPLE_MUSIC'
  | 'YOUTUBE_MUSIC'
  | 'AMAZON_MUSIC'
  | 'DEEZER'
  | 'TIKTOK'
  | 'INSTAGRAM';

export interface RoyaltySplit {
  contributorId: string;
  name: string;
  role: 'PRODUCER_AI' | 'SINGER_AI' | 'COMPOSER_AI' | 'PUBLISHER' | 'LABEL' | 'ARTIST';
  splitPercentage: number;
  totalEarnedEur: number;
}

export interface SongStats {
  streams: number;
  downloads: number;
  salesCount: number;
  totalRoyaltyEur: number;
  licenseSalesEur: number;
  performanceScore: number;
}

export interface CatalogSong {
  id: string;
  title: string;
  ownerId: string;
  artistId: string;
  artistName: string;
  creationDate: string;
  version: string;
  status: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT';
  licenseType: LicenseType;
  priceEur: number;
  commercialRights: boolean;
  usageRights: string[];
  royaltySplits: RoyaltySplit[];
  dspDistribution: Record<DspPlatform, 'DRAFT' | 'SUBMITTED' | 'DISTRIBUTED' | 'REJECTED'>;
  stats: SongStats;
  audioUrl?: string;
  genre: string;
  durationSec: number;
}

export interface LicenseTransaction {
  transactionId: string;
  songId: string;
  songTitle: string;
  buyerId: string;
  buyerName: string;
  licenseType: LicenseType;
  amountEur: number;
  timestamp: string;
  distributedRoyalties: { contributorId: string; name: string; amountEur: number }[];
}

export const MarketplaceDashboard: React.FC = () => {
  const [songs, setSongs] = useState<CatalogSong[]>([]);
  const [transactions, setTransactions] = useState<LicenseTransaction[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'royalties' | 'distribution' | 'publish' | 'transactions'>('catalog');
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);

  // Publish Form state
  const [pubTitle, setPubTitle] = useState('');
  const [pubArtistName, setPubArtistName] = useState('Cyberia Nova');
  const [pubGenre, setPubGenre] = useState('Synthwave / Cyberpop');
  const [pubLicense, setPubLicense] = useState<LicenseType>('COMMERCIAL');
  const [pubPrice, setPubPrice] = useState('149.00');
  const [pubCommercialRights, setPubCommercialRights] = useState(true);
  const [publishing, setPublishing] = useState(false);

  // Royalty Simulation State
  const [royaltyGrossEur, setRoyaltyGrossEur] = useState('500.00');
  const [simulatingRoyalty, setSimulatingRoyalty] = useState(false);

  // License Sale Simulation State
  const [buyerName, setBuyerName] = useState('Universal Media Group');
  const [purchasing, setPurchasing] = useState(false);

  // DSP Distributing State
  const [distributing, setDistributing] = useState(false);

  // Toast notification
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchMarketplaceData = async () => {
    try {
      const [catRes, statsRes, txRes] = await Promise.all([
        fetch('/api/marketplace/catalog'),
        fetch('/api/marketplace/stats'),
        fetch('/api/marketplace/transactions')
      ]);

      const catData = await catRes.json();
      const statsData = await statsRes.json();
      const txData = await txRes.json();

      if (catData.success && catData.songs) {
        setSongs(catData.songs);
        if (catData.songs.length > 0 && !selectedSongId) {
          setSelectedSongId(catData.songs[0].id);
        }
      }

      if (statsData.success) {
        setStats(statsData.stats);
      }

      if (txData.success && txData.transactions) {
        setTransactions(txData.transactions);
      }
    } catch (err) {
      console.error('Failed to load marketplace data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketplaceData();
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => {
      setToastMsg(null);
    }, 4000);
  };

  const handlePublishSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pubTitle) {
      showToast('error', 'Please enter a song title.');
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch('/api/marketplace/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: pubTitle,
          artistName: pubArtistName,
          genre: pubGenre,
          licenseType: pubLicense,
          priceEur: parseFloat(pubPrice) || 99.0,
          commercialRights: pubCommercialRights,
          usageRights: pubCommercialRights ? ['Streaming', 'Broadcast', 'Film/TV Sync', 'Metaverse'] : ['Personal Streaming Only']
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', `Song "${pubTitle}" published to Marketplace successfully!`);
        setPubTitle('');
        await fetchMarketplaceData();
        setSelectedSongId(data.song.id);
        setActiveSubTab('catalog');
      } else {
        showToast('error', data.error || 'Failed to publish song');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setPublishing(false);
    }
  };

  const handleSimulateRoyalty = async () => {
    if (!selectedSongId) return;
    setSimulatingRoyalty(true);
    try {
      const amount = parseFloat(royaltyGrossEur) || 100.0;
      const res = await fetch('/api/marketplace/generate-royalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId: selectedSongId,
          grossAmountEur: amount
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', `Generated €${amount.toFixed(2)} in royalties! Distributed automatically among AI collaborators.`);
        await fetchMarketplaceData();
      } else {
        showToast('error', data.error || 'Royalty generation failed');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setSimulatingRoyalty(false);
    }
  };

  const handleSellLicense = async () => {
    if (!selectedSongId) return;
    setPurchasing(true);
    try {
      const res = await fetch('/api/marketplace/sell-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId: selectedSongId,
          buyerId: `buyer-${Date.now()}`,
          buyerName: buyerName || 'Enterprise Licensee'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', `Commercial License purchased by ${buyerName}! €${data.transaction.amountEur} split & credited.`);
        await fetchMarketplaceData();
      } else {
        showToast('error', data.error || 'License sale failed');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setPurchasing(false);
    }
  };

  const handleDistributeDsp = async () => {
    if (!selectedSongId) return;
    setDistributing(true);
    try {
      const res = await fetch('/api/marketplace/distribute-dsp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId: selectedSongId
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', `Distributed "${data.distResult.songTitle}" to all 7 DSP platforms (Spotify, Apple Music, TikTok...)`);
        await fetchMarketplaceData();
      } else {
        showToast('error', data.error || 'DSP Distribution failed');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setDistributing(false);
    }
  };

  const handleArchiveSong = async (id: string) => {
    if (!window.confirm('Archive this song from the public marketplace?')) return;
    try {
      const res = await fetch('/api/marketplace/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'Song status set to ARCHIVED.');
        await fetchMarketplaceData();
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-4" id="marketplace-loading">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <span className="font-semibold text-sm">Loading Sonara Marketplace & Rights Engine...</span>
      </div>
    );
  }

  const selectedSong = songs.find(s => s.id === selectedSongId) || songs[0];

  return (
    <div className="space-y-6" id="marketplace-dashboard-root">
      
      {/* Toast Alert */}
      {toastMsg && (
        <div 
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-2xl flex items-center gap-3 border text-sm max-w-md animate-in slide-in-from-bottom-5 duration-300 ${
            toastMsg.type === 'success' 
              ? 'bg-emerald-950 border-emerald-500/30 text-emerald-400' 
              : 'bg-rose-950 border-rose-500/30 text-rose-400'
          }`}
          id="marketplace-toast"
        >
          <Sparkles className={`w-5 h-5 shrink-0 ${toastMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`} />
          <p>{toastMsg.text}</p>
        </div>
      )}

      {/* Main Header Widget */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-slate-950 border border-slate-900 rounded-2xl shadow-xl">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-emerald-600/10 rounded-xl border border-emerald-500/20">
            <ShoppingBag className="w-7 h-7 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-wide">SONARA MARKETPLACE & RIGHTS ENGINE</h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Automated Split Protocol v2.5
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Publish songs, license commercial master rights, split multi-agent royalties automatically, and distribute to global DSP networks.
            </p>
          </div>
        </div>

        {/* Global Stats Badge */}
        {stats && (
          <div className="flex items-center gap-4 bg-slate-900/60 border border-slate-800 p-3 rounded-xl text-xs">
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Catalog Songs</span>
              <span className="text-white font-black">{stats.totalSongs} Active</span>
            </div>
            <div className="w-px h-8 bg-slate-800" />
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-bold block">License Sales</span>
              <span className="text-emerald-400 font-black">€{stats.totalSalesEur.toLocaleString()}</span>
            </div>
            <div className="w-px h-8 bg-slate-800" />
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Royalties Distributed</span>
              <span className="text-cyan-400 font-black">€{stats.totalRoyaltiesEur.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Primary Navigation Subtabs */}
      <div className="flex border-b border-slate-900 gap-1.5" id="marketplace-sub-tabs">
        <button
          onClick={() => setActiveSubTab('catalog')}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'catalog' 
              ? 'border-emerald-500 text-white' 
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Disc className="w-4 h-4 text-emerald-400" />
          <span>Master Catalog ({songs.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('royalties')}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'royalties' 
              ? 'border-emerald-500 text-white' 
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Percent className="w-4 h-4 text-cyan-400" />
          <span>Automated Royalty Split Engine</span>
        </button>

        <button
          onClick={() => setActiveSubTab('distribution')}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'distribution' 
              ? 'border-emerald-500 text-white' 
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Globe className="w-4 h-4 text-violet-400" />
          <span>DSP Auto-Distribution (Spotify, Apple...)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('transactions')}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'transactions' 
              ? 'border-emerald-500 text-white' 
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-amber-400" />
          <span>License Sales Audit Log ({transactions.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('publish')}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'publish' 
              ? 'border-emerald-500 text-white' 
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <PlusCircle className="w-4 h-4 text-emerald-400" />
          <span>Publish New Song</span>
        </button>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left/Middle Column (Interactive view) */}
        <div className="lg:col-span-2 space-y-6">

          {/* CATALOG SUB-TAB */}
          {activeSubTab === 'catalog' && (
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Disc className="w-4 h-4 text-emerald-400" />
                  <span>Marketplace Master Songs Catalog</span>
                </h3>
                <span className="text-[10px] text-slate-500 font-bold">CLICK SONG TO INSPECT RIGHTS & ROYALTIES</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {songs.map((song) => (
                  <div
                    key={song.id}
                    onClick={() => setSelectedSongId(song.id)}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-all space-y-3 relative group ${
                      selectedSongId === song.id
                        ? 'bg-emerald-600/10 border-emerald-500 shadow-lg shadow-emerald-600/5'
                        : 'bg-slate-900/40 border-slate-900 hover:border-slate-800 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-black text-white text-base group-hover:text-emerald-400 transition-colors">
                          {song.title}
                        </h4>
                        <p className="text-[10px] font-bold text-slate-400">
                          {song.artistName} • <span className="text-emerald-400">{song.genre}</span>
                        </p>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                        song.licenseType === 'EXCLUSIVE'
                          ? 'bg-amber-950/60 text-amber-400 border-amber-800/40'
                          : song.licenseType === 'COMMERCIAL'
                          ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {song.licenseType}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-900/80 text-[11px]">
                      <div className="flex items-center gap-1 font-bold text-white">
                        <EuroIcon className="w-3.5 h-3.5 text-emerald-400" />
                        <span>€{song.priceEur.toFixed(2)}</span>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium">
                        <span>Streams: <strong className="text-slate-200">{song.stats.streams.toLocaleString()}</strong></span>
                        <span>Sales: <strong className="text-emerald-400">{song.stats.salesCount}</strong></span>
                      </div>
                    </div>

                    {/* Usage Rights tags */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {song.usageRights.slice(0, 3).map((ur, idx) => (
                        <span key={idx} className="text-[9px] font-bold bg-slate-950 text-slate-400 px-2 py-0.5 rounded border border-slate-900">
                          {ur}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ROYALTIES SPLIT ENGINE SUB-TAB */}
          {activeSubTab === 'royalties' && selectedSong && (
            <div className="space-y-6">
              
              {/* Royalty Split Breakdown Card */}
              <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 space-y-4">
                <div>
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                    Automatic Collaborator Division Protocol
                  </span>
                  <h3 className="text-base font-black text-white">
                    {selectedSong.title} — Royalty Split Matrix
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Every commercial stream or license transaction splits revenue instantly across AI Producer, Vocalist, Lyric Composer, and Virtual Artist.
                  </p>
                </div>

                {/* Visual Splits Progress / Cards */}
                <div className="space-y-3">
                  {selectedSong.royaltySplits.map((split, idx) => (
                    <div key={idx} className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded font-mono text-[9px] font-bold bg-violet-950 text-violet-300 border border-violet-800/40">
                            {split.role}
                          </span>
                          <span className="font-bold text-white">{split.name}</span>
                        </div>

                        <div className="text-right">
                          <span className="font-black text-cyan-400 text-sm">{split.splitPercentage}% Split</span>
                          <span className="text-[10px] text-slate-400 block font-mono">Earned: €{split.totalEarnedEur.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Percentage Bar */}
                      <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                        <div 
                          className={`h-full ${
                            split.role === 'PRODUCER_AI' ? 'bg-violet-500' :
                            split.role === 'SINGER_AI' ? 'bg-cyan-400' :
                            split.role === 'COMPOSER_AI' ? 'bg-amber-400' : 'bg-emerald-400'
                          }`} 
                          style={{ width: `${split.splitPercentage}%` }} 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Royalty Generator Simulator */}
              <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Percent className="w-4 h-4 text-emerald-400" />
                  <span>Simulate Streaming & Sync Gross Royalty Distribution</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-400">Gross Royalty Revenue (€)</label>
                    <input
                      type="number"
                      value={royaltyGrossEur}
                      onChange={(e) => setRoyaltyGrossEur(e.target.value)}
                      className="w-full py-2 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={handleSimulateRoyalty}
                      disabled={simulatingRoyalty}
                      className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {simulatingRoyalty ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      <span>Execute Royalty Split Distribution</span>
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* DSP DISTRIBUTION SUB-TAB */}
          {activeSubTab === 'distribution' && selectedSong && (
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 space-y-5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Globe className="w-4 h-4 text-violet-400" />
                    <span>Multi-DSP Automatic Distribution Network</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Direct distribution pipeline to major streaming platforms and social audio networks for "{selectedSong.title}".
                  </p>
                </div>

                <button
                  onClick={handleDistributeDsp}
                  disabled={distributing}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition-all flex items-center gap-2 shadow-lg shadow-violet-600/20 disabled:opacity-50"
                >
                  {distributing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Trigger Automated Distribution</span>
                </button>
              </div>

              {/* DSP Platforms Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { name: 'Spotify', key: 'SPOTIFY', color: 'text-emerald-400' },
                  { name: 'Apple Music', key: 'APPLE_MUSIC', color: 'text-rose-400' },
                  { name: 'YouTube Music', key: 'YOUTUBE_MUSIC', color: 'text-red-500' },
                  { name: 'Amazon Music', key: 'AMAZON_MUSIC', color: 'text-cyan-400' },
                  { name: 'Deezer', key: 'DEEZER', color: 'text-purple-400' },
                  { name: 'TikTok', key: 'TIKTOK', color: 'text-pink-400' },
                  { name: 'Instagram Audio', key: 'INSTAGRAM', color: 'text-amber-400' }
                ].map((dsp) => {
                  const status = selectedSong.dspDistribution[dsp.key as DspPlatform] || 'DRAFT';
                  return (
                    <div key={dsp.key} className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl space-y-2">
                      <div className="flex justify-between items-center">
                        <span className={`font-bold text-xs ${dsp.color}`}>{dsp.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                          status === 'DISTRIBUTED' 
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800/40' 
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {status}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {status === 'DISTRIBUTED' ? 'Global live stream active' : 'Ready for auto-delivery submission'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TRANSACTIONS AUDIT LOG SUB-TAB */}
          {activeSubTab === 'transactions' && (
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                <span>Commercial License Sales & Transaction Audit Log</span>
              </h3>

              {transactions.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-6 text-center">No license transactions executed yet.</p>
              ) : (
                <div className="space-y-3">
                  {transactions.map((tx) => (
                    <div key={tx.transactionId} className="p-3.5 bg-slate-900/40 border border-slate-800 rounded-xl space-y-2 text-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-bold text-white block">{tx.songTitle}</span>
                          <span className="text-[10px] text-slate-400">Buyer: <strong>{tx.buyerName}</strong> ({tx.buyerId})</span>
                        </div>

                        <div className="text-right">
                          <span className="font-black text-emerald-400 text-sm block">€{tx.amountEur.toFixed(2)}</span>
                          <span className="text-[9px] text-slate-500 font-mono">{new Date(tx.timestamp).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-900 flex flex-wrap gap-2 text-[10px]">
                        {tx.distributedRoyalties.map((r, i) => (
                          <span key={i} className="bg-slate-950 px-2 py-0.5 rounded text-cyan-400 border border-slate-800">
                            {r.name}: <strong>€{r.amountEur.toFixed(2)}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PUBLISH SONG SUB-TAB */}
          {activeSubTab === 'publish' && (
            <form onSubmit={handlePublishSong} className="bg-slate-950 border border-slate-900 rounded-2xl p-5 space-y-5">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <PlusCircle className="w-4 h-4 text-emerald-400" />
                  <span>Publish Song to Sonara Marketplace</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Register a master song entry with custom licensing parameters, usage rights, and automatic split rules.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-400">Song Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Electric Reverie"
                    value={pubTitle}
                    onChange={(e) => setPubTitle(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-400">Virtual Artist Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Cyberia Nova"
                    value={pubArtistName}
                    onChange={(e) => setPubArtistName(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-400">Genre / Style</label>
                  <input
                    type="text"
                    placeholder="e.g. Synthwave / Cyberpop"
                    value={pubGenre}
                    onChange={(e) => setPubGenre(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-400">License Tier</label>
                  <select
                    value={pubLicense}
                    onChange={(e) => setPubLicense(e.target.value as LicenseType)}
                    className="w-full py-2 px-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white outline-none focus:border-emerald-500"
                  >
                    <option value="DEMO">DEMO</option>
                    <option value="PRIVATE">PRIVATE</option>
                    <option value="PUBLIC">PUBLIC</option>
                    <option value="COMMERCIAL">COMMERCIAL</option>
                    <option value="EXCLUSIVE">EXCLUSIVE</option>
                    <option value="ROYALTY_FREE">ROYALTY_FREE</option>
                    <option value="PREMIUM">PREMIUM</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-400">Master License Price (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pubPrice}
                    onChange={(e) => setPubPrice(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="cb-comm"
                    checked={pubCommercialRights}
                    onChange={(e) => setPubCommercialRights(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-0 bg-slate-900 border-slate-800"
                  />
                  <label htmlFor="cb-comm" className="text-xs font-bold text-white cursor-pointer">
                    Grant Full Commercial Rights
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={publishing}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                <span>Publish Master Song & Activate Split Rules</span>
              </button>
            </form>
          )}

        </div>

        {/* Right Column (Commercial License Purchase Simulator & Selected Song Inspector) */}
        <div className="space-y-6">
          
          {/* Active Song Licensing Inspector */}
          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 space-y-4" id="marketplace-inspector">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-900">
              <ShieldCheck className="w-4.5 h-4.5 text-emerald-400 animate-pulse" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">License Inspector</h3>
            </div>

            {selectedSong ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-lg font-black text-white">{selectedSong.title}</h4>
                  <p className="text-xs text-emerald-400 font-bold">{selectedSong.artistName}</p>
                  <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{selectedSong.id} • {selectedSong.version}</span>
                </div>

                {/* Pricing & Commercial Status */}
                <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">License Price:</span>
                    <span className="font-black text-emerald-400 text-sm">€{selectedSong.priceEur.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">License Type:</span>
                    <span className="font-bold text-amber-300">{selectedSong.licenseType}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Commercial Rights:</span>
                    <span className={`font-bold ${selectedSong.commercialRights ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {selectedSong.commercialRights ? 'GRANTED' : 'RESTRICTED'}
                    </span>
                  </div>
                </div>

                {/* Purchase Commercial License Simulator */}
                <div className="p-4 bg-emerald-950/20 border border-emerald-900/30 rounded-xl space-y-3">
                  <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Purchase Commercial License</span>
                  </h5>

                  <input
                    type="text"
                    placeholder="Buyer Name (e.g. Universal Music)"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    className="w-full py-1.5 px-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white outline-none focus:border-emerald-500"
                  />

                  <button
                    onClick={handleSellLicense}
                    disabled={purchasing}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {purchasing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    <span>Buy Commercial Rights (€{selectedSong.priceEur})</span>
                  </button>
                </div>

                {selectedSong.status === 'PUBLISHED' && (
                  <button
                    onClick={() => handleArchiveSong(selectedSong.id)}
                    className="w-full py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-400 transition-all flex items-center justify-center gap-1.5 border border-slate-800"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Archive Song from Marketplace</span>
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic text-center py-6">
                Select a song to inspect rights & license terms.
              </p>
            )}
          </div>

          {/* Director AI Rights Alignment */}
          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400 animate-pulse" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Rights Engine Synchronization</h4>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Director AI monitors all song transactions, enforcing non-repudiable split execution and real-time DSP delivery pipelines.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
};
