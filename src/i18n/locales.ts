export const SUPPORTED_LANGUAGES = [
  'en', 'it', 'fr', 'de', 'es', 'pt', 'nl', 'ro', 'pl', 'cs', 'sk', 'hu', 'hr', 'sr', 'sl', 'bs', 'bg', 'el', 'sq', 'mk',
  'uk', 'ru', 'be', 'lt', 'lv', 'et', 'fi', 'sv', 'no', 'da', 'is', 'ga', 'cy', 'mt', 'tr', 'ar', 'he', 'fa', 'ur', 'hi',
  'bn', 'pa', 'gu', 'mr', 'ta', 'te', 'kn', 'ml', 'si', 'ne', 'th', 'vi', 'km', 'lo', 'my', 'id', 'ms', 'fil', 'ja', 'ko',
  'zh-CN', 'zh-TW', 'mn', 'kk', 'uz', 'az', 'ka', 'hy', 'sw', 'zu', 'xh', 'af', 'am', 'so', 'yo', 'ig', 'ha', 'fr-CA', 'es-419', 'pt-BR'
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number];

export const RTL_LANGUAGES: LanguageCode[] = ['ar', 'he', 'fa', 'ur'];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export interface LanguageMeta {
  code: LanguageCode;
  name: string;
  nativeName: string;
  rtl?: boolean;
}

export const LANGUAGE_METADATA: Record<LanguageCode, LanguageMeta> = {
  'en': { code: 'en', name: 'English', nativeName: 'English' },
  'it': { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  'fr': { code: 'fr', name: 'French', nativeName: 'Français' },
  'de': { code: 'de', name: 'German', nativeName: 'Deutsch' },
  'es': { code: 'es', name: 'Spanish', nativeName: 'Español' },
  'pt': { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  'nl': { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  'ro': { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  'pl': { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  'cs': { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  'sk': { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
  'hu': { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  'hr': { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski' },
  'sr': { code: 'sr', name: 'Serbian', nativeName: 'Српски' },
  'sl': { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina' },
  'bs': { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski' },
  'bg': { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
  'el': { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  'sq': { code: 'sq', name: 'Albanian', nativeName: 'Shqip' },
  'mk': { code: 'mk', name: 'Macedonian', nativeName: 'Македонски' },
  'uk': { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  'ru': { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  'be': { code: 'be', name: 'Belarusian', nativeName: 'Беларуская' },
  'lt': { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
  'lv': { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
  'et': { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
  'fi': { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  'sv': { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  'no': { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
  'da': { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  'is': { code: 'is', name: 'Icelandic', nativeName: 'Íslenska' },
  'ga': { code: 'ga', name: 'Irish', nativeName: 'Gaeilge' },
  'cy': { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg' },
  'mt': { code: 'mt', name: 'Maltese', nativeName: 'Malti' },
  'tr': { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  'ar': { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
  'he': { code: 'he', name: 'Hebrew', nativeName: 'עברית', rtl: true },
  'fa': { code: 'fa', name: 'Persian', nativeName: 'فارسی', rtl: true },
  'ur': { code: 'ur', name: 'Urdu', nativeName: 'اردو', rtl: true },
  'hi': { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  'bn': { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  'pa': { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  'gu': { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  'mr': { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  'ta': { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  'te': { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  'kn': { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  'ml': { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  'si': { code: 'si', name: 'Sinhala', nativeName: 'සිංහල' },
  'ne': { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
  'th': { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  'vi': { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  'km': { code: 'km', name: 'Khmer', nativeName: 'ភាសាខ្មែរ' },
  'lo': { code: 'lo', name: 'Lao', nativeName: 'ພາສາລາວ' },
  'my': { code: 'my', name: 'Burmese', nativeName: 'မြန်မာ' },
  'id': { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  'ms': { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  'fil': { code: 'fil', name: 'Filipino', nativeName: 'Filipino' },
  'ja': { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  'ko': { code: 'ko', name: 'Korean', nativeName: '한국어' },
  'zh-CN': { code: 'zh-CN', name: 'Chinese Simplified', nativeName: '简体中文' },
  'zh-TW': { code: 'zh-TW', name: 'Chinese Traditional', nativeName: '繁體中文' },
  'mn': { code: 'mn', name: 'Mongolian', nativeName: 'Монгол' },
  'kk': { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша' },
  'uz': { code: 'uz', name: 'Uzbek', nativeName: "O'zbek" },
  'az': { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan' },
  'ka': { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  'hy': { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն' },
  'sw': { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  'zu': { code: 'zu', name: 'Zulu', nativeName: 'isiZulu' },
  'xh': { code: 'xh', name: 'Xhosa', nativeName: 'isiXhosa' },
  'af': { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  'am': { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
  'so': { code: 'so', name: 'Somali', nativeName: 'Soomaali' },
  'yo': { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá' },
  'ig': { code: 'ig', name: 'Igbo', nativeName: 'Asụsụ Igbo' },
  'ha': { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
  'fr-CA': { code: 'fr-CA', name: 'French (Canada)', nativeName: 'Français (Canada)' },
  'es-419': { code: 'es-419', name: 'Spanish (Latin America)', nativeName: 'Español (Latinoamérica)' },
  'pt-BR': { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)' }
};

export function detectDeviceLanguage(): LanguageCode {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
  
  const navLangs = navigator.languages || [navigator.language];
  for (const lang of navLangs) {
    if (!lang) continue;
    const cleanLang = lang.trim();
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(cleanLang)) {
      return cleanLang as LanguageCode;
    }
    const shortCode = cleanLang.split('-')[0];
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(shortCode)) {
      return shortCode as LanguageCode;
    }
  }
  return DEFAULT_LANGUAGE;
}

