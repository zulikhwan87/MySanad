export const TARGET_LABELS: Record<string, string> = {
  teacher_profile: 'Profil guru',
  ijazah_document: 'Dokumen',
  sanad_chain: 'Rantaian sanad',
  sanad_node: 'Nod sanad',
  sanad_edge: 'Hubungan sanad',
};

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ms-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** Waiting time in whole days, for queue triage. */
export function daysWaiting(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
