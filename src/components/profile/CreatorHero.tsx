// CreatorHero.tsx - Large Cover, Avatar, Badges & Quick Actions
import React, { useState } from 'react';
import { 
  ShieldCheck, 
  MapPin, 
  Globe, 
  UserPlus, 
  UserCheck, 
  MessageSquare, 
  Handshake, 
  Send, 
  Briefcase, 
  Share2, 
  Sparkles, 
  Radio, 
  Check, 
  Flame,
  Award
} from 'lucide-react';

export interface CreatorHeroProps {
  onAction?: (actionName: string) => void;
}

export const CreatorHero: React.FC<CreatorHeroProps> = ({ onAction }) => {
  const [isFollowing, setIsFollowing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    onAction?.('Share');
  };

  return (
    <div className="w-full relative bg-slate-900 border-b border-slate-800 font-sans text-xs select-none overflow-hidden">
      {/* Large Cover Image with Gradient Overlay */}
      <div className="w-full h-64 md:h-80 relative overflow-hidden bg-slate-950">
        <img
          src="https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1600&auto=format&fit=crop"
          alt="Studio Background"
          className="w-full h-full object-cover opacity-60 filter brightness-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

        {/* Top Badges overlay on Cover */}
        <div className="absolute top-4 right-6 flex items-center gap-2">
          <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Online in DAW</span>
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 font-extrabold backdrop-blur-md">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>Level 9 Platinum Creator</span>
          </span>
        </div>
      </div>

      {/* Profile Details Bar */}
      <div className="max-w-7xl mx-auto px-6 relative -mt-20 pb-6 flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
        {/* Left Avatar & Identity Info */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-5">
          <div className="relative group">
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400&auto=format&fit=crop"
              alt="Aria Sterling"
              className="w-32 h-32 md:w-36 md:h-36 rounded-3xl object-cover border-4 border-slate-950 shadow-2xl relative z-10"
            />
            <ShieldCheck className="w-7 h-7 text-cyan-400 bg-slate-950 rounded-full absolute -bottom-1 -right-1 z-20 p-0.5 border-2 border-slate-900" />
          </div>

          <div className="space-y-1.5 pt-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Aria Sterling</h1>
              <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-[10px]">
                @ariasterling
              </span>
            </div>

            <p className="text-sm font-bold text-purple-400 flex items-center gap-2">
              <span>Electronic Vocalist & Synthwave Producer</span>
              <span>•</span>
              <span className="text-slate-400 font-normal">Sonara AI Lead Creator</span>
            </p>

            <div className="flex flex-wrap items-center gap-3 text-slate-400 text-xs pt-1">
              <span className="flex items-center gap-1 text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" /> London, UK
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-300">
                <Globe className="w-3.5 h-3.5 text-purple-400" /> EN, DE, JP
              </span>
              <span>•</span>
              <span className="text-amber-300 font-bold">Cyberpunk, Synthwave, Vocal House</span>
            </div>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex items-center gap-2 flex-wrap self-stretch md:self-end">
          <button
            onClick={() => {
              setIsFollowing(!isFollowing);
              onAction?.('Follow');
            }}
            className={`px-4 py-2 rounded-xl font-extrabold flex items-center gap-2 transition-all shadow-lg ${
              isFollowing
                ? 'bg-slate-800 text-slate-200 border border-slate-700'
                : 'bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white'
            }`}
          >
            {isFollowing ? <UserCheck className="w-4 h-4 text-emerald-400" /> : <UserPlus className="w-4 h-4" />}
            <span>{isFollowing ? 'Following' : 'Follow'}</span>
          </button>

          <button
            onClick={() => onAction?.('Message')}
            className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 font-bold flex items-center gap-1.5"
          >
            <MessageSquare className="w-4 h-4 text-purple-400" />
            <span>Message</span>
          </button>

          <button
            onClick={() => onAction?.('Collaborate')}
            className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 text-purple-300 font-bold flex items-center gap-1.5"
          >
            <Handshake className="w-4 h-4" />
            <span>Collaborate</span>
          </button>

          <button
            onClick={() => onAction?.('Invite')}
            className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 font-bold flex items-center gap-1.5"
          >
            <Send className="w-4 h-4 text-amber-400" />
            <span>Invite</span>
          </button>

          <button
            onClick={() => onAction?.('Hire')}
            className="px-3.5 py-2 rounded-xl bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-600/30 font-bold flex items-center gap-1.5"
          >
            <Briefcase className="w-4 h-4" />
            <span>Hire</span>
          </button>

          <button
            onClick={handleShare}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatorHero;
