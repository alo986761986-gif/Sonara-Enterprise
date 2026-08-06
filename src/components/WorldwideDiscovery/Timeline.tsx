// Timeline.tsx - Musical Era Evolution Timeline Scrubber Component
import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Clock, Sparkles } from 'lucide-react';
import { ERA_DATA, EvolutionEraYear } from '../discovery/MusicForecastEngine';

export interface TimelineProps {
  selectedEra: EvolutionEraYear;
  onSelectEra: (era: EvolutionEraYear) => void;
  isPlayingEra?: boolean;
  onTogglePlayEra?: () => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  selectedEra,
  onSelectEra,
  isPlayingEra = false,
  onTogglePlayEra,
}) => {
  const eras = Object.keys(ERA_DATA) as EvolutionEraYear[];

  return (
    <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 p-2 rounded-xl text-xs">
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onTogglePlayEra}
          className="p-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          title={isPlayingEra ? 'Pause Sound Era' : 'Play Sound Era Evolution'}
          aria-label="Play Sound Era Evolution"
        >
          {isPlayingEra ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-white" />}
        </button>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">
          Sound Era:
        </span>
      </div>

      {/* Era Scrubber Nodes */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1">
        {eras.map((era) => {
          const isActive = selectedEra === era;
          return (
            <button
              key={era}
              onClick={() => onSelectEra(era)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold whitespace-nowrap transition-all border ${
                isActive
                  ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white border-cyan-400 shadow-md scale-105'
                  : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {era}
            </button>
          );
        })}
      </div>
    </div>
  );
};
