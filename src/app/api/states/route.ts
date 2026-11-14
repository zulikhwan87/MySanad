import { NextResponse } from 'next/server';
import { getStateStats } from '@/lib/data/public-directory';

export const dynamic = 'force-dynamic';
/** Real per-state counts of published teachers. */
export async function GET() {
  try {
    const states = await getStateStats();
    if (!states) return NextResponse.json({ error: 'Pangkalan data belum dikonfigurasi.' }, { status: 503 });
    return NextResponse.json({ states }, { headers: { 'Cache-Control': 'public, s-maxage=60' } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Gagal memuatkan negeri.' }, { status: 500 });
  }
}
