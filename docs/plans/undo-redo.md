# Plan: undo / redo

Status: **shipped** — `useTable` keeps 60 states; toolbar undo (hidden in the menu on narrow phones), menu undo/redo, `Z`, `Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+Y`.

## Notes
- Shuffle animation commits the gathered state, then *amends* it with the shuffled order (`useTable.amend`), so one undo returns to before the shuffle.
- Deck changes are not history entries (artwork only).
- At a shared table undo/redo are disabled: ops are authoritative and bypass the history, which is cleared when hosting starts and stays untouched for guests (their own table is stashed and restored on leave).

## Next
- Persist history with the table (currently lost on reload).
- "Undo" toast after destructive actions (new reading) with a 5-second window.
