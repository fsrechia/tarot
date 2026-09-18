# Plan: ZIP deck import

Status: **shipped** (lowest priority for further work per maintainer).

## What exists
- More → *Import deck (ZIP)*: reads `NN.(webp|png|jpg|jpeg|avif|gif)` + optional `back.*` + optional `manifest.json` (`name`, `fit`, `credits`); ignores folders; pads `0.png` → `00`; measures aspect ratio; stores blobs in IndexedDB (`tarot/decks`); lists under "My decks"; delete from the menu; missing cards fall back to the standard deck; object URLs revoked on unmount.

## Possible polish (later)
- Drag-and-drop a ZIP onto the table (desktop).
- Import progress + validation report (which cards were found).
- Deck cover thumbnail and credits in a deck picker.
- Export a custom deck back to ZIP; share to another device via Web Share / multiplayer channel.
- Accept a folder (`webkitdirectory`) and single images.
