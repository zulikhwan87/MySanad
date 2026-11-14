'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_LOCALE, intlLocale, textDirection, type Locale } from './config';
import { getDictionary, type Dictionary } from './dictionaries';

interface I18nValue {
  locale: Locale;
  t: Dictionary;
  dir: 'ltr' | 'rtl';
  intl: string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <I18nContext.Provider value={{ locale, t: getDictionary(locale), dir: textDirection(locale), intl: intlLocale(locale) }}>
      {children}
    </I18nContext.Provider>
  );
}

/** Falls back to Bahasa Melayu outside a provider (e.g. isolated component tests). */
export function useI18n(): I18nValue {
  return (
    useContext(I18nContext) ?? {
      locale: DEFAULT_LOCALE,
      t: getDictionary(DEFAULT_LOCALE),
      dir: 'ltr',
      intl: intlLocale(DEFAULT_LOCALE),
    }
  );
}
