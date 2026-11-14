import { NextResponse, type NextRequest } from 'next/server';
import { searchTeachers } from '@/lib/data/public-directory';
import { parseDirectoryParams } from '@/lib/validations/search';

/** Public JSON search API. Same rules as the directory: published teachers only. */
export async function GET(request: NextRequest) {
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const params = parseDirectoryParams(raw);
  try {
    const result = await searchTeachers(params);
    if (!result) return NextResponse.json({ error: 'Pangkalan data belum dikonfigurasi.' }, { status: 503 });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Carian gagal.' }, { status: 500 });
  }
}
