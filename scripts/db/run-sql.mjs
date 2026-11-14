#!/usr/bin/env node
/**
 * Run SQL files against the Supabase database in ONE transaction.
 *   node --env-file=.env.local scripts/db/run-sql.mjs --check                 read-only connection check
 *   node --env-file=.env.local scripts/db/run-sql.mjs --dry-run <file.sql>...  run, then ROLL BACK (nothing changes)
 *   node --env-file=.env.local scripts/db/run-sql.mjs --apply   <file.sql>...  run and COMMIT
 * Needs SUPABASE_DB_URL (Session pooler URI). Never prints the connection string.
 */
import fs from 'node:fs';
import postgres from 'postgres';

const [mode, ...files] = process.argv.slice(2);
if (!['--check', '--dry-run', '--apply'].includes(mode)) {
  console.error('Usage: --check | --dry-run <files> | --apply <files>');
  process.exit(2);
}
if (!process.env.SUPABASE_DB_URL) {
  console.error('SUPABASE_DB_URL tiada dalam .env.local');
  process.exit(2);
}

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', max: 1, prepare: false, onnotice: () => {}, connect_timeout: 15 });
const ROLLBACK = Symbol('rollback');

try {
  if (mode === '--check') {
    const [info] = await sql`select current_user, version() as v, current_database() as db`;
    console.log('Sambungan OK |', info.current_user, '|', info.db, '|', String(info.v).split(' ').slice(0, 2).join(' '));
    const probes = await sql`
      select
        to_regclass('public.teachers') is not null as m001,
        (select count(*) from public.malaysian_states)::int as states,
        to_regprocedure('public.promote_user_to_super_admin(text)') is not null as m004,
        to_regclass('public.rate_limits') is not null as m005,
        to_regclass('public.v_public_state_stats') is not null as m006,
        to_regclass('public.teacher_change_requests') is not null as m007,
        to_regclass('public.sanad_chain_revisions') is not null as m008,
        to_regprocedure('public.register_my_document(text,text,text,text,bigint,uuid,uuid,text)') is not null as m009,
        to_regprocedure('public.admin_dashboard_counts()') is not null as m010,
        to_regclass('public.system_settings') is not null as m011,
        has_function_privilege('anon', 'public.promote_user_to_super_admin(text)', 'EXECUTE') as anon_can_promote`;
    console.log(probes[0]);
  } else {
    const started = Date.now();
    await sql.begin(async (tx) => {
      for (const file of files) {
        process.stdout.write(`  ${file} … `);
        await tx.unsafe(fs.readFileSync(file, 'utf8'));
        console.log('ok');
      }
      const [after] = await tx`
        select to_regclass('public.system_settings') is not null as settings,
               to_regclass('public.sanad_chain_revisions') is not null as revisions,
               has_function_privilege('anon', 'public.promote_user_to_super_admin(text)', 'EXECUTE') as anon_can_promote,
               (select count(*) from public.profiles where role = 'super_admin')::int as super_admins`;
      console.log('  keadaan dalam transaksi:', after);
      if (mode === '--dry-run') throw ROLLBACK;
    });
    console.log(`DIKOMIT dalam ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
} catch (error) {
  if (error === ROLLBACK) {
    console.log('LARIAN UJIAN BERJAYA — semua dibatalkan (ROLLBACK), tiada apa-apa berubah.');
  } else {
    console.error('RALAT:', error.message, error.position ? `(kedudukan ${error.position})` : '', error.where ? `\n  di: ${error.where}` : '');
    console.error('Transaksi dibatalkan; tiada apa-apa berubah.');
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
