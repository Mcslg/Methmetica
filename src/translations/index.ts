import { en } from './en';
import { zhTW } from './zh-TW';

export const resources = {
  en,
  'zh-TW': zhTW,
} as const;

export type Language = keyof typeof resources;
export type TranslationData = typeof en;
