// MarketplaceDashboard.tsx - Assets Sold, Downloads, Conversion Rate & Top Categories
import React from 'react';
import { ShoppingBag, Download, Star, Percent, Sparkles, TrendingUp, Layers } from 'lucide-react';

export const MarketplaceDashboard: React.FC = () => {
  const marketplaceStats = [
    { label: 'Assets Sold', value: '2,580', change: '+320 this mo', icon: ShoppingBag, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    { label: 'Total Downloads', value: '8,420', change: '+1.2K this mo', icon: Download, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
    { label: 'Storefront Favorites', value: '1,840', change: '+210 stars', icon: Star, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
    { label: 'Store Conversion Rate', value: '4.85%', change: '+0.6% vs avg', icon: Percent, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  ];

  const topPacks = [
    { title: 'Cyberpunk Vocal Chops & Acapellas Vol. 3', sales: 1240, revenue: '$37,180', rating: 4.9 },
    { title: 'Serum Cybernetic Leads & Pads', sales: 890, revenue: '$17,790', rating: 5.0 },
    { title: 'Midnight Echoes WAV Stems & MIDI', sales: 450, revenue: '$6,745', rating: 4.8 },
  ];

  return (
    <div className="space-y-6 font-sans text-xs select-none">
      {/* 4 Marketplace Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {marketplaceStats.map((ms, idx) => {
          const Icon = ms.icon;
          return (
            <div key={idx} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">{ms.label}</span>
                <div className={`p-2 rounded-xl border ${ms.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-white font-mono">{ms.value}</div>
              <p className="text-[10px] text-emerald-400 font-bold">{ms.change}</p>
            </div>
          );
        })}
      </div>

      {/* Top Assets Performance */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="font-extrabold text-white text-sm">Top Storefront Sample Packs & Presets</h3>
          <span className="text-emerald-400 font-bold font-mono">Top 1% Global Creator</span>
        </div>

        <div className="space-y-3">
          {topPacks.map((pack, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="space-y-1">
                <span className="font-extrabold text-white text-xs">{pack.title}</span>
                <div className="flex items-center gap-3 text-[10px] text-slate-400">
                  <span>{pack.sales} Units Sold</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-amber-400 font-bold">
                    <Star className="w-3 h-3 fill-amber-400" /> {pack.rating} Rating
                  </span>
                </div>
              </div>

              <span className="font-mono font-black text-emerald-400 text-sm">{pack.revenue}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MarketplaceDashboard;
