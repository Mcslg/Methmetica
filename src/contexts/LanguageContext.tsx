import React, { createContext, useContext, useState } from 'react';
import { resources, type Language, type TranslationData } from '../translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string) => any;
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
  const t = (path: string) => {
    const keys = path.split('.');
    let result: any = translations;
    for (const key of keys) {
      if (result && result[key] !== undefined) {
        result = result[key];
      } else {
        return path; // Fallback to key itself
      }
    }
    return result;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, translations }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
