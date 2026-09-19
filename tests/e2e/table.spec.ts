import { expect, test, type Page } from '@playwright/test';

/** Dismisses the first-run help and returns the deck element. */
async function open(page: Page) {
  await page.addInitScript(() => {
    // Runs on every navigation (including reloads): only reset storage once per test.
    if (sessionStorage.getItem('e2e-initialised')) return;
    sessionStorage.setItem('e2e-initialised', '1');
    localStorage.setItem(
      'tarot.settings.v1',
      JSON.stringify({ version: 1, locale: 'en', allowReversed: false, minorArcana: false, haptics: false, fanned: false, deckId: 'standard', spreadId: 'three', seenHelp: true }),
    );
    localStorage.removeItem('tarot.table.v1');
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Deck, 22 cards left/ })).toBeVisible();
}

/** Drags with pointer events in small steps so the gesture recogniser sees movement. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  }
  await page.mouse.up();
}

test('layout fits the viewport: toolbar, three empty slots and the deck are visible', async ({ page }) => {
  await open(page);
  await expect(page.locator('.toolbar')).toBeVisible();
  await expect(page.locator('[data-slot-index]')).toHaveCount(3);
  for (const slot of await page.locator('[data-slot-index]').all()) {
    const box = await slot.boundingBox();
    const vp = page.viewportSize()!;
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
  }
  const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noScroll).toBe(true);
});

test('tapping the deck draws into the next empty position; tapping the card flips it in place', async ({ page }) => {
  await open(page);
  const deck = page.locator('[data-drop="deck"] .deck-card').last();
  await deck.click();
  await expect(page.getByRole('button', { name: /Deck, 21 cards left/ })).toBeVisible();

  const placed = page.locator('[data-slot-index="0"] [data-card]');
  await expect(placed).toBeVisible();
  const before = await placed.boundingBox();
  await expect(placed).toHaveAttribute('aria-label', /face down/);
  await placed.click();
  await expect(placed).toHaveAttribute('aria-label', /upright/);
  const after = await placed.boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(1);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
});

test('dragging the top card onto a slot places it; dropping on the deck returns it', async ({ page }) => {
  await open(page);
  const deckCard = page.locator('[data-drop="deck"] .deck-card').last();
  const slot = page.locator('[data-slot-index="2"]');
  const a = await deckCard.boundingBox();
  const b = await slot.boundingBox();
  await drag(page, { x: a!.x + a!.width / 2, y: a!.y + 10 }, { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 });
  await expect(page.locator('[data-slot-index="2"] [data-card]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Deck, 21 cards left/ })).toBeVisible();

  const placed = page.locator('[data-slot-index="2"] [data-card]');
  const p = await placed.boundingBox();
  const d = await page.locator('[data-drop="deck"] .deck').boundingBox();
  await drag(page, { x: p!.x + p!.width / 2, y: p!.y + p!.height / 2 }, { x: d!.x + d!.width / 2, y: d!.y + 12 });
  await expect(page.getByRole('button', { name: /Deck, 22 cards left/ })).toBeVisible();
});

test('the Celtic Cross crossing slot accepts a drop and the whole spread fits on screen', async ({ page }) => {
  await open(page);
  await page.locator('select').nth(1).selectOption('celtic-cross');
  await expect(page.locator('[data-slot-index]')).toHaveCount(10);
  const vp = page.viewportSize()!;
  for (const slot of await page.locator('[data-slot-index]').all()) {
    const box = (await slot.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  }
  // Fill the heart first, then drop on the same centre: the crossing slot is the empty one.
  const deckCard = () => page.locator('[data-drop="deck"] .deck-card').last();
  const heart = (await page.locator('[data-slot-index="0"]').boundingBox())!;
  let a = (await deckCard().boundingBox())!;
  await drag(page, { x: a.x + a.width / 2, y: a.y + 10 }, { x: heart.x + heart.width / 2, y: heart.y + heart.height / 2 });
  await expect(page.locator('[data-slot-index="0"] [data-card]')).toBeVisible();
  a = (await deckCard().boundingBox())!;
  await drag(page, { x: a.x + a.width / 2, y: a.y + 10 }, { x: heart.x + heart.width / 2, y: heart.y + heart.height / 2 });
  await expect(page.locator('[data-slot-index="1"] [data-card]')).toBeVisible();
});

test('the table survives a reload', async ({ page }) => {
  await open(page);
  await page.locator('[data-drop="deck"] .deck-card').last().click();
  await expect(page.getByRole('button', { name: /Deck, 21 cards left/ })).toBeVisible();
  await page.waitForTimeout(300); // autosave debounce
  await page.reload();
  await expect(page.getByRole('button', { name: /Deck, 21 cards left/ })).toBeVisible();
  await expect(page.locator('[data-slot-index="0"] [data-card]')).toBeVisible();
});

test('the Minor Arcana toggle starts a 78-card table that survives a reload; minors are drawn smaller', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByTestId('menu-minor').click();
  await expect(page.getByRole('button', { name: /Deck, 78 cards left/ })).toBeVisible();
  await expect(page.locator('[data-slot-index]')).toHaveCount(3);

  // Every minor card is somewhere in the saved deck, drawn at a reduced scale.
  // Autosave is debounced, so wait for the 78-card table to reach storage.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tarot.table.v1') ?? 'null')?.deck?.length ?? 0)).toBe(78);
  const scales = await page.evaluate(() => {
    const deck = JSON.parse(localStorage.getItem('tarot.table.v1')!).deck as { id: string }[];
    const cards = Array.from(document.querySelectorAll('[data-drop="deck"] .deck-card .card')) as HTMLElement[];
    return deck.map((c, i) => ({ minor: c.id.includes('-'), scale: cards[i]!.style.getPropertyValue('--card-scale') }));
  });
  expect(scales.filter((s) => s.minor)).toHaveLength(56);
  for (const s of scales) expect(Number(s.scale) < 1).toBe(s.minor);

  await page.reload();
  await expect(page.getByRole('button', { name: /Deck, 78 cards left/ })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByTestId('menu-minor')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('menu-minor').click();
  await expect(page.getByRole('button', { name: /Deck, 22 cards left/ })).toBeVisible();
});
