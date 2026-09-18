# Plan: testing and CI

Status: **shipped**.

- **Unit** (Vitest, node): engine ops (including the flip cycle and `placeCards`), shuffle, geometry (fit/zoom), image resolution, i18n parity, card data completeness, wire protocol (op/snapshot validation, seeded determinism), AI layer (SSE parsing, client error mapping, Markdown, prompt building). `npm test`.
- **E2E** (Playwright): production build served by `astro preview` plus the signaling helper on :8787; projects Pixel 7, iPhone 14 (Chromium engine), Desktop Chrome. Covers: viewport fit, tap-to-draw and flip in place, drag deck→slot and slot→deck, Celtic Cross crossing drop and fit, reload restore (`table.spec.ts`); host/guest room over a real DataChannel, spread change propagation, leave restores the guest's table, bad token and join link (`multiplayer.spec.ts`, desktop only); consent → key → streamed interpretation → follow-up, error display, dream mode placing cards, all against a mocked OpenRouter route (`ask.spec.ts`). `npm run test:e2e` (first: `npx playwright install chromium`).
- **Types**: `npm run check` (`astro check` + `vue-tsc`).
- **CI**: `.github/workflows/ci.yml` runs check → unit → build → e2e on push/PR.

## Next
- Real WebKit project (`devices['iPhone 14']` with `webkit`) — needs `npx playwright install webkit`; add to CI.
- Touch-specific tests using `page.touchscreen` and CDP `Input.dispatchTouchEvent` for pinch (Playwright has no pinch helper; emulate two touch points via CDP).
- Visual regression snapshots for the three spreads on the phone project.
- Lighthouse CI for PWA/perf budgets.
- Deploy job: GitHub Pages (`base: '/tarot'` if under the repo path) or Cloudflare Pages.
