import { test, expect } from '@playwright/test';

const SHOTS = 'e2e/.results/screens';

// The Grants PRD is Hebrew, so with nothing stored the editor defaults to he.
async function openIn(page, lang) {
  await page.goto('/');
  await page.evaluate((l) => localStorage.setItem('sherlock.lang', l), lang);
  await page.reload();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => { throw e; });
});

test('Spotlight: keyboard only, from search to inspector', async ({ page }) => {
  await openIn(page, 'en');
  await expect(page.locator('.header input')).toHaveCount(0); // no header text input any more
  const magnifier = page.getByRole('button', { name: 'Search', exact: true });
  await expect(magnifier).toHaveAttribute('title', /Search \((Ctrl K|⌘K)\)/);

  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox')).toBeFocused();

  // Empty query: suggestions.
  await expect(dialog.locator('.sl-group').first()).toHaveText('Jump to');
  await expect(dialog.locator('.sl-group', { hasText: 'Needs attention' })).toBeVisible();

  await page.keyboard.type('tc-00');
  await expect(dialog.locator('.sl-group').first()).toHaveText('Test Cases');
  await expect(dialog.locator('.sl-more')).toBeVisible(); // "Show all N"
  const rows = dialog.getByRole('option');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(2)).toHaveAttribute('aria-selected', 'true');
  const id = (await rows.nth(2).locator('.sl-id').textContent()).trim();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.locator('.crumbbar .cur')).toHaveText(id);
});

test('Spotlight: §3.8, Hebrew query, Ctrl+Enter keeps it open, Esc clears then closes', async ({ page }) => {
  await openIn(page, 'en');
  await page.locator('.nav-item', { hasText: 'Requirements' }).focus();
  await page.keyboard.press('/');
  const dialog = page.getByRole('dialog');
  const input = dialog.getByRole('combobox');
  await input.fill('§3.8');
  await expect(dialog.getByRole('option').first().locator('.sl-id')).toHaveText('§3.8');
  await input.fill('3.8');
  await expect(dialog.getByRole('option').first().locator('.sl-id')).toHaveText('§3.8');

  await input.fill('שלילי');
  await expect(dialog.getByRole('option').first().locator('mark').first()).toHaveText(/שלילי/);

  await page.keyboard.press('Control+Enter');
  await expect(dialog).toBeVisible();
  await expect(page.locator('.crumbbar .cur')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(input).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.nav-item', { hasText: 'Requirements' })).toBeFocused();

  // Reopening selects the previous query; the backdrop closes it.
  await page.keyboard.press('Control+K');
  await page.mouse.click(10, 800);
  await expect(dialog).toHaveCount(0);
});

test('Hebrew flips the whole UI to RTL and persists across reloads', async ({ page }) => {
  await openIn(page, 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  expect((await page.locator('.sidebar').boundingBox()).x).toBeLessThan(10);

  await page.getByRole('button', { name: 'Change language' }).click();
  await page.getByRole('menuitemradio', { name: 'עברית' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  expect((await page.locator('.sidebar').boundingBox()).x).toBeGreaterThan(1000);
  await expect(page.locator('.nav-item', { hasText: 'דרישות' })).toBeVisible();

  // Route is kept when switching.
  await page.locator('.nav-item', { hasText: 'מקרי בדיקה' }).click();
  await page.getByRole('button', { name: 'החלפת שפה' }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();
  await expect(page).toHaveURL(/#\/testCases/);
  await expect(page.locator('h1', { hasText: 'Test Cases' })).toBeVisible();

  // Keyboard: Enter opens the menu, arrows move, Enter selects.
  await page.getByRole('button', { name: 'Change language' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitemradio', { name: 'English' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  // Persisted, and applied before first paint (the pre-paint script sets dir on <html>).
  await page.reload();
  const dirAtLoad = await page.evaluate(() => document.documentElement.dir);
  expect(dirAtLoad).toBe('rtl');
  await expect(page.locator('.nav-item', { hasText: 'דרישות' })).toBeVisible();
});

test('no horizontal overflow in Hebrew at 1280 and 1536', async ({ page }) => {
  await openIn(page, 'he');
  for (const width of [1280, 1536]) {
    await page.setViewportSize({ width, height: 900 });
    for (const hash of ['#/overview', '#/requirements', '#/testCases/TC-002', '#/prd/3.8']) {
      await page.goto(`/${hash}`);
      await expect(page.locator('.sidebar')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${width} ${hash}`).toBeLessThanOrEqual(0);
    }
  }
});

test('IDs never flip, mixed strings keep their order', async ({ page }) => {
  await openIn(page, 'he');
  await page.goto('/#/testCases');
  const chip = page.locator('.table .id-chip').first();
  await expect(chip).toHaveAttribute('dir', 'ltr');
  const bidi = await page.locator('.table .title-cell .bidi').first().evaluate((el) => getComputedStyle(el).unicodeBidi);
  expect(bidi).toBe('plaintext');
});

test('user content is aligned to the UI direction, not its own', async ({ page }) => {
  for (const [lang, align] of [['en', 'left'], ['he', 'right']]) {
    await openIn(page, lang);
    await page.goto('/#/testCases/TC-002'); // Hebrew title
    const h2 = page.locator('.insp-head h2');
    await expect(h2).toBeVisible();
    expect(await h2.evaluate((el) => getComputedStyle(el).textAlign)).toBe(align);
    // The text hugs the UI's start edge.
    const [box, text] = await h2.evaluate((el) => {
      const r = document.createRange(); r.selectNodeContents(el);
      const b = el.getBoundingClientRect(); const t = r.getBoundingClientRect();
      return [{ l: b.left, r: b.right }, { l: t.left, r: t.right }];
    });
    if (align === 'left') expect(text.l - box.l).toBeLessThan(2);
    else expect(box.r - text.r).toBeLessThan(2);
  }
});

for (const lang of ['en', 'he']) {
  test(`screenshots (${lang})`, async ({ page }) => {
    await openIn(page, lang);
    for (const [name, hash] of [['overview', '#/overview'], ['list', '#/requirements'], ['inspector', '#/testCases/TC-002'], ['prd', '#/prd/3.8']]) {
      await page.goto(`/${hash}`);
      await expect(page.locator('.sidebar')).toBeVisible();
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${SHOTS}/${lang}-${name}.png` });
    }
    await page.keyboard.press('Control+K');
    await page.keyboard.type(lang === 'he' ? 'מחיר' : 'grant price');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/${lang}-spotlight.png` });
  });
}
