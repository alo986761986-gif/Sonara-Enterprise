import { GenerationQueueService } from './GenerationQueueService';

export interface SongSectionBlueprint {
  name?: string;
  section?: string;
  bars?: number;
  description?: string;
  energy?: number | string;
}

export interface ProductionBlueprint {
  genre?: string;
  bpm?: number;
  timeSignature?: string;
  structure?: Array<string | SongSectionBlueprint>;
  instruments?: string[];
}

export interface PlannedSongSection {
  index: number;
  name: string;
  bars: number;
  startBar: number;
  endBar: number;
  startSec: number;
  durationSec: number;
  description: string;
  energy: number;
}

export interface SongPlan {
  status: 'success';
  genre: string;
  bpm: number;
  timeSignature: '4/4';
  beatsPerBar: 4;
  phraseBars: number;
  secondsPerBeat: number;
  secondsPerBar: number;
  requestedDurationSec: number;
  alignedDurationSec: number;
  totalBars: number;
  sections: PlannedSongSection[];
  jobs: PlannedSongSection[];
  promptDirective: string;
}

const DEFAULT_STRUCTURE: SongSectionBlueprint[] = [
  { name: 'Intro', bars: 8, description: 'Filtered opening with a clear downbeat', energy: 0.35 },
  { name: 'Build', bars: 16, description: 'Add groove layers and harmonic movement', energy: 0.65 },
  { name: 'Drop', bars: 32, description: 'Full rhythm section and main hook', energy: 1.0 },
  { name: 'Breakdown', bars: 16, description: 'Remove drums and create harmonic space', energy: 0.45 },
  { name: 'Final Drop', bars: 32, description: 'Return the full groove with controlled variation', energy: 1.0 },
  { name: 'Outro', bars: 8, description: 'Remove layers on phrase boundaries', energy: 0.3 }
];

export class SongPlannerService {
  public static planSong(
    blueprint: ProductionBlueprint | string,
    targetDuration?: number
  ): SongPlan {
    const normalized: ProductionBlueprint = typeof blueprint === 'string'
      ? { genre: blueprint }
      : (blueprint || {});

    const genre = String(normalized.genre || 'Melodic House');
    const bpm = this.clamp(Number(normalized.bpm || 124), 60, 240);
    const secondsPerBeat = 60 / bpm;
    const secondsPerBar = secondsPerBeat * 4;

    const requestedDurationSec = this.clamp(
      Number(targetDuration || this.durationFromStructure(normalized.structure, secondsPerBar) || 30),
      5,
      600
    );

    // Tracks always finish on a complete four-bar phrase. This prevents partial
    // measures, clipped transitions and off-grid endings.
    const phraseBars = 4;
    const rawBarCount = requestedDurationSec / secondsPerBar;
    const totalBars = Math.max(4, Math.round(rawBarCount / phraseBars) * phraseBars);
    const alignedDurationSec = Number((totalBars * secondsPerBar).toFixed(3));

    const sourceStructure = this.normalizeStructure(normalized.structure);
    const allocated = this.allocateSections(sourceStructure, totalBars);

    let currentBar = 1;
    const sections: PlannedSongSection[] = allocated.map((section, index) => {
      const startBar = currentBar;
      const endBar = startBar + section.bars - 1;
      currentBar = endBar + 1;

      return {
        index,
        name: section.name,
        bars: section.bars,
        startBar,
        endBar,
        startSec: Number(((startBar - 1) * secondsPerBar).toFixed(3)),
        durationSec: Number((section.bars * secondsPerBar).toFixed(3)),
        description: section.description,
        energy: section.energy
      };
    });

    const structureText = sections
      .map(section => `${section.name} ${section.bars} bars (${section.description}, energy ${section.energy.toFixed(2)})`)
      .join(' -> ');

    return {
      status: 'success',
      genre,
      bpm,
      timeSignature: '4/4',
      beatsPerBar: 4,
      phraseBars,
      secondsPerBeat: Number(secondsPerBeat.toFixed(6)),
      secondsPerBar: Number(secondsPerBar.toFixed(6)),
      requestedDurationSec,
      alignedDurationSec,
      totalBars,
      sections,
      jobs: sections,
      promptDirective: [
        `ARRANGEMENT_GRID: strict 4/4, ${bpm} BPM, ${totalBars} complete bars`,
        'TRANSITIONS: only at bar boundaries; preserve four-bar phrases; never cut a measure',
        `SECTIONS: ${structureText}`
      ].join(' | ')
    };
  }

  public static sendJobsToQueue(jobs: PlannedSongSection[], userId?: string): string[] {
    return jobs.map((job, index) => {
      const queued = GenerationQueueService.enqueue({
        ...job,
        userId,
        sequenceIndex: index
      });
      return queued.taskId;
    });
  }

  private static normalizeStructure(
    structure?: Array<string | SongSectionBlueprint>
  ): Array<{ name: string; bars: number; description: string; energy: number }> {
    const source = Array.isArray(structure) && structure.length > 0
      ? structure
      : DEFAULT_STRUCTURE;

    return source.map((entry, index) => {
      if (typeof entry === 'string') {
        return {
          name: entry,
          bars: 8,
          description: `Develop the ${entry.toLowerCase()} on the active rhythmic grid`,
          energy: this.defaultEnergy(index, source.length)
        };
      }

      return {
        name: String(entry.name || entry.section || `Section ${index + 1}`),
        bars: Math.max(1, Math.round(Number(entry.bars || 8))),
        description: String(entry.description || 'Maintain groove and harmonic continuity'),
        energy: this.normalizeEnergy(entry.energy, index, source.length)
      };
    });
  }

  private static allocateSections(
    source: Array<{ name: string; bars: number; description: string; energy: number }>,
    totalBars: number
  ): Array<{ name: string; bars: number; description: string; energy: number }> {
    if (totalBars <= 8) {
      const introBars = totalBars === 4 ? 1 : 2;
      const outroBars = introBars;
      return [
        { name: 'Intro', bars: introBars, description: 'Establish pulse and tonal center', energy: 0.45 },
        { name: 'Main Groove', bars: totalBars - introBars - outroBars, description: 'Full rhythm, bass and hook', energy: 1.0 },
        { name: 'Outro', bars: outroBars, description: 'Resolve cleanly on the final downbeat', energy: 0.35 }
      ];
    }

    if (totalBars <= 16) {
      const sectionBars = totalBars / 4;
      return [
        { name: 'Intro', bars: sectionBars, description: 'Establish the rhythmic grid', energy: 0.4 },
        { name: 'Build', bars: sectionBars, description: 'Add bass and percussion', energy: 0.7 },
        { name: 'Drop', bars: sectionBars, description: 'Full arrangement and main hook', energy: 1.0 },
        { name: 'Outro', bars: sectionBars, description: 'Resolve on a phrase boundary', energy: 0.35 }
      ];
    }

    const selected = source.slice(0, Math.min(source.length, Math.floor(totalBars / 4)));
    const sourceTotal = selected.reduce((sum, section) => sum + section.bars, 0);
    const allocations = selected.map(section => Math.max(4, Math.round((section.bars / sourceTotal) * totalBars / 4) * 4));

    let difference = totalBars - allocations.reduce((sum, bars) => sum + bars, 0);
    let cursor = 0;
    while (difference !== 0 && allocations.length > 0) {
      const delta = difference > 0 ? 4 : -4;
      const candidate = allocations[cursor] + delta;
      if (candidate >= 4) {
        allocations[cursor] = candidate;
        difference -= delta;
      }
      cursor = (cursor + 1) % allocations.length;
    }

    return selected.map((section, index) => ({
      ...section,
      bars: allocations[index]
    }));
  }

  private static durationFromStructure(
    structure: Array<string | SongSectionBlueprint> | undefined,
    secondsPerBar: number
  ): number | null {
    if (!Array.isArray(structure) || structure.length === 0) return null;
    const bars = structure.reduce((sum, entry) => {
      return sum + (typeof entry === 'string' ? 8 : Math.max(1, Number(entry.bars || 8)));
    }, 0);
    return bars * secondsPerBar;
  }

  private static normalizeEnergy(value: number | string | undefined, index: number, total: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return this.clamp(value > 1 ? value / 100 : value, 0, 1);
    }
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (normalized.includes('high') || normalized.includes('peak')) return 1.0;
      if (normalized.includes('low') || normalized.includes('soft')) return 0.35;
      if (normalized.includes('medium')) return 0.65;
    }
    return this.defaultEnergy(index, total);
  }

  private static defaultEnergy(index: number, total: number): number {
    if (index === 0 || index === total - 1) return 0.35;
    if (index === Math.floor(total / 2)) return 1.0;
    return 0.7;
  }

  private static clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }
}
