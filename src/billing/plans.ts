export type SonaraPlanId = 'free' | 'creator' | 'studio';
export type BillingCadence = 'monthly' | 'yearly';
export type SonaraVideoResolution = '720p' | '1080p' | '4k';
export type SonaraVideoModelTier = 'lite' | 'fast';

export const SONARA_VIDEO_CREDIT_COST: Record<SonaraVideoResolution, number> = {
  '720p': 1,
  '1080p': 2,
  '4k': 4
};

export interface SonaraPlan {
  id: SonaraPlanId;
  name: string;
  monthlyPriceEur: number;
  yearlyPriceEur: number;
  includedSeconds: number;
  maxTrackSeconds: number;
  commercialUse: boolean;
  videoCreditsPerMonth: number;
  videoClipSeconds: number;
  videoResolutions: SonaraVideoResolution[];
  videoModelTier: SonaraVideoModelTier;
  badge?: string;
  description: string;
  features: string[];
}

export const SONARA_PLANS: Record<SonaraPlanId, SonaraPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    monthlyPriceEur: 0,
    yearlyPriceEur: 0,
    includedSeconds: 10 * 60,
    maxTrackSeconds: 60,
    commercialUse: false,
    videoCreditsPerMonth: 1,
    videoClipSeconds: 8,
    videoResolutions: ['720p'],
    videoModelTier: 'lite',
    description: 'Per conoscere SONARA e creare le prime idee musicali.',
    features: [
      '10 minuti di generazione al mese',
      'Brani fino a 60 secondi',
      '1 credito SONARA Video AI al mese · 720p',
      'BPM, tonalità, genere e testo personalizzati',
      'EQ / Master e archivio locale',
      'Ember con limiti di sicurezza',
      'Solo uso personale'
    ]
  },
  creator: {
    id: 'creator',
    name: 'Creator',
    monthlyPriceEur: 12.99,
    yearlyPriceEur: 119.9,
    includedSeconds: 120 * 60,
    maxTrackSeconds: 240,
    commercialUse: true,
    videoCreditsPerMonth: 10,
    videoClipSeconds: 8,
    videoResolutions: ['720p', '1080p'],
    videoModelTier: 'fast',
    badge: 'PIÙ SCELTO',
    description: 'Il piano completo per artisti, creator e pubblicazioni regolari.',
    features: [
      '120 minuti di generazione al mese',
      'Brani completi fino a 4 minuti',
      '10 crediti SONARA Video AI al mese · fino a 1080p',
      'Download dei propri brani incluso',
      '18 preset professionali EQ / Master',
      'Ember vocale e conversazionale',
      'Uso commerciale secondo i Termini SONARA'
    ]
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    monthlyPriceEur: 29.99,
    yearlyPriceEur: 287.9,
    includedSeconds: 500 * 60,
    maxTrackSeconds: 480,
    commercialUse: true,
    videoCreditsPerMonth: 30,
    videoClipSeconds: 8,
    videoResolutions: ['720p', '1080p', '4k'],
    videoModelTier: 'fast',
    badge: 'ALTO VOLUME',
    description: 'Per producer e studi che generano musica ogni giorno.',
    features: [
      '500 minuti di generazione al mese',
      'Tutte le funzioni Creator',
      'Brani completi fino a 8 minuti',
      '30 crediti SONARA Video AI al mese · fino a 4K',
      'Download dei propri brani incluso',
      'Produzione ad alto volume',
      'Uso commerciale secondo i Termini SONARA'
    ]
  }
};

export const PAID_PLAN_IDS: SonaraPlanId[] = ['creator', 'studio'];

export function isSonaraPlanId(value: unknown): value is SonaraPlanId {
  return value === 'free' || value === 'creator' || value === 'studio';
}

export function isBillingCadence(value: unknown): value is BillingCadence {
  return value === 'monthly' || value === 'yearly';
}

export function isSonaraVideoResolution(value: unknown): value is SonaraVideoResolution {
  return value === '720p' || value === '1080p' || value === '4k';
}

export function formatPlanMinutes(seconds: number): number {
  return Math.max(0, Math.round(seconds / 60));
}
