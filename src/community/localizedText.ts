export type SupportedLanguage = 'zh-TW' | 'en';

export type LocalizedText = Partial<Record<SupportedLanguage, string>>;

export const SUPPORTED_TEMPLATE_LANGUAGES: SupportedLanguage[] = ['zh-TW', 'en'];

export const isLocalizedText = (value: unknown): value is LocalizedText => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const getLocalizedText = (
  localized: LocalizedText | undefined,
  language: SupportedLanguage,
  fallback = '',
): string => {
  if (!localized) return fallback;

  return localized[language] ?? localized['zh-TW'] ?? localized.en ?? fallback;
};

export const getLanguageText = (
  localized: LocalizedText | undefined,
  language: SupportedLanguage,
  fallback = '',
): string => localized?.[language] ?? (language === 'zh-TW' ? fallback : '');

export const hasLanguageText = (
  localized: LocalizedText | undefined,
  language: SupportedLanguage,
  fallback = '',
): boolean => getLanguageText(localized, language, fallback).trim().length > 0;

export const setLocalizedText = (
  localized: LocalizedText | undefined,
  language: SupportedLanguage,
  value: string,
): LocalizedText => ({
  ...(localized || {}),
  [language]: value,
});

export const ensureLocalizedText = (
  fallback: string | undefined,
  language: SupportedLanguage,
  localized?: LocalizedText,
): LocalizedText => {
  const next = { ...(localized || {}) };
  if (fallback !== undefined && next[language] === undefined) {
    next[language] = fallback;
  }
  return next;
};
