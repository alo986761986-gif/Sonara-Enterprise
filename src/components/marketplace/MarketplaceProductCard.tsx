import React, { useState } from 'react';
import { Star, Download, Heart, Play, CheckCircle2 } from 'lucide-react';
import { Card } from '../core/Card';
import { motion } from 'motion/react';

export interface MarketplaceProductCardProps {
  id?: string;
  name: string;
  creator: string;
  price: string;
  rating?: number;
  downloads?: string;
  category?: string;
  imageBg?: string;
  isOwned?: boolean;
  onSelect?: () => void;
}

export const MarketplaceProductCard: React.FC<MarketplaceProductCardProps> = ({
  name,
  creator,
  price,
  rating = 4.9,
  downloads = '1.2k',
  category = 'Audio Stem',
  imageBg = 'from-indigo-600/30 to-violet-600/20',
  isOwned = false,
  onSelect
}) => {
  const [favorite, setFavorite] = useState(false);

  return (
    <Card 
      variant="interactive" 
      onClick={onSelect}
      className="p-3 bg-white/[0.02] border-white/10 hover:border-indigo-500/30 flex flex-col gap-3 group select-none active:scale-[0.98] transition-all"
    >
      {/* Artwork Container */}
      <div className={`relative w-full h-36 sm:h-44 rounded-2xl bg-gradient-to-tr ${imageBg} border border-white/10 overflow-hidden flex items-center justify-center`}>
        {/* Play overlay button */}
        <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white group-hover:scale-110 transition-transform shadow-lg">
          <Play size={18} className="fill-current ml-0.5" />
        </div>

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/40 backdrop-blur-md text-white/90 border border-white/10 uppercase tracking-wider">
            {category}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFavorite(!favorite);
            }}
            className="pointer-events-auto w-8 h-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:text-rose-400 transition-colors"
          >
            <Heart size={14} className={favorite ? "fill-rose-500 text-rose-500" : ""} />
          </button>
        </div>

        {/* Owned indicator */}
        {isOwned && (
          <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-emerald-500/20 backdrop-blur-md border border-emerald-500/40 text-emerald-300 font-bold text-[10px] flex items-center gap-1">
            <CheckCircle2 size={10} />
            <span>Owned</span>
          </div>
        )}
      </div>

      {/* Meta Info */}
      <div className="flex flex-col gap-1.5 px-0.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-bold text-white text-sm sm:text-base truncate">{name}</h4>
          <span className="font-black text-indigo-400 text-sm shrink-0">{price}</span>
        </div>

        <p className="text-xs text-slate-400 font-medium truncate">By {creator}</p>

        <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium pt-1 border-t border-white/5 mt-0.5">
          <div className="flex items-center gap-1 text-amber-400 font-bold">
            <Star size={12} className="fill-current" />
            <span>{rating.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1 text-slate-400">
            <Download size={12} />
            <span>{downloads}</span>
          </div>
        </div>
      </div>
    </Card>
  );
};
