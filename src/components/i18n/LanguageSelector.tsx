import React from 'react';
import { useTranslation } from '../../i18n';
import { SUPPORTED_LANGUAGES, LanguageCode } from '../../i18n/locales';

export const LanguageSelector: React.FC = () => {
  const { language, setLanguage } = useTranslation();

  return (
    <select 
      value={language} 
      onChange={(e) => setLanguage(e.target.value as LanguageCode)}
      className="bg-transparent border border-gray-300 rounded p-1"
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang} value={lang}>{lang.toUpperCase()}</option>
      ))}
    </select>
  );
};
