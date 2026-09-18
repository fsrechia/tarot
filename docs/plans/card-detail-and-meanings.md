# Plan: card detail and meanings

Status: **shipped** — ⓘ on face-up cards or long-press opens a sheet with art, name, orientation badge, keywords, meanings (orientation first), position; prev/next in reading order; keyboard arrows; pt-BR/en.

## Next
- Richer texts: longer meanings, per-position hints (e.g. The Tower in "Advice"), symbolism notes, numerology; authored in Markdown files per card (`src/content/cards/<id>.<locale>.md`) instead of the inline table, loaded with Astro content collections.
- Deck-specific descriptions: the Vitoriushka deck's cards depict personal scenes; a `cardNotes` map in the manifest shown under the standard meaning (also fed to the AI).
- Search: a "Find a card" sheet listing all 22 with thumbnails; tap to place on the table.
- The ⓘ button is hidden under the Celtic Cross crossing card for the heart position; long-press still works. Option: place the button at the bottom-left for slot 0 when a rotated slot overlays it, or show a small "1 | 2" toggle.
