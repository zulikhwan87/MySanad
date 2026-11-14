import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MALAYSIAN_STATES } from '@/lib/constants/malaysia-data';

describe('Malaysian reference data', () => {
  it('client constants match the database seed slugs', () => {
    const seed = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/003_seed_reference_data.sql'), 'utf8');
    for (const s of MALAYSIAN_STATES) expect(seed).toContain(`'${s.slug}'`);
  });

  it('carries no fabricated teacher counts', () => {
    for (const s of MALAYSIAN_STATES) expect(s).not.toHaveProperty('published_teacher_count');
  });

  it('has unique slugs', () => {
    const slugs = MALAYSIAN_STATES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
