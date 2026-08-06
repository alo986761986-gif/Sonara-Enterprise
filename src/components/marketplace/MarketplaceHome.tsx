import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Heart, 
  Bell, 
  ShoppingBag, 
  Sparkles, 
  Star, 
  Download, 
  Flame, 
  Filter, 
  X, 
  Play, 
  Share2, 
  CheckCircle2, 
  ArrowRight,
  ShieldCheck,
  Zap,
  Music,
  Mic,
  Sliders,
  Image,
  FileText,
  Radio
} from 'lucide-react';
import { Card } from '../core/Card';
import { Button } from '../core/Button';
import { Input } from '../ui/Input';
import { MarketplaceProductCard } from './MarketplaceProductCard';
import { MarketplaceDesktop } from './MarketplaceDesktop';
import { localizationEngine } from '../../lib/global/LocalizationEngine';
import { variants, transitions } from '../../lib/motion';

const CATEGORIES = [
  'All', 'Music', 'Vocals', 'Beats', 'Plugins', 'Artwork', 'Templates', 'Lyrics', 'AI', 'FX', 'Samples', 'Presets', 'Fonts', 'Video'
];

interface ProductDetail {
  id: string;
  name: string;
  creator: string;
  price: string;
  rating: number;
  downloads: string;
  category: string;
  description: string;
  isOwned?: boolean;
}

export const MarketplaceHome: React.FC = React.memo(() => {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'store' | 'downloads' | 'purchases'>('store');
  const [wishlistCount, setWishlistCount] = useState(3);

  const featuredItems = [
    {
      id: 'f1',
      title: 'Analog Prophet V Master Synth Pack',
      creator: 'Aether Audio',
      price: localizationEngine.formatCurrency(49),
      category: 'Plugins & Presets',
      badge: 'Featured Release',
      bg: 'from-indigo-900/60 via-purple-900/40 to-slate-900'
    },
    {
      id: 'f2',
      title: 'Cyberpunk Vocal Stems Vol. 4',
      creator: 'Tokyo Soundworks',
      price: localizationEngine.formatCurrency(39),
      category: 'Vocals',
      badge: 'Editor\'s Choice',
      bg: 'from-violet-900/60 via-indigo-900/40 to-slate-900'
    }
  ];

  const trendingProducts = [
    { id: 't1', name: 'Berlin Techno Vol 2', creator: 'BerlinLab', price: localizationEngine.formatCurrency(35), rating: 4.9, downloads: '2.4k', category: 'Samples' },
    { id: 't2', name: 'London Grime Stems', creator: 'UKBeats', price: localizationEngine.formatCurrency(45), rating: 4.8, downloads: '1.8k', category: 'Vocals' },
    { id: 't3', name: 'Spanish Guitar Loops', creator: 'MadridSound', price: localizationEngine.formatCurrency(29), rating: 5.0, downloads: '3.1k', category: 'Music' },
    { id: 't4', name: 'Tokyo Lo-Fi Pack', creator: 'NipponPads', price: localizationEngine.formatCurrency(39), rating: 4.7, downloads: '950', category: 'Beats' },
  ];

  const recommendedProducts = [
    { id: 'r1', name: 'Deep House Bass Engine', creator: 'SonicLab', price: localizationEngine.formatCurrency(29), rating: 4.9, downloads: '1.1k', category: 'Presets' },
    { id: 'r2', name: 'Cinematic Grand Piano', creator: 'PianoMasters', price: localizationEngine.formatCurrency(49), rating: 5.0, downloads: '4.2k', category: 'Plugins' },
    { id: 'r3', name: 'Vocal Atmos Pack 01', creator: 'VoiceTech', price: localizationEngine.formatCurrency(39), rating: 4.8, downloads: '890', category: 'Vocals' },
    { id: 'r4', name: 'Ambient Texture Pads', creator: 'Atmosphere', price: localizationEngine.formatCurrency(25), rating: 4.6, downloads: '2.1k', category: 'FX' },
  ];

  const ownedDownloads = [
    { id: 'd1', name: 'Cyberpunk Vocal Stems Vol. 4', creator: 'Tokyo Soundworks', size: '142 MB', date: 'Downloaded yesterday' },
    { id: 'd2', name: 'Spanish Guitar Loops', creator: 'MadridSound', size: '88 MB', date: 'Downloaded Jul 28' },
  ];

  return (
    <>
      {/* DESKTOP 2.0 MARKETPLACE STOREFRONT */}
      <div className="hidden lg:block w-full -m-4 sm:-m-6">
        <MarketplaceDesktop />
      </div>

      {/* MOBILE & TABLET LAYOUT */}
      <motion.div 
        initial="initial"
        animate="animate"
        variants={variants.staggerContainer}
        className="lg:hidden space-y-6 pb-12 w-full max-w-full overflow-hidden"
      >
      {/* TOP APP BAR HEADER */}
      <motion.div variants={variants.slideUp} transition={transitions.comfort} className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-widest">
            <ShoppingBag size={14} />
            <span>Digital Assets Store</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-0.5">
            Marketplace
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button className="relative p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 active:scale-95 transition-all">
            <Heart size={18} />
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center">
                {wishlistCount}
              </span>
            )}
          </button>
          <button className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 active:scale-95 transition-all">
            <Bell size={18} />
          </button>
        </div>
      </motion.div>

      {/* STORE SUB-NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'store', label: 'Explore Store' },
          { id: 'downloads', label: `Offline Downloads (${ownedDownloads.length})` },
          { id: 'purchases', label: 'My Purchases' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 border border-indigo-400/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'store' && (
        <>
          {/* STICKY UNIVERSAL SEARCH */}
          <motion.div variants={variants.slideUp} transition={transitions.comfort} className="relative">
            <div className="relative flex items-center gap-2">
              <Search size={18} className="absolute left-4 text-slate-400 pointer-events-none" />
              <Input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Beats, Vocals, Plugins, Presets..."
                className="pl-11 pr-12 bg-white/[0.04] border-white/10 rounded-2xl"
              />
              <button className="absolute right-3 p-1.5 rounded-xl bg-white/10 text-slate-300 hover:text-white active:scale-95">
                <Filter size={16} />
              </button>
            </div>
          </motion.div>

          {/* CATEGORY CHIPS */}
          <motion.div variants={variants.slideUp} transition={transitions.comfort} className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 pb-1">
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/20 border border-indigo-400/30'
                      : 'bg-white/[0.03] text-slate-400 hover:text-slate-200 border border-white/5'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </motion.div>

          {/* FEATURED BANNER */}
          <motion.div variants={variants.slideUp} transition={transitions.comfort}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                <Sparkles size={14} />
                <span>Featured Spotlights</span>
              </div>
            </div>

            <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
              {featuredItems.map((item) => (
                <Card 
                  key={item.id} 
                  variant="premium" 
                  className={`min-w-[280px] sm:min-w-[380px] p-5 bg-gradient-to-br ${item.bg} border-indigo-500/30 flex flex-col justify-between shrink-0 cursor-pointer group active:scale-[0.98] transition-all`}
                  onClick={() => setSelectedProduct({
                    id: item.id,
                    name: item.title,
                    creator: item.creator,
                    price: item.price,
                    rating: 5.0,
                    downloads: '4.8k',
                    category: item.category,
                    description: 'Professional high-grade master collection tuned for modern electronic music production.'
                  })}
                >
                  <div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                      {item.badge}
                    </span>
                    <h3 className="text-lg sm:text-xl font-bold text-white mt-3 group-hover:text-indigo-200 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">By {item.creator} • {item.category}</p>
                  </div>

                  <div className="flex items-center justify-between mt-6 pt-3 border-t border-white/10">
                    <span className="text-lg font-black text-white">{item.price}</span>
                    <Button variant="primary" size="sm">
                      Inspect Release
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </motion.div>

          {/* TRENDING ASSETS (Horizontal Scroll) */}
          <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame size={16} className="text-rose-400" />
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trending Assets</h3>
              </div>
              <button className="text-xs font-semibold text-indigo-400 hover:underline">View All</button>
            </div>

            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
              {trendingProducts.map((prod) => (
                <div key={prod.id} className="min-w-[200px] max-w-[220px] shrink-0">
                  <MarketplaceProductCard 
                    {...prod} 
                    onSelect={() => setSelectedProduct({
                      ...prod,
                      description: 'Top trending asset in high demand across global production hubs.'
                    })}
                  />
                </div>
              ))}
            </div>
          </motion.div>

          {/* RECOMMENDED (2-col Adaptive Grid) */}
          <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recommended For You</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {recommendedProducts.map((prod) => (
                <MarketplaceProductCard 
                  key={prod.id} 
                  {...prod} 
                  onSelect={() => setSelectedProduct({
                    ...prod,
                    description: 'Hand-picked creative audio stem and preset collection matched to your production style.'
                  })}
                />
              ))}
            </div>
          </motion.div>
        </>
      )}

      {/* DOWNLOADS TAB */}
      {activeTab === 'downloads' && (
        <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-4">
          <Card variant="standard" className="p-4 bg-white/[0.02] border-white/5">
            <div className="flex items-center gap-3 pb-3 border-b border-white/5">
              <ShieldCheck className="text-emerald-400" size={20} />
              <div>
                <h3 className="font-bold text-white text-sm">Offline Storage Sync</h3>
                <p className="text-xs text-slate-400 mt-0.5">All assets are cached locally for live studio performance.</p>
              </div>
            </div>

            <div className="divide-y divide-white/5 mt-2">
              {ownedDownloads.map((dl) => (
                <div key={dl.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-white text-sm">{dl.name}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">By {dl.creator} • {dl.size} • {dl.date}</p>
                  </div>
                  <Button variant="secondary" size="sm">
                    Load Stems
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      {/* PURCHASES TAB */}
      {activeTab === 'purchases' && (
        <motion.div variants={variants.slideUp} transition={transitions.comfort} className="space-y-4">
          <Card variant="standard" className="p-4 bg-white/[0.02] border-white/5 space-y-3">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
              <CheckCircle2 size={16} />
              <span>Owned Licences</span>
            </div>
            <p className="text-xs text-slate-400">
              You own commercial licenses for 5 global marketplace releases.
            </p>
          </Card>
        </motion.div>
      )}

      {/* PRODUCT DETAILS BOTTOM SHEET / MODAL */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4">
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900 border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-5 shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                  {selectedProduct.category}
                </span>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="p-2 rounded-xl bg-white/5 text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Artwork Preview Header */}
              <div className="w-full h-44 rounded-2xl bg-gradient-to-tr from-indigo-600/40 via-violet-600/30 to-slate-900 border border-white/10 flex items-center justify-center relative overflow-hidden">
                <button className="w-14 h-14 rounded-full bg-indigo-600 text-white shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform">
                  <Play size={24} className="fill-current ml-1" />
                </button>
              </div>

              {/* Details */}
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">{selectedProduct.name}</h3>
                  <span className="text-xl font-black text-indigo-400">{selectedProduct.price}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Creator: <span className="text-white font-semibold">{selectedProduct.creator}</span></p>
                <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                  <div className="flex items-center gap-1 text-amber-400 font-bold">
                    <Star size={14} className="fill-current" />
                    <span>{selectedProduct.rating}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Download size={14} />
                    <span>{selectedProduct.downloads} Downloads</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
                <p className="text-xs text-slate-300 leading-relaxed">
                  {selectedProduct.description}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <Button variant="primary" className="flex-1">
                  Purchase License ({selectedProduct.price})
                </Button>
                <button className="p-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white">
                  <Share2 size={18} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  </>
  );
});
