// Regionalization Engine - Sonara AI Global Regionalization Framework
import { eventBus } from '../app';

export interface RegionalConfig {
  countryCode: string; // ISO 3166-1 alpha-2 (e.g. 'US', 'IT', 'JP', 'BR', 'DE', 'GB', 'AE')
  regionName: string;  // 'North America', 'Europe', 'Asia', 'South America', 'Middle East', 'Africa', 'Oceania'
  currency: {
    code: string;      // 'USD', 'EUR', 'JPY', 'BRL', 'GBP', 'AED', etc.
    symbol: string;    // '$', '€', '¥', 'R$', '£', 'د.إ'
    taxRate: number;   // default estimated regional VAT/Sales Tax
  };
  measurementSystem: 'metric' | 'imperial';
  timeFormat: '12h' | '24h';
  firstDayOfWeek: 0 | 1; // 0 = Sunday, 1 = Monday
  complianceFramework: 'GDPR' | 'CCPA' | 'LGPD' | 'STANDARD';
  timezone: string;
  recommendedGenres: string[];
}

export const REGIONAL_PRESETS: Record<string, RegionalConfig> = {
  US: {
    countryCode: 'US',
    regionName: 'North America',
    currency: { code: 'USD', symbol: '$', taxRate: 0.08 },
    measurementSystem: 'imperial',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    complianceFramework: 'CCPA',
    timezone: 'America/New_York',
    recommendedGenres: ['Hip Hop', 'Pop', 'Synthwave', 'Alternative Rock']
  },
  IT: {
    countryCode: 'IT',
    regionName: 'Europe',
    currency: { code: 'EUR', symbol: '€', taxRate: 0.22 },
    measurementSystem: 'metric',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    complianceFramework: 'GDPR',
    timezone: 'Europe/Rome',
    recommendedGenres: ['Italo Disco', 'Cinematic Orchestral', 'Deep House', 'Trapsoul']
  },
  JP: {
    countryCode: 'JP',
    regionName: 'Asia',
    currency: { code: 'JPY', symbol: '¥', taxRate: 0.10 },
    measurementSystem: 'metric',
    timeFormat: '24h',
    firstDayOfWeek: 0,
    complianceFramework: 'STANDARD',
    timezone: 'Asia/Tokyo',
    recommendedGenres: ['J-Pop', 'City Pop', 'Chiptune', 'Ambient Techno']
  },
  BR: {
    countryCode: 'BR',
    regionName: 'South America',
    currency: { code: 'BRL', symbol: 'R$', taxRate: 0.17 },
    measurementSystem: 'metric',
    timeFormat: '24h',
    firstDayOfWeek: 0,
    complianceFramework: 'LGPD',
    timezone: 'America/Sao_Paulo',
    recommendedGenres: ['Bossa Nova', 'Funk Carioca', 'Samba House', 'Latin Trap']
  },
  GB: {
    countryCode: 'GB',
    regionName: 'Europe',
    currency: { code: 'GBP', symbol: '£', taxRate: 0.20 },
    measurementSystem: 'metric',
    timeFormat: '12h',
    firstDayOfWeek: 1,
    complianceFramework: 'GDPR',
    timezone: 'Europe/London',
    recommendedGenres: ['UK Garage', 'Drum & Bass', 'Grime', 'Indie Rock']
  },
  DE: {
    countryCode: 'DE',
    regionName: 'Europe',
    currency: { code: 'EUR', symbol: '€', taxRate: 0.19 },
    measurementSystem: 'metric',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    complianceFramework: 'GDPR',
    timezone: 'Europe/Berlin',
    recommendedGenres: ['Minimal Techno', 'Industrial', 'Synthpop', 'Classical Ambient']
  },
  AE: {
    countryCode: 'AE',
    regionName: 'Middle East',
    currency: { code: 'AED', symbol: 'د.إ', taxRate: 0.05 },
    measurementSystem: 'metric',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    complianceFramework: 'STANDARD',
    timezone: 'Asia/Dubai',
    recommendedGenres: ['Arabic Trap', 'Oud Ambient', 'Afrobeat', 'Deep Tech']
  },
  ZA: {
    countryCode: 'ZA',
    regionName: 'Africa',
    currency: { code: 'ZAR', symbol: 'R', taxRate: 0.15 },
    measurementSystem: 'metric',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    complianceFramework: 'STANDARD',
    timezone: 'Africa/Johannesburg',
    recommendedGenres: ['Amapiano', 'Afro House', 'Kwaito', 'Afrobeats']
  }
};

class RegionalizationEngineService {
  private currentConfig: RegionalConfig = REGIONAL_PRESETS.US;

  constructor() {
    if (typeof window !== 'undefined') {
      this.detectRegion();
    }
  }

  public detectRegion(): RegionalConfig {
    try {
      const saved = localStorage.getItem('sonara_region_code');
      if (saved && REGIONAL_PRESETS[saved]) {
        this.currentConfig = REGIONAL_PRESETS[saved];
        return this.currentConfig;
      }

      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (userTimezone.includes('Rome') || userTimezone.includes('Europe/Berlin') || userTimezone.includes('Paris')) {
        this.currentConfig = REGIONAL_PRESETS.IT;
      } else if (userTimezone.includes('London')) {
        this.currentConfig = REGIONAL_PRESETS.GB;
      } else if (userTimezone.includes('Tokyo')) {
        this.currentConfig = REGIONAL_PRESETS.JP;
      } else if (userTimezone.includes('Sao_Paulo')) {
        this.currentConfig = REGIONAL_PRESETS.BR;
      } else if (userTimezone.includes('Dubai')) {
        this.currentConfig = REGIONAL_PRESETS.AE;
      } else if (userTimezone.includes('Johannesburg')) {
        this.currentConfig = REGIONAL_PRESETS.ZA;
      } else {
        this.currentConfig = REGIONAL_PRESETS.US;
      }
    } catch {
      this.currentConfig = REGIONAL_PRESETS.US;
    }

    return this.currentConfig;
  }

  public setRegion(countryCode: string) {
    if (REGIONAL_PRESETS[countryCode]) {
      this.currentConfig = REGIONAL_PRESETS[countryCode];
      if (typeof window !== 'undefined') {
        localStorage.setItem('sonara_region_code', countryCode);
      }
      eventBus.publish('regional:changed', this.currentConfig);
    }
  }

  public getRegion(): RegionalConfig {
    return this.currentConfig;
  }

  public formatPrice(amountUSD: number): string {
    const { currency } = this.currentConfig;
    // Approximate conversion multipliers for showcase
    const rates: Record<string, number> = {
      USD: 1.0,
      EUR: 0.92,
      GBP: 0.78,
      JPY: 155.0,
      BRL: 5.4,
      AED: 3.67,
      ZAR: 18.2
    };

    const multiplier = rates[currency.code] || 1.0;
    const converted = amountUSD * multiplier;

    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.code,
      maximumFractionDigits: currency.code === 'JPY' ? 0 : 2
    }).format(converted);
  }

  public isQuietHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    return hour >= 22 || hour < 7;
  }
}

export const regionalizationEngine = new RegionalizationEngineService();
