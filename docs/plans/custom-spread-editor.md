# Plan: custom spread editor

Status: planned.

## Goal
Let users create their own spreads on the table: place positions, rotate them, name them, save them, share them as JSON, and use them like built-in spreads.

## Design
- Edit mode toggle in the spread menu ("New spread…"). The canvas shows draggable placeholders; tap "+" to add one at the viewport centre; drag to move (snaps to a 0.1 card-unit grid, and to alignment guides of other slots); long-press → rename / rotate 90° / delete; label placement option.
- Save → `SpreadDef` stored in IndexedDB `tarot/spreads`; appears in the spread select under "My spreads"; export/import JSON; share as a link (`#s=<base64url>` of the spread) — pairs with share-reading.
- Because spreads are already pure data, the runtime needs no change: only the registry becomes `built-in + custom`.

## Steps
1. `useSpreadStore` (IndexedDB CRUD), spread validation (ids unique, ≥1 slot).
2. `SpreadEditor.vue` overlay on `TableCanvas` (reuse camera + drag composable with `data` = slot index).
3. Spread select grouping + delete/rename.
4. Unit tests for validation and JSON round-trip; e2e for creating a 2-slot spread and using it.

## Open questions
- Allow overlapping positions (as in the Celtic Cross) in the editor? Probably yes with a warning.
- Community sharing (a gallery) later, or file/link sharing only?
