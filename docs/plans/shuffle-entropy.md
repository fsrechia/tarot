# Plan: shuffle entropy ("as random as a real shuffle")

Status: baseline shipped (CSPRNG); optional "physical" entropy sources planned.

## What we have
`src/engine/shuffle.ts` runs Fisher–Yates over `crypto.getRandomValues`. That is the browser's cryptographically secure generator, seeded by the OS from hardware events, interrupt timing and CPU instructions such as RDRAND. It is *unpredictable* and *unbiased* — strictly more random than any physical shuffle: seven riffle shuffles are needed before a 52-card deck is close to uniform, and most human shuffles are far from that. Fisher–Yates with a good source gives every one of the 22! orderings exactly equal probability. Also: reversed orientation is decided per card with the same source.

So the question is not entropy quality but **feel and meaning**: readers want the shuffle to be *theirs*. Options below add user-derived or physical entropy on top of the CSPRNG, never instead of it (mixing can only add uncertainty when done with a hash).

## Sources of "true"/physical entropy usable from a browser

| Source | How | Notes |
| --- | --- | --- |
| **The user's gestures** | Timings (µs) and coordinates of pointer moves while "shuffling" (rubbing the deck, swiping, dragging), fanning, cutting, and *which* card they pull from the fan | Already the most "personal" input; free; works offline. Human timing jitter carries several bits per event. |
| **Motion sensors** | `DeviceMotionEvent` (accelerometer/gyro) during a "shake to shuffle" gesture; iOS needs `DeviceMotionEvent.requestPermission()` on a user gesture | Great ritual; physical; offline. Low-order bits of acceleration are noise. |
| **Microphone / camera noise** | `getUserMedia` → sample the least significant bits | Real physical noise but heavy permission friction; not recommended. |
| **Hardware RNG in the OS** | Already what `crypto.getRandomValues` draws from | Baseline. |
| **Remote true-random services** | random.org (atmospheric noise; JSON-RPC API, free quota with a key), ANU QRNG (quantum vacuum fluctuations; API), NIST Randomness Beacon (public, *not secret* — fine for fairness proofs, not for secrecy) | Needs network; adds latency; a third party sees a request (not the result's meaning). Nice as an opt-in "quantum shuffle". |
| **Bluetooth/USB TRNG devices** | Web Bluetooth / WebUSB | Hobbyist only. |

## Recommended design: "ritual shuffle"

1. Start with 32 bytes from `crypto.getRandomValues`.
2. While the user shuffles (rubs/shakes/cuts/drags), append a stream of `(timestamp, x, y, dx, dy, accel…)` samples to an entropy buffer.
3. Seed = `SHA-256(csprng || samples)` (Web Crypto `subtle.digest`); expand with a small PRNG (`seededRng`, already present) to drive Fisher–Yates and orientations.
4. Optional opt-in: fetch 32 bytes from random.org or ANU and mix them in too; show a small "quantum" badge on the reading. Time-out silently to local entropy when offline.
5. Show the user *that* their shuffle mattered: a tiny "entropy meter" filling as they shuffle, and the seed's short hash in the journal (readings become reproducible: same seed → same order, useful for sharing and multiplayer, where the host broadcasts the seed).

Manual physical acts the UI can offer, each contributing to the buffer: **shake** the phone, **rub** the deck with a finger, **cut** (tap a point in the fan), **riffle** (drag two halves together), **pick** cards one by one from the fan (already possible).

## Open questions
- Is a "shake to shuffle" gesture desirable on phones (needs the iOS permission prompt)?
- Should the remote "quantum/atmospheric" option exist at all (network dependency and a third-party call)?
- Show the seed/hash to users (transparency, reproducibility) or keep it hidden (mystique)?
