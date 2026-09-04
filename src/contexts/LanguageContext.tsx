import React, { createContext, useContext, useState } from 'react';
import { resources, type Language, type TranslationData } from '../translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string) => string;
  translations: TranslationData;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Try to load from localStorage or default to system language
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('methmatica-lang');
    if (saved === 'en' || saved === 'zh-TW') return saved as Language;
    return navigator.language.includes('zh') ? 'zh-TW' : 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('methmatica-lang', lang);
  };

  const translations = resources[language];

  // Helper function to get nested objects via string path 'common.save'
  const t = (path: string): string => {
    const keys = path.split('.');
    let result: unknown = translations;
    for (const key of keys) {
      if (result && typeof result === 'object' && key in (result as Record<string, unknown>)) {
        result = (result as Record<string, unknown>)[key];
      } else {
        return path; // Fallback to key itself
      }
    }
    return typeof result === 'string' ? result : path;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, translations }}>
      {children}
    </LanguageContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
