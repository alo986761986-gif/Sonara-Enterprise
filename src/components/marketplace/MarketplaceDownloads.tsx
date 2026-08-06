import React, { useState } from 'react';
import { 
  Download, 
  CheckCircle2, 
  Package, 
  Heart, 
  RefreshCw, 
  ExternalLink,
  ShieldCheck,
  Star
} from 'lucide-react';
import { MarketplaceItem } from './types';

interface MarketplaceDownloadsProps {
  purchasedItems: MarketplaceItem[];
}

export const MarketplaceDownloads: React.FC<MarketplaceDownloadsProps> = ({
  purchasedItems,
}) => {
  const [activeTab, setActiveTab] = useState<'library' | 'purchases' | 'favorites' | 'updates'>('library');

  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col p-8 overflow-y-auto font-sans select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">My Marketplace Library</h1>
          <p className="text-xs text-slate-400 mt-1">Manage downloaded sound packages, license certificates & offline stems</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-800 pb-4">
        <button
          onClick={() => setActiveTab('library')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'library' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          Installed Library ({purchasedItems.length})
        </button>
        <button
          onClick={() => setActiveTab('purchases')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'purchases' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          Purchased Receipts
        </button>
        <button
          onClick={() => setActiveTab('updates')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'updates' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          Updates Available (0)
        </button>
      </div>

      {/* Items List */}
      <div className="space-y-4">
        {purchasedItems.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl">
            <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-white">Your library is currently empty</h3>
            <p className="text-xs text-slate-400 mt-1">Explore the marketplace to acquire professional sample packs & synth presets.</p>
          </div>
        ) : (
          purchasedItems.map(item => (
            <div key={item.id} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between backdrop-blur-md">
              <div className="flex items-center gap-4">
                <img src={item.coverUrl} alt={item.title} className="w-14 h-14 rounded-xl object-cover" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{item.title}</h3>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold flex items-center gap-1">
                      <ShieldCheck size={12} /> Licensed
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">By {item.creatorName} • v{item.version} • {item.license}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-extrabold flex items-center gap-2 hover:scale-105 transition-all shadow-md shadow-purple-600/20">
                  <Download size={14} />
                  <span>Download Package (ZIP)</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MarketplaceDownloads;
