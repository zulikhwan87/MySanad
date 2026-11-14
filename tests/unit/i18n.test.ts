import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, isLocale, textDirection } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('i18n', () => {
  it('defaults to Bahasa Melayu', () => {
    expect(DEFAULT_LOCALE).toBe('ms');
    expect(getDictionary().nav.login).toBe('Log Masuk');
  });

  it('uses RTL only for Arabic', () => {
    expect(textDirection('ar')).toBe('rtl');
    expect(textDirection('ms')).toBe('ltr');
    expect(textDirection('en')).toBe('ltr');
  });

  it('has the same non-empty keys in every locale', () => {
    const base = keys(getDictionary('ms')).sort();
    for (const locale of LOCALES) {
      const d = getDictionary(locale);
      expect(keys(d).sort()).toEqual(base);
      expect(keys(d).every((k) => k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], d))).toBe(true);
    }
  });

  it('validates locale values', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });
});

describe('fmt and intl helpers', async () => {
  const { fmt } = await import('@/lib/i18n/dictionaries');
  const { intlLocale } = await import('@/lib/i18n/config');
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(fmt('{n} guru ditemui', { n: 3 })).toBe('3 guru ditemui');
    expect(fmt('halaman {page} daripada {pages}', { page: 1 })).toBe('halaman 1 daripada {pages}');
  });
  it('uses Latin digits for Arabic', () => {
    expect((1234).toLocaleString(intlLocale('ar'))).toMatch(/1.?234/);
  });
});
