/**
 * Live check (optional): an administrator creates a teacher without an account, fills the profile,
 * submits and publishes it, and the teacher appears in the public directory.
 *
 * Runs only when E2E_ADMIN_CREDS points to a JSON file {id, email, password, tag} of a temporary
 * verification administrator (never commit such a file). Uses the Supabase project in .env.local and
 * deletes the teacher it created. Screenshots go to E2E_SCREENSHOT_DIR when set.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const credsFile = process.env.E2E_ADMIN_CREDS;
const shots = process.env.E2E_SCREENSHOT_DIR;

test.describe('admin-managed teacher (live)', () => {
  test.skip(!credsFile, 'E2E_ADMIN_CREDS not set');
  test.describe.configure({ mode: 'serial' });

  test('create, fill, submit, publish, find publicly', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    test.setTimeout(180_000);
    const creds = JSON.parse(fs.readFileSync(credsFile!, 'utf8')) as { email: string; password: string; tag: string };
    const name = `[UJIAN] Guru Warga Emas ${creds.tag}`;
    const snap = async (file: string) => {
      if (shots) await page.screenshot({ path: path.join(shots, file), fullPage: false });
    };
    let teacherId: string | null = null;

    try {
      await page.goto('/login');
      await page.getByLabel('Emel').fill(creds.email);
      await page.getByLabel('Kata laluan', { exact: true }).fill(creds.password);
      await page.getByRole('button', { name: /Log Masuk/i }).click();
      await page.waitForURL(/\/admin\/dashboard|\/teacher\/dashboard|\/$/, { timeout: 30_000 });

      await page.goto('/admin/teachers');
      await expect(page.getByRole('link', { name: 'Tambah guru' })).toBeVisible();
      await page.getByRole('link', { name: 'Tambah guru' }).click();
      await page.waitForURL(/\/admin\/teachers\/new/);
      await snap('01-tambah-guru.png');
      await page.getByLabel('Nama penuh (Rumi)').fill(name);
      await page.getByLabel('Nama paparan awam').fill(name);
      await page.getByRole('button', { name: 'Cipta profil & teruskan' }).click();
      await page.waitForURL(/\/admin\/teachers\/[0-9a-f-]{36}\/sunting/, { timeout: 30_000 });
      teacherId = page.url().match(/teachers\/([0-9a-f-]{36})/)![1];
      await expect(page.getByRole('heading', { name: new RegExp(`Sunting: .*${creds.tag}`) })).toBeVisible();
      await snap('02-sunting-peribadi.png');

      await page.getByRole('link', { name: 'Kelayakan & ijazah' }).click();
      await page.waitForURL(/bahagian=kelayakan/);
      await page.getByLabel('Qiraat utama').selectOption({ label: "Qiraat 'Asim al-Kufi" });
      await page.getByRole('button', { name: 'Simpan & teruskan' }).click();
      await expect(page.getByText('Kelayakan disimpan.')).toBeVisible({ timeout: 20_000 });

      await page.getByRole('link', { name: 'Pengajaran' }).click();
      await page.waitForURL(/bahagian=pengajaran/);
      await page.getByLabel('Negeri mengajar').selectOption({ label: 'Kelantan' });
      await page.getByLabel('Biografi ringkas').fill('Guru al-Quran warga emas di Kelantan. Rekod ujian automatik yang akan dipadam.');
      await page.getByRole('button', { name: 'Simpan', exact: true }).first().click();
      await expect(page.getByText('Maklumat pengajaran disimpan.')).toBeVisible({ timeout: 20_000 });
      await snap('03-pengajaran.png');

      await page.getByRole('link', { name: 'Hantar & akaun' }).click();
      await page.waitForURL(/bahagian=hantar/);
      await page.getByLabel(/diberikan oleh guru/).check();
      await page.getByRole('button', { name: 'Hantar untuk pengesahan' }).click();
      await expect(page.getByText('Profil dihantar ke Barisan Semakan', { exact: false })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByLabel(/Emel akaun guru/)).toBeVisible();
      await snap('04-hantar.png');

      // Publish through the same decision function the review page uses, as this administrator.
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false },
      });
      const signIn = await supabase.auth.signInWithPassword({ email: creds.email, password: creds.password });
      expect(signIn.error).toBeNull();
      const { data: subs } = await supabase
        .from('verification_submissions')
        .select('id')
        .eq('teacher_id', teacherId)
        .eq('target_type', 'teacher_profile')
        .eq('status', 'submitted');
      expect(subs).toHaveLength(1);
      const decided = await supabase.rpc('admin_decide_submission', { p_submission_id: subs![0].id, p_decision: 'publish' });
      expect(decided.error).toBeNull();

      await page.goto(`/directory?q=${encodeURIComponent(creds.tag)}`);
      await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 });
      await page.goto(`/directory/${teacherId}`);
      await expect(page.locator('h1')).toContainText(creds.tag);
      await snap('05-profil-awam.png');

      await page.goto('/admin/teachers');
      await expect(page.getByText('Diurus pentadbir').first()).toBeVisible();
    } finally {
      if (teacherId) {
        const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false },
        });
        await service.from('sanad_nodes').delete().eq('linked_teacher_id', teacherId);
        await service.from('teachers').delete().eq('id', teacherId);
      }
    }
  });
});
