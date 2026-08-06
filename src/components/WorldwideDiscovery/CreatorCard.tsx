// CreatorCard.tsx - Reusable Creator & Studio Highlight Card Component
import React from 'react';
import { motion } from 'motion/react';
import { Play, UserPlus, Check, Sparkles, MapPin, Radio, Heart } from 'lucide-react';
import { EarthMarker } from '../discovery/MarkerManager';
import { HoverEngine, AnimationEngine } from '../../lib/animation-system';

export interface CreatorCardProps {
  creator: EarthMarker;
  isFollowing?: boolean;
  onToggleFollow?: (id: string) => void;
  onPlayPreview?: (creator: EarthMarker) => void;
  onSelectCreator?: (creator: EarthMarker) => void;
}

export const CreatorCard: React.FC<CreatorCardProps> = ({
  creator,
  isFollowing = false,
  onToggleFollow,
  onPlayPreview,
  onSelectCreator,
}) => {
  return (
    <motion.div
      variants={AnimationEngine.cardLift}
      whileHover="hover"
      className="bg-slate-900/90 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-3.5 shadow-lg backdrop-blur-xl transition-all cursor-pointer group flex flex-col gap-2.5"
      onClick={() => onSelectCreator && onSelectCreator(creator)}
    >
      {/* Header: Avatar, Name, Verified, Flag */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center text-white font-black text-sm shadow-md">
              {creator.avatar ? (
                <img src={creator.avatar} alt={creator.displayName} className="w-full h-full object-cover" />
              ) : (
                creator.displayName.substring(0, 2).toUpperCase()
              )}
            </div>
            {creator.online && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />
            )}
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                {creator.displayName}
              </span>
              <span className="text-sm">{creator.flag}</span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">@{creator.username}</span>
          </div>
        </div>

        {/* Live Status Badge */}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-[9px] font-bold text-purple-300">
          <Radio className="w-2.5 h-2.5 text-purple-400 animate-pulse" />
          {creator.liveStatus}
        </div>
      </div>

      {/* Meta Info: Location, Genre, Followers */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
        <div className="flex items-center gap-1">
          <MapPin className="w-3 h-3 text-cyan-400" />
          <span>{creator.city}, {creator.country}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold">
            {creator.genre}
          </span>
          <span className="font-semibold text-slate-300">{creator.followers.toLocaleString()} fans</span>
        </div>
      </div>

      {/* Current Working Project */}
      {creator.currentProject && (
        <div className="bg-slate-950/80 p-2 rounded-xl text-[10px] text-slate-300 border border-slate-800/80 flex items-center justify-between">
          <span className="truncate font-medium text-slate-400">🎵 {creator.currentProject}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onPlayPreview) onPlayPreview(creator);
            }}
            className="p-1 rounded-lg bg-purple-600/80 hover:bg-purple-500 text-white transition-colors shrink-0 ml-1"
            aria-label="Play Preview"
          >
            <Play className="w-3 h-3 fill-white" />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <motion.button
          {...HoverEngine.button}
          onClick={(e) => {
            e.stopPropagation();
            if (onToggleFollow) onToggleFollow(creator.id);
          }}
          className={`flex-1 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all border ${
            isFollowing
              ? 'bg-slate-800 text-slate-300 border-slate-700'
              : 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400 shadow-md shadow-purple-500/20'
          }`}
        >
          {isFollowing ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" /> Following
            </>
          ) : (
            <>
              <UserPlus className="w-3 h-3" /> Follow
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
};
