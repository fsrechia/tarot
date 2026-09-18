# Plan: PWA and offline polish

Status: shipped — manifest, icons, service worker precaching the app shell and all deck images (~9.5 MB), `autoUpdate`.

## Next
1. **Update toast**: with `registerType: 'prompt'`, show "New version available — reload" instead of silently updating mid-reading.
2. **Install hint**: capture `beforeinstallprompt` (Android/desktop) and show an "Add to home screen" card in Help; on iOS show the Share → Add to Home Screen instructions.
3. **Smarter caching**: precache only the app shell + backs + the default deck; runtime `CacheFirst` for other decks with a cap (e.g. 200 entries). Add a "Download deck for offline" toggle per deck.
4. **Offline indicator** and graceful failure for online-only features (AI, multiplayer).
5. **Storage persistence**: request `navigator.storage.persist()` after the first journal save so the browser does not evict IndexedDB.
6. **iOS specifics**: verify the standalone status bar and the `100dvh` behaviour in standalone mode; `apple-touch-startup-image` optional.

Open question: acceptable first-load size? (Today ≈ 10 MB for full offline; a shell-only strategy is ≈ 400 KB.)
