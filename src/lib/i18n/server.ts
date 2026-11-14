import 'server-only';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './config';
import { getDictionary, type Dictionary } from './dictionaries';

export function getLocale(): Locale {
  const value = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function getT(): Dictionary {
  return getDictionary(getLocale());
}
