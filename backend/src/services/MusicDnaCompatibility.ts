import fs from 'fs';
import path from 'path';
import { MusicDnaLibraryService } from './MusicDnaLibraryService';

type LegacyDnaElement = {
  id: string;
  category: string;
  name: string;
  description: string;
  idealBpm: number;
  key: string;
  energy: number;
  intensity: number;
  compatibility: string[];
  qualityScore: number;
};

const CUSTOM_PATH = path.join(process.cwd(), 'storage', 'dna_elements.json');

function loadCustom(): LegacyDnaElement[] {
  try {
    if (!fs.existsSync(CUSTOM_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(CUSTOM_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustom(elements: LegacyDnaElement[]): void {
  const dir = path.dirname(CUSTOM_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CUSTOM_PATH, JSON.stringify(elements, null, 2), 'utf8');
}

function tracksAsElements(): LegacyDnaElement[] {
  return MusicDnaLibraryService.searchDnaLibrary({ limit: 1000 }).map(track => ({
    id: track.id,
    category: track.subgenre || track.genre || 'Music DNA',
    name: `${track.subgenre || track.genre} ${track.keySignature}`,
    description: track.prompt,
    idealBpm: track.bpm,
    key: track.keySignature,
    energy: Math.max(1, Math.min(10, Math.round(track.scores.grooveScore))),
    intensity: Math.max(1, Math.min(10, Math.round(track.scores.dynamicScore))),
    compatibility: [track.genre, track.subgenre, ...track.instruments].filter(Boolean),
    qualityScore: Math.round(track.scores.overallScore * 10)
  }));
}

const service = MusicDnaLibraryService as any;

if (typeof service.getAllElements !== 'function') {
  service.getAllElements = (): LegacyDnaElement[] => [
    ...tracksAsElements(),
    ...loadCustom()
  ];
}

if (typeof service.addElement !== 'function') {
  service.addElement = (element: LegacyDnaElement): LegacyDnaElement => {
    const custom = loadCustom().filter(item => item.id !== element.id);
    custom.unshift(element);
    saveCustom(custom);
    return element;
  };
}

if (typeof service.resetLibrary !== 'function') {
  service.resetLibrary = (): void => {
    saveCustom([]);
  };
}

if (typeof service.findCompatiblePatterns !== 'function') {
  service.findCompatiblePatterns = (params: any = {}): LegacyDnaElement[] => {
    const category = String(params.category || '').toLowerCase();
    const key = String(params.key || '').toLowerCase();
    const tag = String(params.compatibilityTag || '').toLowerCase();
    const bpm = Number(params.bpm);
    const energy = Number(params.energy);

    return service.getAllElements().filter((item: LegacyDnaElement) => {
      if (category && !String(item.category).toLowerCase().includes(category)) return false;
      if (key && !String(item.key).toLowerCase().includes(key)) return false;
      if (Number.isFinite(bpm) && bpm > 0 && Math.abs(item.idealBpm - bpm) > 12) return false;
      if (Number.isFinite(energy) && energy > 0 && Math.abs(item.energy - energy) > 3) return false;
      if (tag && !item.compatibility.some(value => String(value).toLowerCase().includes(tag))) return false;
      return true;
    });
  };
}

if (typeof service.generateOptimalChain !== 'function') {
  service.generateOptimalChain = (genre: string): LegacyDnaElement[] => {
    const query = String(genre || '').toLowerCase();
    const matches = service.getAllElements().filter((item: LegacyDnaElement) => {
      const haystack = `${item.category} ${item.name} ${item.description} ${item.compatibility.join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });
    return (matches.length ? matches : service.getAllElements())
      .sort((a: LegacyDnaElement, b: LegacyDnaElement) => b.qualityScore - a.qualityScore)
      .slice(0, 8);
  };
}

export {};
