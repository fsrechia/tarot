# Plan: daily card

Status: planned (small).

## Goal
A one-card draw per day with its meaning, remembered so it does not change on reload; optional local reminder.

## Design
- Seed the RNG with the date (and a per-device salt) so the "card of the day" is stable for the day: `seededRng(hash(salt + YYYY-MM-DD))`.
- Menu → **Daily card** opens a sheet: the card (flip animation), name, keywords, meaning; "Put it on the table"; "Save to journal".
- Reminder: Notification API + service worker `showNotification`; scheduled by a `setTimeout` while the app is open or by the periodic background sync where supported (Chrome/Android only). iOS supports web push for installed PWAs since 16.4 — requires a push server, so v1 is local only.
- Streaks stored in settings (`dailyStreak`, `lastDaily`).

## Open questions
- Reversed allowed for the daily card?
- Is a push server (for iOS reminders) acceptable, or local-only reminders?
