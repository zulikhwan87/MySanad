export const LOCALES = ['ms', 'en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ms';
export const LOCALE_COOKIE = 'mysanad_locale';

export const LOCALE_NAMES: Record<Locale, string> = { ms: 'Bahasa Melayu', en: 'English', ar: 'العربية' };
export const LOCALE_SHORT: Record<Locale, string> = { ms: 'BM', en: 'EN', ar: 'عربي' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function textDirection(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** Intl locale for numbers and dates. Arabic keeps Latin digits, as is common in Malaysia. */
export function intlLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-u-nu-latn' : locale === 'en' ? 'en-MY' : 'ms-MY';
}
