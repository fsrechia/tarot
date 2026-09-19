# Plan: Minor Arcana (78-card tarot)

Status: **v1 shipped.** The tarot game now has all 78 cards; the Minor Arcana can be switched off per table (More → *Minor Arcana*).

## Decisions

- **One game, one rule.** The `tarot` game carries 78 `CardDef`s. `GameRules.minorArcana` (default `true`, overridable from settings like `allowReversed`) decides whether `createTable` deals 22 or 78 cards. This keeps one `gameId`, one persistence key, one spread list and one multiplayer protocol; the alternative (a second `tarot78` game) would have duplicated all of that for a toggle.
- **Card ids are file names.** Minor cards are `<suit>-<rank>` with suits `wands | cups | swords | pentacles` and ranks `01`…`10`, `page`, `knight`, `queen`, `king` (`wands-01`, `cups-queen`). Images use the same names, so `resolveImage` and the ZIP importer need no special cases beyond accepting the pattern.
- **Every deck may carry minors; none has to.** A deck manifest lists the minor ids it has art for; missing ones fall down the existing `fallbackDeckId` chain to the generic set in `standard`. `Vitoriushka` stays Major-only and shows the generic minors.
- **Minor cards have their own back** (`back-minor.<ext>`, `hasMinorBack` in the manifest / ZIP record). Resolution: the deck's `back-minor` → its fallback deck's `back-minor` → … → the deck's regular `back`. So a deck without a minor back simply shows one back for every card.
- **Minor cards are drawn a bit smaller.** `CardDef.scale` (0.88 for minors) scales the card face around its centre on the table, in the drawer and in the drag ghost. Positions, slot hit-tests and card units stay in Major-card size; the holder element keeps the full size so taps and drags feel the same. The detail sheet shows the art at full size.
- **Saved tables and snapshots accept either set.** `isCompatible` (autosave) and `isValidState` (guest ← host) check that the cards on the table are exactly one of the game's *card sets* (`cardSets(game)`: all cards, or all cards minus the minors). A host playing 78 and a guest whose setting says 22 therefore agree on the host's table; the guest's own 22-card table comes back when they leave. On load the setting is synced from the restored table, like the spread.
- **Generic art, generated.** `scripts/gen-minor-cards.mjs` draws the 56 fronts as SVG (roman numeral, pip layout, suit colours, court titles) and renders them with `sharp` to `public/decks/standard/`. The minor backs are hue-shifted variants of the painted back so the Major and Minor backs sit together on a table but are told apart at a glance: emerald/rose for `standard`, teal/copper for `vitoria`. Re-run the script after editing it; the output is committed.
- **AI reader.** Dream → cards works over the cards actually in the deck (already the case), so it sees 78 or 22 depending on the table. The system prompt no longer says "Major Arcana" only. `place` ops accept up to 78 cards.

## Not done (follow-ups)

- Real Rider–Waite–Smith minor scans for the standard deck (public domain) – the generic fronts are placeholders.
- A fanned 78-card deck on a 360px phone is ~3px per card; a two-row or scrollable fan would help. Stack mode is unaffected.
- Per-suit spreads / "Major only" per spread (e.g. a Celtic Cross that draws minors but a daily card from the Majors).
- Court cards in the detail sheet could show the suit's element and the rank's role as extra keywords.
