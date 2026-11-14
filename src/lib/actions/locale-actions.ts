'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isLocale, LOCALE_COOKIE } from '@/lib/i18n/config';

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  cookies().set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false,
  });
  revalidatePath('/', 'layout');
}
