import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const ADMIN_ROLES = ['super_admin', 'verification_admin'];

function redirectToLogin(request: NextRequest) {
  const url = new URL('/login', request.url);
  url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

/**
 * Refreshes the Supabase session cookie on every request and gate-keeps the portals.
 * This is a first line of defence only: portal layouts re-check on the server and
 * RLS enforces access in the database.
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isTeacherPortal = pathname.startsWith('/teacher');
  const isAdminPortal = pathname.startsWith('/admin');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Fail closed: without Supabase nobody can be authenticated.
    return isTeacherPortal || isAdminPortal ? redirectToLogin(request) : NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if ((isTeacherPortal || isAdminPortal) && !user) return redirectToLogin(request);

  if (isAdminPortal && user) {
    const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).single();
    if (!profile || !profile.is_active || !ADMIN_ROLES.includes(profile.role)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return response;
}

export const config = {
  // Everything except static assets and images.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
