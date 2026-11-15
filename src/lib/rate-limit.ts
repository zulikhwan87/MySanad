import 'server-only';
import { headers } from 'next/headers';
import { createServiceRoleSupabase, isServiceRoleConfigured } from '@/lib/supabase/server';

export interface RateLimitRule {
  /** Max attempts allowed within the window. */
  max: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  login: { max: 10, windowSeconds: 15 * 60 },
  register: { max: 5, windowSeconds: 60 * 60 },
  passwordReset: { max: 5, windowSeconds: 60 * 60 },
  signedUrl: { max: 60, windowSeconds: 60 },
  publicDocument: { max: 30, windowSeconds: 60 },
  teacherWrite: { max: 60, windowSeconds: 60 },
  adminWrite: { max: 120, windowSeconds: 60 },
  revealIc: { max: 10, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

export function clientIp(): string {
  const h = headers();
  const forwarded = h.get('x-forwarded-for');
  return (forwarded?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim().slice(0, 64);
}

/**
 * Atomic fixed-window limiter backed by public.consume_rate_limit() (service role only).
 * Fails closed in production when the service role key is missing; in development it
 * allows the request and logs a warning so local work is not blocked.
 */
export async function consumeRateLimit(bucket: keyof typeof RATE_LIMITS, identifier: string): Promise<boolean> {
  const rule = RATE_LIMITS[bucket];
  if (!isServiceRoleConfigured()) {
    if (process.env.NODE_ENV === 'production') return false;
    console.warn(`[rate-limit] SUPABASE_SERVICE_ROLE_KEY tiada; had "${bucket}" dilangkau (pembangunan sahaja).`);
    return true;
  }
  const supabase = createServiceRoleSupabase();
  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_key: `${bucket}:${identifier}`.slice(0, 200),
    p_max_hits: rule.max,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    console.error('[rate-limit] ralat', error.message);
    return process.env.NODE_ENV !== 'production';
  }
  return data === true;
}
