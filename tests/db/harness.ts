import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const root = path.resolve(__dirname, '../..');
const migrationsDir = path.join(root, 'supabase/migrations');

export type Role = 'anon' | 'authenticated' | 'service_role';

/** Fresh in-memory Postgres with the Supabase stub and every migration applied in order. */
export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm, uuid_ossp } });
  await db.exec(fs.readFileSync(path.join(__dirname, 'supabase-stub.sql'), 'utf8'));
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    try {
      await db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

/** Run `fn` as an API role, optionally with a signed-in user id (auth.uid()). */
export async function as<T>(
  db: PGlite,
  role: Role,
  userId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  await db.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('RESET ROLE');
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  }
}

/** Simulates Supabase Auth sign-up (inserts into auth.users, which fires the profile trigger). */
export async function signUp(db: PGlite, email: string, meta: Record<string, unknown> = {}) {
  const id = randomUUID();
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)`, [
    id,
    email,
    JSON.stringify(meta),
  ]);
  return id;
}

/** Directly set a role as the database owner (what the SQL-editor bootstrap does). */
export async function setRoleAsOwner(db: PGlite, userId: string, role: string) {
  await db.query(`UPDATE public.profiles SET role = $2::user_role WHERE id = $1`, [userId, role]);
}

export async function stateId(db: PGlite, slug: string): Promise<string> {
  const res = await db.query<{ id: string }>(`SELECT id FROM public.malaysian_states WHERE slug = $1`, [slug]);
  if (!res.rows[0]) throw new Error(`state ${slug} not found`);
  return res.rows[0].id;
}
