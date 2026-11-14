/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production';

/** Supabase origin (REST, Storage public photos, Auth) — narrowed to the configured project when known. */
function supabaseOrigins() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    return { https: url.origin, wss: `wss://${url.host}` };
  } catch {
    return { https: 'https://*.supabase.co', wss: 'wss://*.supabase.co' };
  }
}

function contentSecurityPolicy() {
  const sb = supabaseOrigins();
  const directives = {
    'default-src': ["'self'"],
    // Next.js App Router inlines bootstrap scripts; nonces would make every page dynamic-only.
    'script-src': ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', sb.https],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", sb.https, sb.wss],
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  const policy = Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
