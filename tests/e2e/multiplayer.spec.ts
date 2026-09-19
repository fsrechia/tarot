import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Two browser contexts (host + guest) connect through the local signaling
 * helper and a real WebRTC DataChannel (loopback ICE), then share a table.
 */
async function openTable(browser: Browser, name: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript((nick) => {
    if (sessionStorage.getItem('e2e-initialised')) return;
    sessionStorage.setItem('e2e-initialised', '1');
    localStorage.setItem(
      'tarot.settings.v1',
      JSON.stringify({ version: 1, locale: 'en', allowReversed: false, minorArcana: false, haptics: false, fanned: false, deckId: 'standard', spreadId: 'three', seenHelp: true, nickname: nick }),
    );
    localStorage.removeItem('tarot.table.v1');
  }, name);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Deck, 22 cards left/ })).toBeVisible();
  return page;
}

const deckLabel = (page: Page, n: number) => page.getByRole('button', { name: new RegExp(`Deck, ${n} cards left`) });

test.describe('play together', () => {
  // Two full contexts with WebRTC are heavy; the desktop project covers the protocol, the phone projects cover layout.
  test.skip(({ isMobile }) => !!isMobile, 'multiplayer flow runs on the desktop project only');

  test('host creates a token, guest joins, and the table is shared both ways', async ({ browser }) => {
    const host = await openTable(browser, 'Ana');
    const guest = await openTable(browser, 'Bea');

    // Host draws one card before anyone joins: the guest must receive it in the snapshot.
    await host.locator('[data-drop="deck"] .deck-card').last().click();
    await expect(deckLabel(host, 21)).toBeVisible();

    await host.locator('.toolbar .more > button').click();
    await host.getByTestId('menu-room').click();
    await host.getByTestId('room-host').click();
    const token = (await host.getByTestId('room-token').textContent({ timeout: 10_000 }))!.trim();
    expect(token).toMatch(/^[A-Z2-9]{6}$/);

    await guest.locator('.toolbar .more > button').click();
    await guest.getByTestId('menu-room').click();
    await guest.getByTestId('room-token-input').fill(token.toLowerCase());
    await guest.getByTestId('room-join').click();

    // Guest: panel closes, banner shows two players, table matches the host's.
    await expect(guest.getByTestId('room-banner')).toContainText('2 players', { timeout: 20_000 });
    await expect(deckLabel(guest, 21)).toBeVisible();
    await expect(guest.locator('[data-slot-index="0"] [data-card]')).toBeVisible();
    await expect(host.getByTestId('room-token')).toBeVisible();
    await expect(host.locator('.peers li')).toHaveCount(2);
    await host.keyboard.press('Escape');

    // Guest flips the host's card: host sees it face up.
    await guest.locator('[data-slot-index="0"] [data-card]').click();
    await expect(host.locator('[data-slot-index="0"] [data-card]')).toHaveAttribute('aria-label', /upright/, { timeout: 10_000 });

    // Guest draws: both see 20 left and slot 2 filled.
    await guest.locator('[data-drop="deck"] .deck-card').last().click();
    await expect(deckLabel(host, 20)).toBeVisible();
    await expect(deckLabel(guest, 20)).toBeVisible();
    await expect(host.locator('[data-slot-index="1"] [data-card]')).toBeVisible();

    // Host deals the rest via the menu: guest follows.
    await host.locator('.toolbar .more > button').click();
    await host.getByRole('menuitem', { name: 'Deal spread' }).click();
    await expect(deckLabel(guest, 19)).toBeVisible();

    // Host changes the spread: guest's spread follows (10 slots).
    host.once('dialog', (d) => d.accept());
    await host.locator('select').nth(1).selectOption('celtic-cross');
    await expect(guest.locator('[data-slot-index]')).toHaveCount(10, { timeout: 10_000 });
    await expect(guest.locator('select').nth(1)).toHaveValue('celtic-cross');

    // Guest leaves: their own table (three-card, 22 cards) comes back; host keeps playing.
    await guest.getByTestId('room-banner').click();
    await guest.getByRole('button', { name: 'Leave' }).click();
    await expect(guest.locator('[data-slot-index]')).toHaveCount(3);
    await expect(deckLabel(guest, 22)).toBeVisible();
    await expect(host.locator('.toolbar')).toBeVisible();
    await expect(host.getByTestId('room-banner')).toContainText('1 players', { timeout: 10_000 });

    await host.context().close();
    await guest.context().close();
  });

  test('joining with a wrong token shows an error; the join link pre-fills the token', async ({ browser }) => {
    const page = await openTable(browser, 'Cy');
    await page.locator('.toolbar .more > button').click();
    await page.getByTestId('menu-room').click();
    await page.getByTestId('room-token-input').fill('ZZZZZZ');
    await page.getByTestId('room-join').click();
    await expect(page.getByRole('alert')).toContainText('No table with that code', { timeout: 15_000 });
    await page.keyboard.press('Escape');

    // A join link opened while the app is running is a hash-only navigation: the
    // panel must open on `hashchange`, with the code filled in and the earlier
    // error dismissed.
    await page.goto('/#join=abc234');
    await expect(page.getByTestId('room-token-input')).toHaveValue('ABC234');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('');
    await page.context().close();
  });
});
