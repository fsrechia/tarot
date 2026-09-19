# Bug reports

B1–B20 are findings from the code review of the original single-component prototype (`TarotTable.vue` at commit `e98ce5e`), with root causes and the fix that shipped in the refactor. B21 onwards come from the review round after the AI and multiplayer features landed. Status: **Fixed** = shipped, **Mitigated** = improved but tracked further in `ROADMAP.md`, **Open** = not yet addressed.

Format: environment · steps · expected · actual · root cause · fix.

---

## B1 — Tapping a loose card moves it under the finger and does not flip it  ·  **Fixed**

- **Environment**: all platforms, worst on touch.
- **Steps**: draw a card onto the free table, tap it once.
- **Expected**: the card flips in place.
- **Actual**: the card jumps so its centre is under the finger; it does not flip (or flips inconsistently). Tapping the deck's top card silently drops it under the drawer.
- **Root cause**: `@pointerdown="startDrag"` and `@click="flipCard"` on the same element with no movement threshold, so every tap ran a full drag + drop. The drop `splice`d the card and `push`ed a *new* object (`{...card, x, y}`); the click handler, bound before re-render, mutated the old, discarded object.
- **Fix**: `usePointerDrag` recognises tap / long-press / drag from one pointer with a movement threshold (4px mouse, 8px touch). No `@click` on cards. Tap → `flipCard`; drag → `moveCard`. Engine functions return new state so there is no stale-object problem.

## B2 — Stuck drags and phantom pointers  ·  **Fixed**

- **Environment**: Android Chrome, iOS Safari; also desktop when releasing the mouse outside the window.
- **Steps**: start dragging a card, then (a) swipe from the screen edge / receive a notification / rest a palm, or (b) release the finger over the toolbar; or start a pinch with a second finger and release over the header.
- **Expected**: the gesture cancels cleanly; panning and pinching work afterwards.
- **Actual**: (a) the drag ghost stays on screen and window listeners leak; (b) a pointer stays in `activePointers` forever, so single-finger panning becomes a broken two-finger pinch.
- **Root cause**: only `pointerup` was handled (not `pointercancel`), and pointer bookkeeping only listened on `<main>`, so releases over other elements were never seen. Nothing was removed on unmount.
- **Fix**: `useCamera` listens for `pointermove/up/cancel` and `blur` on `window`; `usePointerDrag` handles `pointercancel`, `blur` and explicit cancellation (second finger → pinch cancels the drag). Both remove listeners in `onBeforeUnmount`.

## B3 — Hard-coded card size makes drops land in the wrong place  ·  **Fixed**

- **Environment**: any viewport ≥ 400px wide.
- **Steps**: drop a card on the free table.
- **Actual**: the card lands 12px / 21px off from where the ghost was; the ghost itself is offset from the finger.
- **Root cause**: `70` / `121` (half of 140×242) were baked into `ghostStyle` and `onDragEnd`, but CSS switched cards to 165×285 above 400px.
- **Fix**: card size is computed once from the viewport and the deck's aspect ratio, exposed as `--card-w` / `--card-h`, and passed to geometry as `CardSize`. The drag session records where inside the card the pointer grabbed it (`grabX/Y` fractions) so the card never jumps on pickup or drop.

## B4 — Celtic Cross "Challenge" slot cannot be filled; the spread does not fit phones  ·  **Fixed**

- **Steps**: choose Celtic Cross, drag a card onto the crossing position while it is empty.
- **Actual**: the drop lands as a loose card; the slot is unreachable. On a 360px phone the 4-column grid overflows the screen.
- **Root cause**: `pointer-events: none` on the overlaid slot, re-enabled only for `.card-scene` (which does not exist while the slot is empty). Spread layout was per-spread CSS grid, so nothing could compute its size.
- **Fix**: spreads are coordinate data (`SlotDef {x, y, rotation}`); drop targets are resolved geometrically (`findSlotAt`: empty slots win, then nearest centre, then lowest index, so the heart fills before the crossing card that shares its centre). `fitCamera` fits any spread into the viewport on load, spread change and rotation. Covered by an e2e test.

## B5 — Fanned deck overflows the screen  ·  **Fixed**

- **Environment**: phones.
- **Actual**: `Math.min(25, 800 / n)` produced a 550px-wide fan; cards at both ends were off-screen and unreachable.
- **Fix**: `DeckDrawer` computes spacing from the available width: `min(26, (availableWidth - cardWidth) / (n - 1))`.

## B6 — Cards lost under the deck drawer  ·  **Fixed**

- **Steps**: drag a card and release it over the deck.
- **Actual**: a loose card is created at that point, hidden beneath the z-200 drawer.
- **Fix**: dropping on `[data-drop="deck"]` returns the card to the top of the deck face down (`moveCard(..., {kind: 'deck'})`).

## B7 — Zoom anchored at the canvas origin; jittery pinch  ·  **Fixed**

- **Actual**: zooming with the wheel or pinch pushes content away from the cursor; a 50ms CSS transition on the canvas makes pinch lag and jitter.
- **Fix**: `zoomAround(camera, zoom, focus)` keeps the canvas point under the cursor/pinch midpoint fixed (unit-tested); pinch continues as a pan when one finger lifts; no transition on the canvas, `will-change: transform`.

## B8 — Deck drawer hidden behind iOS Safari's bottom bar; no safe areas  ·  **Fixed**

- **Root cause**: `min-height: 100vh` (100vh includes the collapsed browser chrome on iOS) and no `viewport-fit=cover`.
- **Fix**: `height: 100dvh` with `100vh` fallback, `viewport-fit=cover`, and `env(safe-area-inset-*)` on the toolbar, drawer and floating controls.

## B9 — Quirks mode and dead starter files  ·  **Fixed**

- `index.astro` had no `<!doctype html>` (quirks mode changes box and height behaviour) and did not use `Layout.astro`, whose title was still "Astro Basics". `Welcome.astro`, `astro.svg`, `background.svg` were unused.
- **Fix**: proper `Layout.astro` (doctype, meta, theme-color, PWA tags, global CSS); starter files removed.

## B10 — Four-state flip with two identical states; "reversed" rotated 90°  ·  **Fixed**

- `tapState` cycled 0→1→2→3 where 1 and 3 looked the same, and state 2 rotated the card 90° (sideways) rather than 180° (reversed).
- **Fix**: `flipCard` cycles face-down → face-up (as dealt) → face-up with orientation toggled → face-down; reversed = 180°. Sideways is now a property of the slot (`rotation: 90`), used by the Celtic Cross crossing position. Reversed cards can be dealt at shuffle time (`reversedChance`), switchable in the menu.

## B11 — Dropping on an occupied slot ejects the occupant to a random place  ·  **Fixed**

- **Fix**: slot→slot swaps; loose→slot puts the occupant where the loose card was; deck→slot returns the occupant to the deck. Unit-tested.

## B12 — Changing deck or spread wipes the table silently; no undo  ·  **Fixed**

- **Fix**: changing the deck only changes artwork (same card ids). Changing the spread or starting a new reading asks for confirmation when cards are on the table. Every action is undoable (`useTable`: 60-step history, undo/redo in toolbar/menu, `Z` / `Ctrl+Z` / `Ctrl+Shift+Z`).

## B13 — ZIP deck upload was a stub  ·  **Fixed** (lowest priority feature, see plans)

- `handleZipUpload` only logged the file name; `jszip` was installed but unused.
- **Fix**: `decks/zip.ts` reads `NN.(webp|png|jpg|…)` + optional `back.*` + optional `manifest.json`, measures the aspect ratio, stores blobs in IndexedDB, and exposes the deck under "My decks" with delete. Missing cards fall back to the standard deck.

## B14 — Cards named "Archetype N"; partial deck causes 404 churn  ·  **Fixed**

- **Fix**: `decks/tarot-major.ts` carries real names, keywords and short meanings (en, pt-BR). Deck manifests list which cards a deck has; `resolveImage` follows the fallback chain so no request is made for missing files.

## B15 — All 22 front images download at startup; artwork cropped  ·  **Mitigated**

- **Fix**: `Card.vue` only sets the front `src` once a card is shown face up (or is being dragged face up). Back images are shared. `fit` (`cover`/`contain`) and `aspectRatio` come from the deck manifest so a deck with different proportions is not cropped. **Still open**: responsive image sizes / thumbnails for slow networks (ROADMAP).

## B16 — Header consumes ~200px on phones; no fit/resize handling; needless reactivity  ·  **Fixed**

- **Fix**: single-row toolbar with a "more" menu; floating zoom/fit buttons; `ResizeObserver` re-fits on resize and orientation change; pointer bookkeeping uses a plain `Map` instead of a reactive one storing DOM events.

## B17 — No keyboard or assistive-technology support  ·  **Mitigated**

- **Fix**: cards, slots and the deck are focusable buttons with descriptive `aria-label`s (name, orientation, position); `Enter`/`Space` flips; shortcuts `D S F R A Z + - ?`; `prefers-reduced-motion` respected; modals close on `Escape`. **Still open**: moving cards by keyboard, screen-reader announcements for draws (see `plans/accessibility.md`).

## B18 — Initial table ignored the "allow reversed" setting  ·  **Fixed** (found by e2e)

- With reversed cards disabled in settings, the first table still dealt reversed cards because it was created from the game's default rules. `newTable()` now merges settings into the rules.

## B19 — Focusing the deck scrolled the whole table by 161px  ·  **Fixed** (found by e2e)

- The deck peeks out below the surface; clicking it focused it and the browser scrolled the `overflow: hidden` surface to reveal it, shifting every card. `overflow: clip` (which cannot be scrolled) plus a scroll-reset guard.

## B20 — Server-side rendering + hydration lost the restored table  ·  **Fixed** (found by e2e)

- With `client:load` the component rendered on the server with a fresh table, then hydrated with different state ("Hydration completed but contains mismatches") and the saved table was not shown. The table is now `client:only="vue"`; there is nothing meaningful to server-render.

---

## Second review round (after AI + multiplayer)

## B21 — A card dealt reversed could never be shown upright by tapping  ·  **Fixed**

- **Steps**: allow reversed cards, draw until a reversed card lands, tap it (shows reversed), tap again.
- **Expected** (B10's documented cycle): face up as dealt → face up the other way → face down.
- **Actual**: the second tap turned it face down; the only way to see it upright was to flip it down and up again, which also forgot that it had been dealt reversed.
- **Root cause**: `flipCard` decided "toggle or turn down" from `reversed` alone, so a card already reversed skipped the toggle step.
- **Fix**: `TableCard.turned` (optional, absent = false) marks a hand-toggled card; `flipCard` toggles once, then turns the card down and clears the flag. Moves keep the flag; anything that turns a card face down (deck drop, gather, shuffle) drops it. Older saved tables load unchanged. Unit-tested.

## B22 — Undo after a shuffle appeared to do nothing  ·  **Fixed**

- **Actual**: shuffle committed two history steps (gather, then the shuffled order); the first undo showed the gathered, still face-down deck, which looks identical to the shuffled one.
- **Fix**: `useTable.amend()` replaces the state without a history entry; the shuffle op amends the gather step, so one undo returns to before the shuffle, as `plans/undo-redo.md` always claimed.

## B23 — Host's table lost after a reload if the spread was changed at a shared table  ·  **Fixed**

- **Root cause**: at a shared table `newReading` changes the spread through a snapshot, which never updated `settings.spreadId`. On reload the remembered spread disagreed with the saved table and `isCompatible` discarded it.
- **Fix**: the saved table's spread wins on load (settings are only a fallback), and the host also records the new spread in settings. Guests still get their stashed table and spread back on leave.

## B24 — Failed join attempts leaked a signaling socket and a ghost guest  ·  **Fixed**

- **Actual**: when the DataChannel to the host never opened, `Room.join` rejected but left the WebSocket and the `RTCPeerConnection` alive; the host saw a guest that never said hello and dropped it only after its own timeout.
- **Fix**: `Room.join` closes the room (socket, connection, `leave` to the helper) before rethrowing.

## B25 — Rooms expired under a waiting host, silently  ·  **Fixed**

- **Actual**: the helper's "unused room" sweep measured from creation, so a room whose guest left after 10 minutes was deleted while the host still showed the code; new joiners got "bad token" and the host was never told.
- **Fix**: idle time is measured from the last join/leave; expiry (and the 24 h cap) now also sends `closed` to the host, which the client reports as "the room expired" (new string `room.errExpired`).

## B26 — A momentary network blip ended the shared session  ·  **Fixed**

- **Actual**: `RTCPeerConnection` state `disconnected` (common when a phone switches Wi-Fi ↔ mobile data, and often self-healing) was treated like `failed`.
- **Fix**: `disconnected` starts an 8-second grace timer; only `failed`/`closed`, or still-disconnected after the grace, drop the link. A guest's signaling socket closing no longer drops a guest whose DataChannel is open.

## B27 — Snapshot validation trusted the host too much  ·  **Fixed**

- `isValidState` accepted duplicate card ids, an unknown spread or a wrong number of slots, and loose cards with non-finite positions, any of which could break rendering on a guest. It now checks all of these (unit-tested). Locally, a saved table without a `loose` array is treated as unreadable instead of crashing `isCompatible`.

## B28 — An op that no longer applies threw out of a pointer handler  ·  **Fixed**

- **Steps**: at a shared table, start dragging a card while another player moves it; drop.
- **Actual**: the engine threw "No card at …" from `dispatch` (uncaught in the `pointerup` path; on the host, inside the message handler).
- **Fix**: `tryApply` catches engine rejections and logs them; the state is left untouched.

## B29 — Ask panel: a stopped follow-up left a dangling question; the first thread mutated a non-reactive object  ·  **Fixed**

- Stopping a follow-up before any text arrived kept the user turn in the thread, so the next question produced two consecutive user messages. The failed/empty follow-up is now removed in every no-answer case.
- `interpret()` ran the stream against the raw record rather than the reactive proxy stored in `thread`; rendering only worked because `streaming` flipping re-rendered the panel. It now runs against the proxy.

## B30 — Help text promised a double-tap gesture that does not exist  ·  **Fixed**

- The help sheet said "Long-press or double-tap a face-up card"; a double tap is two flips. It now says "long-press a card, or tap ⓘ".

## B31 — Small hardening  ·  **Fixed**

- Settings with a locale this build does not ship left the language menu blank; unknown locales fall back to detection.
- The signaling helper's per-IP rate-limit map was never pruned; elapsed windows are dropped in the sweep.
- Imported deck records now carry `version: 1` as the conventions promise (older records without it still load).
- Starting to host clears the local undo history, which no longer matches the shared table (ops bypass it), so undo after the room ends cannot jump to a pre-room state.

## Third round (usability + networking)

## B32 — Cancel while connecting did nothing  ·  **Fixed**

- **Steps**: Join with a code, press *Cancel* while "Connecting…" is shown.
- **Actual**: the panel went idle but the in-flight join carried on; when it completed you were silently at the host's table (or an error appeared later).
- **Root cause**: `useRoom` only created the `Room` after `Room.join` resolved, so there was nothing to cancel.
- **Fix**: every host/join attempt carries an id; `leave()` bumps it, and an attempt that completes with a stale id leaves the room it just made. Unit-tested with a mocked `Room`.

## B33 — Losing the helper ended a live game  ·  **Fixed**

- **Actual**: if the signaling helper restarted, expired the room, or the host's socket to it dropped for a moment, the host's room closed (and, through the helper's `closed` broadcast, every guest left too) although every DataChannel was healthy.
- **Fix**: the helper is only needed for *new* joiners. The host now retries the helper with growing delays (5 attempts, ~30 s) and takes a fresh code; meanwhile the panel says "Reconnecting…" and offers *Get a new code*. If it never comes back, the room stays open as long as someone is connected (code unavailable), and closes only when the host is alone. Guests ignore the helper's `closed` while their channel to the host is open; the host still says `bye` over the channel when it really leaves.

## B34 — Copy link failed silently on a LAN address  ·  **Fixed**

- **Environment**: the app opened from `http://192.168.x.x` (how you play on the same Wi-Fi).
- **Root cause**: the async clipboard API only exists in secure contexts; the failure was swallowed.
- **Fix**: `copyText()` falls back to a hidden textarea + `execCommand('copy')`, the join link is shown in a selectable field, there is a *Copy code* button, and a failure is reported. The Ask panel's transcript copy uses the same path.

## B35 — Join links needed a reload; stale errors greeted the next opening  ·  **Fixed**

- A `#join=CODE` link opened while the app was already running only changed the hash. A `hashchange` listener now opens the panel. Closing the panel dismisses a room error, and after a dropped connection the last code is pre-filled so rejoining is one tap.

## B36 — Hardening around peers and the helper  ·  **Fixed**

- Peer lists from the host are shape-checked (ids and names bounded, colours must be `#rrggbb`) before they reach `aria-label`s and inline styles.
- DataChannel messages above 64 KB are ignored before parsing; a failing offer drops that guest instead of surfacing an unhandled rejection; a pending helper request rejects immediately when the socket closes rather than after its timeout.

## B37 — Ask panel details  ·  **Fixed**

- The dream "suggest cards" request now aborts when the panel closes, so cards cannot land after the user has moved on. `Ctrl/⌘+Enter` in the question box interprets.
- The host's own notice on ending a room said "Your own table is back"; it now says "Room ended".

---

## Known limitations (not bugs, tracked in ROADMAP)

- Long-press to open card details conflicts with nothing today, but if a future feature adds a context menu it must share the recogniser.
- `window.confirm` / `window.alert` are used for the two confirmations; a styled dialog is in `plans/settings-and-themes.md`.
- Precache includes every deck image (~9.5 MB) so the app works fully offline after first load; a smarter strategy is in `plans/pwa-offline.md`.
- A guest whose DataChannel drops must rejoin (the code is pre-filled); automatic rejoin and host migration are listed in `plans/multiplayer-table.md`.
- The helper trusts `X-Forwarded-For` for rate limiting; deploy it behind a proxy that sets that header, or directly exposed clients can spoof it.
