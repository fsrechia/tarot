# Plan: share a reading

Status: planned.

## Goal
One tap to share the table as an image or a link, from the phone share sheet or the clipboard.

## Image
- Render the current table to a canvas: draw the background, then each card image at its slot/loose position with rotation (reversed / sideways), labels, and a footer (spread, date, question if the user opts in). Use the deck's image URLs (blob URLs work for imported decks). Avoid `html-to-image` (foreignObject has iOS quirks); a manual 2D-canvas renderer is ~150 lines and deterministic.
- Output PNG/JPEG via `canvas.toBlob`; share with `navigator.share({ files })` when supported (iOS/Android), else download.
- Reading order text alternative: "1. The heart — The Star (upright) …" copied to clipboard.

## Link
- Encode a compact state in the URL hash: spreadId + card ids + orientation (+ loose positions) → `#r=<base64url>` (a Celtic Cross fits in ~40 chars). Opening the link recreates the table (deck from the viewer's settings). No server.
- Optional: QR code of the link for showing across a room (reuse the QR component from multiplayer).

## Steps
1. `src/share/render.ts` (canvas renderer) + `src/share/link.ts` (encode/decode, versioned); unit tests for round-trip.
2. Share button in the menu and in the journal.
3. `index.astro`: read `#r=` on load → `replace(decode(...))`.

## Open questions
- Include the question text in images by default? (Privacy.)
- Watermark / app name on shared images?
