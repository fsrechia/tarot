# Plan: accessibility

Status: baseline shipped (focusable cards with descriptive labels, Enter/Space to flip, shortcuts, reduced motion, Escape closes modals). Next steps:

1. **Keyboard card movement**: with a card focused, `M` enters "move" mode; arrow keys move focus among slots/deck; Enter drops. Announce via an `aria-live` region.
2. **Live announcements**: "Drew The Star into 3. The root", "Shuffled", "Returned to deck".
3. **Screen-reader table summary**: a visually hidden list of positions and cards in reading order, updated with the state.
4. **Colour contrast audit** of labels over the table background (currently ~4.6:1; keep ≥ 4.5:1) and focus rings on all controls.
5. **Touch target sizes**: all controls ≥ 44×44 CSS px (toolbar buttons are 40px → bump to 44 on coarse pointers).
6. **Reduced motion**: skip the shuffle scatter and flip animation entirely when set (currently near-zero duration).
7. **Zoom/text scaling**: verify layout at 200% browser zoom and large OS fonts; card labels use px today — consider rem with a floor.
8. **Automated checks**: `@axe-core/playwright` in the e2e suite.

Open question: do we want a fully "list mode" (no canvas) alternative for screen-reader users, or is the enhanced canvas enough?
