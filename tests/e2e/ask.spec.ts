import { expect, test, type Page } from '@playwright/test';

/**
 * AI interpretation against a mocked OpenRouter endpoint: consent → key →
 * interpret (streamed) → follow-up, and the dream flow that lays cards.
 */
const ANSWER = ['## Overview\n\nThe **Star** brings hope. ', 'Reflect: what are you hoping for?'];

async function open(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript((extra) => {
    if (sessionStorage.getItem('e2e-initialised')) return;
    sessionStorage.setItem('e2e-initialised', '1');
    localStorage.setItem(
      'tarot.settings.v1',
      JSON.stringify({ version: 1, locale: 'en', allowReversed: false, minorArcana: false, haptics: false, fanned: false, deckId: 'standard', spreadId: 'three', seenHelp: true, ...extra }),
    );
    localStorage.removeItem('tarot.table.v1');
    localStorage.removeItem('tarot.ai.key');
    indexedDB.deleteDatabase('tarot-ai');
  }, extra);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Deck, 22 cards left/ })).toBeVisible();
}

/** Serves a streamed SSE answer for chat completions and records the request bodies. */
async function mockOpenRouter(page: Page, reply: (body: { messages: { role: string; content: string }[]; stream: boolean }) => string) {
  const bodies: { messages: { role: string; content: string }[]; stream: boolean; model: string }[] = [];
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const text = reply(body);
    if (!body.stream) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: text } }] }) });
      return;
    }
    const chunks = text.split(' ').map((w) => `data: ${JSON.stringify({ choices: [{ delta: { content: w + ' ' } }], model: 'mock/model' })}\n\n`);
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `: OPENROUTER PROCESSING\n\n${chunks.join('')}data: [DONE]\n\n` });
  });
  return bodies;
}

test('consent, key, then a streamed interpretation of the face-up cards with a follow-up', async ({ page }) => {
  await open(page);
  const bodies = await mockOpenRouter(page, (b) => (b.messages.length > 2 ? 'Follow-up answer.' : ANSWER.join('')));

  // Draw one card and flip it face up.
  await page.locator('[data-drop="deck"] .deck-card').last().click();
  const placed = page.locator('[data-slot-index="0"] [data-card]');
  await placed.click();
  await expect(placed).toHaveAttribute('aria-label', /upright/);

  await page.getByTestId('toolbar-ask').click();
  await expect(page.getByTestId('ask-panel')).toBeVisible();
  await page.getByTestId('ask-consent').click();
  await page.getByTestId('ask-key-input').fill('sk-or-v1-test-key-1234');
  await page.getByTestId('ask-key-save').click();

  await expect(page.getByTestId('ask-summary')).toHaveText(/1 face up · 0 face down/);
  await page.getByTestId('ask-question').fill('Should I change jobs?');
  await page.getByTestId('ask-interpret').click();

  const answer = page.getByTestId('ask-answer');
  await expect(answer).toContainText('what are you hoping for?');
  await expect(answer.locator('strong')).toHaveText('Star');
  await expect(answer.locator('h4')).toHaveText('Overview');

  // Only the face-up card was sent, with its position and the question.
  expect(bodies).toHaveLength(1);
  const sent = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(bodies[0]!.messages[1]!.content)![1]!);
  expect(sent.question).toBe('Should I change jobs?');
  expect(sent.cards).toHaveLength(1);
  expect(sent.cards[0].position).toBe('Past');
  expect(sent.hiddenCards).toBe(0);
  expect(bodies[0]!.messages[0]!.role).toBe('system');

  await page.getByTestId('ask-followup').fill('And the future?');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('ask-answer').nth(1)).toContainText('Follow-up answer.');
  expect(bodies[1]!.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  expect(bodies[1]!.messages[3]!.content).toBe('And the future?');

  // The thread survives closing and reopening the panel (recent list).
  await page.getByTestId('ask-new').click();
  await expect(page.getByRole('button', { name: /Should I change jobs\?/ })).toBeVisible();
});

test('the Interpret button stays disabled until a card is face up, and shows the API error', async ({ page }) => {
  await open(page, { aiConsent: true });
  await page.addInitScript(() => localStorage.setItem('tarot.ai.key', 'sk-or-v1-bad-key-1234'));
  await page.reload();
  await page.route('https://openrouter.ai/api/v1/chat/completions', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"message":"bad key"}}' }),
  );
  await page.getByTestId('toolbar-ask').click();
  await expect(page.getByTestId('ask-interpret')).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.locator('[data-drop="deck"] .deck-card').last().click();
  await page.locator('[data-slot-index="0"] [data-card]').click();
  await page.getByTestId('toolbar-ask').click();
  await expect(page.getByTestId('ask-interpret')).toBeEnabled();
  await page.getByTestId('ask-interpret').click();
  await expect(page.getByTestId('ask-error')).toContainText('rejected the key');
});

test('dream mode: the model suggests cards and they land face up in the empty slots', async ({ page }) => {
  await open(page, { aiConsent: true });
  await page.addInitScript(() => localStorage.setItem('tarot.ai.key', 'sk-or-v1-test-key-1234'));
  await page.reload();
  const bodies = await mockOpenRouter(page, (b) => (b.stream ? 'Dream reading.' : '{"cards":[{"id":"18","reversed":false},{"id":"17","reversed":false},{"id":"09","reversed":false}]}'));

  await page.getByTestId('toolbar-ask').click();
  await page.getByTestId('ask-mode-dream').click();
  await page.getByTestId('ask-question').fill('I was walking under a huge moon by the sea and lost my shoes.');
  await page.getByTestId('ask-suggest').click();

  await expect(page.getByTestId('ask-summary')).toHaveText(/3 face up · 0 face down/);
  await expect(page.getByRole('button', { name: /Deck, 19 cards left/ })).toBeVisible();
  expect(bodies[0]!.stream).toBe(false);
  expect(bodies[0]!.messages[0]!.content).toContain('exactly 3');

  await page.getByTestId('ask-interpret').click();
  await expect(page.getByTestId('ask-answer')).toContainText('Dream reading.');
  const sent = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(bodies[1]!.messages[1]!.content)![1]!);
  expect(sent.mode).toBe('dream');
  expect(sent.cards.map((c: { card: string }) => c.card)).toEqual(['The Moon', 'The Star', 'The Hermit']);
});
