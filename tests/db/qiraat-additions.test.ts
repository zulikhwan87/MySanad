/**
 * Migration 014: more qiraat and riwayat, and sanad transmitters entered by name only.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createTestDatabase, signUp } from './harness';

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
});

describe('reference data', () => {
  it('gives each of the ten imams exactly two riwayat', async () => {
    const rows = (
      await db.query<{ q: string; n: number }>(
        `SELECT q.code q, COUNT(r.id)::int n FROM qiraat_types q LEFT JOIN riwayat_types r ON r.qiraat_id = q.id
         WHERE q.code ~ '^Q[0-9]{2}-' AND q.code <> 'Q10-ASHARAH' GROUP BY q.code, q.display_order ORDER BY q.display_order`,
      )
    ).rows;
    expect(rows.map((r) => r.q)).toEqual([
      'Q01-NAFI', 'Q02-IBNKATHIR', 'Q03-ABUAMR', 'Q04-IBNAMIR', 'Q05-ASIM',
      'Q06-HAMZAH', 'Q07-KISAI', 'Q08-ABUJAFAR', 'Q09-YAQUB', 'Q10-KHALAF',
    ]);
    expect(rows.every((r) => r.n === 2)).toBe(true);
    const khalaf = (await db.query<{ l: string }>(`SELECT r.full_label_rumi l FROM riwayat_types r JOIN qiraat_types q ON q.id = r.qiraat_id WHERE q.code = 'Q10-KHALAF' ORDER BY r.display_order`)).rows;
    expect(khalaf.map((r) => r.l)).toEqual(["Riwayat Ishaq 'an Khalaf al-'Asyir", "Riwayat Idris 'an Khalaf al-'Asyir"]);
  });

  it('lists Qiraat Tujuh before Qiraat Sepuluh, and the jam\' riwayat in order', async () => {
    const q = (await db.query<{ code: string }>(`SELECT code FROM qiraat_types ORDER BY display_order`)).rows.map((r) => r.code);
    expect(q.slice(-2)).toEqual(['Q-SABAH', 'Q10-ASHARAH']);
    const r = (await db.query<{ code: string }>(`SELECT code FROM riwayat_types WHERE code LIKE 'R-JAM-%' ORDER BY display_order`)).rows.map((x) => x.code);
    expect(r).toEqual(['R-JAM-SABAH', 'R-JAM-ASHARAH', 'R-JAM-ASHARAH-SUGHRA', 'R-JAM-ASHARAH-KUBRA']);
  });
});

describe('sanad transmitters', () => {
  it('may be entered by name only', async () => {
    const uid = await signUp(db, 'guru-nama@ujian.test');
    const row = await as(db, 'authenticated', uid, async () =>
      (
        await db.query<{ generation_category: string | null }>(
          `INSERT INTO sanad_nodes (full_name_rumi, full_name_arabic) VALUES ('Syeikh Nama Sahaja', '') RETURNING generation_category`,
        )
      ).rows[0],
    );
    expect(row.generation_category).toBeNull();
  });
});
