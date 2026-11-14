/**
 * TypeScript twin of public.normalize_search_text() (migration 006) so client-side
 * graph search matches the database search behaviour.
 */
export function normalizeSearchText(input: string | null | undefined): string {
  return (input ?? '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/['’‘`ʼ]/g, '')
    .replace(/[-_.,/()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
