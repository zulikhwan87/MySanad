import { test, expect } from '@playwright/test';

/** Assertions that need real Supabase data (e.g. "unknown UUID is 404") only run with E2E_WITH_DB=1. */
const withDb = Boolean(process.env.E2E_WITH_DB);

// Run against a built app: `npm run build && npx next start` then `npm run test:e2e`.
test.describe('MySanad Phase 1', () => {
  test('homepage shows the hero and stats, without the state grid (or the not-connected notice)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Direktori');
    await expect(page.locator('main a[href^="/states/"]')).toHaveCount(0);
    if (withDb) await expect(page.getByRole('heading', { name: 'Statistik platform' })).toBeAttached();
    else await expect(page.getByText('Pangkalan data belum disambungkan').first()).toBeVisible();
  });

  test('header links to Qiraat & Riwayat and no longer to institutions', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header');
    await expect(header.locator('a[href="/institutions"]')).toHaveCount(0);
    await expect(header.locator('a[href="/sanad"]')).toHaveCount(0);
    await page.goto('/qiraat');
    await expect(page.locator('h1')).toContainText('qiraat dan riwayat');
    if (withDb) await expect(page.locator('a[href^="/directory?qiraat="]').first()).toBeVisible();
  });

  test('public sanad document route hides unknown documents', async ({ request }) => {
    const res = await request.get('/api/public-documents/00000000-0000-0000-0000-000000000001', { maxRedirects: 0 });
    expect([404, 503]).toContain(res.status());
    const bad = await request.get('/api/public-documents/bukan-uuid', { maxRedirects: 0 });
    expect([400, 503]).toContain(bad.status());
  });

  test('portals redirect anonymous visitors to login with a safe next path', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fusers/);
  });

  test('admin teacher entry pages require login', async ({ page }) => {
    await page.goto('/admin/teachers/new');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fteachers%2Fnew/);
  });

  test('registration form validates in Bahasa Melayu', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'Daftar Akaun' }).click();
    await expect(page.getByText('Emel diperlukan.')).toBeVisible();
  });

  test('private document endpoint rejects anonymous visitors', async ({ request }) => {
    const res = await request.get('/api/documents/00000000-0000-0000-0000-000000000001/signed-url');
    expect([401, 503]).toContain(res.status());
  });

  test('no horizontal scrolling at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fits).toBe(true);
  });
});

test.describe('MySanad Phase 2 (public portal)', () => {
  test('unknown profile and unknown state return 404', async ({ request }) => {
    expect((await request.get('/directory/not-a-uuid')).status()).toBe(404);
    expect((await request.get('/states/atlantis')).status()).toBe(404);
    if (withDb) expect((await request.get('/directory/00000000-0000-4000-8000-000000000000')).status()).toBe(404);
  });

  test('state page shows the selected state', async ({ page }) => {
    await page.goto('/states/kelantan');
    await expect(page.locator('h1')).toContainText('Kelantan');
  });

  test('directory search updates the URL', async ({ page }) => {
    await page.goto('/directory');
    await page.locator('input[role="combobox"]').fill('Ahmad');
    await page.getByRole('button', { name: 'Cari' }).click();
    await expect(page).toHaveURL(/\/directory\?q=Ahmad/);
  });
});

test.describe('MySanad Phase 3 (teacher portal)', () => {
  test('every teacher portal page requires login', async ({ page }) => {
    for (const path of ['/teacher/register', '/teacher/profile', '/teacher/verification']) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
  });
});

test.describe('MySanad Phase 4 (sanad)', () => {
  test('public sanad explorer loads and unknown chains are 404', async ({ page, request }) => {
    await page.goto('/sanad');
    await expect(page.locator('h1')).toContainText('sanad');
    expect((await request.get('/sanad/not-a-uuid')).status()).toBe(404);
    if (withDb) expect((await request.get('/sanad/00000000-0000-4000-8000-000000000000')).status()).toBe(404);
  });

  test('sanad editor requires login', async ({ page }) => {
    await page.goto('/teacher/sanad/new');
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});

test.describe('MySanad Phase 5 (documents)', () => {
  test('documents page requires login and the signed-URL endpoint refuses anonymous visitors', async ({ page, request }) => {
    await page.goto('/teacher/documents');
    await expect(page).toHaveURL(/\/login\?next=/);
    const res = await request.get('/api/documents/33333333-3333-4333-8333-333333333333/signed-url');
    expect([401, 503]).toContain(res.status());
    expect(res.headers()['cache-control']).toBe('no-store');
  });
});

test.describe('MySanad Phase 6 (admin)', () => {
  test('admin portal and notifications require login', async ({ page }) => {
    for (const path of ['/admin/dashboard', '/admin/users', '/admin/audit-logs', '/teacher/notifications']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });
});

test.describe('MySanad Phase 7 (i18n & headers)', () => {
  test('switching to Arabic renders right-to-left', async ({ page }) => {
    await page.goto('/');
    // On narrow screens the switcher lives in the menu.
    const menu = page.getByRole('button', { name: 'Menu' });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('button', { name: 'العربية' }).filter({ visible: true }).first().click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    const bm = page.getByRole('button', { name: 'Bahasa Melayu' }).filter({ visible: true }).first();
    if (!(await bm.isVisible())) await page.getByRole('button', { name: 'القائمة' }).click();
    await bm.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ms');
  });

  test('sends a Content-Security-Policy', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});
