import { LanguageCode } from './locales';
import { createFormatters } from './formatters';

export type Formatters = ReturnType<typeof createFormatters>;

export interface TranslationContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, variables?: Record<string, string | number>) => string;
  isRTL: boolean;
  format: Formatters;
}
