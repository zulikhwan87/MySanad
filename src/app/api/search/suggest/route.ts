import { NextResponse, type NextRequest } from 'next/server';
import { searchTeachers } from '@/lib/data/public-directory';

/** Lightweight suggestions for the debounced search box. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ suggestions: [] });
  try {
    const result = await searchTeachers({ q }, 6);
    const suggestions = (result?.items ?? []).map((t) => ({
      id: t.id,
      name: t.public_display_name,
      arabic: t.full_name_arabic,
      location: [t.district_name, t.state_name].filter(Boolean).join(', '),
    }));
    return NextResponse.json({ suggestions }, { headers: { 'Cache-Control': 'public, s-maxage=30' } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ suggestions: [] }, { status: 500 });
  }
}
