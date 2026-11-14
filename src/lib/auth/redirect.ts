/**
 * Only allow same-origin relative paths as post-login redirects (prevents open redirects
 * such as `//evil.com`, `/\\evil.com` or `https://evil.com`).
 */
export function safeRedirectPath(next: unknown, fallback = '/teacher/dashboard'): string {
  if (typeof next !== 'string' || next.length === 0 || next.length > 512) return fallback;
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f\\]/.test(next)) return fallback;
  try {
    const url = new URL(next, 'http://localhost');
    if (url.origin !== 'http://localhost') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
