# Plan: settings and themes

Status: basic settings shipped (language, reversed, haptics); themes planned.

## Scope
- **Settings screen** (replaces the menu checkboxes as they grow): language, reversed cards + chance, haptics, sounds, card size (S/M/L multiplier), animation speed, default deck/spread, reset data.
- **Table themes**: cloth (velvet purple, forest green, midnight, parchment), controlled via CSS variables on `.table`; deck-suggested theme in the manifest.
- **Sounds**: shuffle, draw, flip, drop (short, royalty-free); Web Audio with a preloaded sprite; respects silent switch on iOS (audio only after user gesture).
- **Styled dialogs**: replace `window.confirm/alert` with a `Dialog.vue` (`<dialog>` element, focus trap, safe-area aware).
- **Light mode**: optional; keep dark as default (cards pop).

## Open questions
- Should themes be per deck (a personal deck with its own table art) — i.e. a `theme` field in the manifest with a background image?
