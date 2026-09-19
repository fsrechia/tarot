# Plan: multiplayer table with a join token

Status: **implemented (v1)** — see *Decisions taken* at the end. Maintainer's brief: a player starts a session and gets a short token (≈6 characters). Others enter the token and connect **peer to peer**, initially perhaps only on the LAN, and everyone interacts with the same board. Question: is this feasible without a central server, and if not, what is the smallest, most secure helper?

## Short answer on feasibility

- **Fully serverless P2P between browsers is not possible in general.** Browsers can only open peer connections through **WebRTC**, and WebRTC needs a *signaling* step: the two peers must exchange an SDP offer/answer and ICE candidates through some out-of-band channel before the direct connection exists. Browsers cannot listen on sockets, so a plain "WebSocket to the other player's IPv6 address" is not available — a browser can only *connect* to a WebSocket **server**.
- **What works without any server we run:**
  - **Manual signaling**: player A copies a long blob (offer) to player B (chat / QR), B pastes and sends back the answer. Works even on LAN with zero infrastructure, but the "blob" is ~1–2 KB, not a 6-character token, and it takes two round trips. Good as a fallback / demo, poor UX.
  - **Public signaling relays** (e.g. PeerJS's free cloud server, public `y-webrtc` signaling servers, Nostr relays, Trystero's BitTorrent-tracker/IPFS/MQTT signaling tricks). No server of ours, but reliance on third parties for availability and privacy of the handshake.
- **LAN-only without a server** is *harder*, not easier: browsers cannot do mDNS/discovery, and modern browsers hide local IPs behind mDNS ICE candidates. Two phones on the same Wi-Fi still need signaling; once signaled, WebRTC will connect directly over the LAN (host candidates) without STUN/TURN — that is the part that is free.
- **Recommended**: a **tiny signaling helper** we own. It only relays the handshake and maps tokens to rooms; it never sees game data after the connection is up. It fits in a Cloudflare Worker with Durable Objects, a Deno Deploy script, or a 100-line Node WebSocket server. Cost ≈ $0–5/month. For peers behind symmetric NATs a **TURN** relay is needed for the media path (WebRTC over TURN); that is the only component that touches game traffic and can be a metered public service (Cloudflare Calls TURN, Twilio, coturn on a $5 VPS).

So: yes, feasible; not *zero*-server for a nice token UX; the helper can be very small and "super secure" by design because it only stores `{token → offer/answer/candidates}` for a few minutes.

## Transport options compared

| Option | Needs our server? | Works on internet? | Works on LAN? | UX | Notes |
| --- | --- | --- | --- | --- | --- |
| WebRTC DataChannel + our signaling helper | tiny (signaling) + optional TURN | yes | yes | 6-char token | Recommended |
| WebRTC + manual copy/paste signaling | no | yes | yes | paste a blob / scan QR | Fallback, offline-friendly |
| WebRTC + public relays (Trystero / PeerJS cloud) | no | yes | yes | token | Third-party dependency |
| WebSocket **server-authoritative** room | full server | yes | yes | token | Simplest to reason about; all traffic through server; not P2P |
| Local-only: Web Share / QR of the state (turn-based) | no | yes | yes | share a link each turn | Not real-time; but cheap "async multiplayer" |
| Bluetooth / Wi-Fi Direct | — | — | — | — | Not available to web apps |

## Recommended design

### Session model

- **Host** creates a room: the helper returns a **token** (6 chars from an unambiguous alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, ~1e9 combinations, rate-limited lookups, expires after 10 minutes if no peer joins, room lifetime ≤ 24 h). The token is shown big, as a QR code, and as a link `https://app/#join=TOKEN`.
- **Guests** enter the token or open the link → helper brokers WebRTC signaling → DataChannel opens → host sends a full `TableState` snapshot.
- Topology: **star around the host** (each guest has one DataChannel to the host). Host is the **authority**: it applies operations and broadcasts the resulting state or the accepted op. Simple, deterministic, and our engine is already pure `TableState → TableState`.
- If the host disconnects: guests keep their last state and can "become host" (new token) — v2.

### Protocol (over the DataChannel, JSON, versioned)

```ts
type Msg =
  | { t: 'hello'; v: 1; name: string; color: string }
  | { t: 'snapshot'; state: TableState; seq: number }
  | { t: 'op'; op: Op; seq: number; by: string }        // guest → host proposal / host → all accepted
  | { t: 'cursor'; x: number; y: number }                // card-unit coords, throttled
  | { t: 'drag'; loc: Location | null }                  // who is holding what (ghost for others)
  | { t: 'chat'; text: string }
  | { t: 'bye' };

type Op =
  | { k: 'move'; from: Location; to: DropTarget }
  | { k: 'flip'; loc: Location }
  | { k: 'draw'; index?: number; fallback: {x:number;y:number} }
  | { k: 'shuffle'; seed: number }                       // seeded RNG so everyone gets the same order
  | { k: 'deal' } | { k: 'reveal' } | { k: 'gather' } | { k: 'newReading'; spreadId: string; seed: number };
```

The engine already exposes exactly these operations; `shuffle` gains a seed (`seededRng`) so the host can broadcast the seed instead of the order. Guests apply ops optimistically and reconcile on the host's `seq`.

### Rules for shared play (game-level)

- Who may flip a card? Options: anyone; only the drawer; only the reader (host). Make it a room setting.
- Private hands (for future card *games*) require per-player visibility: the engine gets an `owner`/`visibility` field on `TableCard` (v2; tarot doesn't need it).
- Presence: colored cursors and names; "X is holding The Star" ghost.

### Signaling helper (the only server)

- WebSocket (or HTTP long-poll) endpoints: `create → token`, `join(token)`, `signal(token, to, payload)`.
- Stores nothing but in-memory `{token, hostSocket, guestSockets, createdAt}`; payloads are opaque SDP/ICE; TLS only; rate limits; no accounts; no logs of payloads.
- ICE servers: public STUN (Google's) for NAT discovery; TURN only if needed (config-driven).
- Deployment: Cloudflare Worker + Durable Object (rooms) — free tier suffices for hobby use; or `deno deploy`. Keep it in `server/signaling/` in this repo with its own tests.

### LAN-first mode

Same code. On the same Wi-Fi, ICE finds host candidates and connects directly; the helper is used only for the 2–3 signaling messages. If the helper is unreachable (no internet), fall back to **manual signaling**: the host shows a QR with the offer, the guest scans it (camera via `BarcodeDetector` or a JS QR decoder) and shows the answer QR back. Two scans, fully offline. This satisfies the "initially LAN only" requirement without any server at all.

### Client integration

- `src/net/room.ts`: room lifecycle, WebRTC setup, reconnect, message (de)serialization.
- `useTable` gets a `dispatch(op)` path: local single-player → apply directly; in a room → send to host / apply if host.
- UI: "Play together" in the menu → host/join screen → token + QR → participant list; a small banner shows connection state.
- Guests do not autosave the shared table to their own `tarot.table.v1` (or do, tagged as shared) — decide.

## Security & privacy notes

- Token entropy ~ 30 bits; combined with rate limiting and 10-minute expiry, brute force is impractical. Optionally require the host to accept each guest.
- DataChannels are DTLS-encrypted end-to-end; the helper never sees game traffic. TURN relays see encrypted packets only.
- No accounts. Names are ephemeral. Nothing persists on the server.

## Effort

- Helper + WebRTC star + snapshot/op protocol + basic UI: ~1–2 weeks.
- Manual QR signaling fallback: +2–3 days.
- Host migration, private hands: later.

## Open questions for the maintainer (not assumed)

1. Is running a tiny signaling helper acceptable (a Cloudflare Worker on the free tier, or a $5 VPS), or must v1 be strictly serverless (manual/QR signaling only)?
2. Internet play or LAN only for v1? (LAN-only still needs signaling or QR exchange.)
3. Who is the authority: host device (recommended) or a full server (simpler consistency, more cost)?
4. Room permissions: can guests flip/move any card, or only the host reads and guests observe/draw?
5. Maximum players per room (star topology is fine up to ~8)?
6. Should guests see the host's deck artwork if they don't have it (custom ZIP decks)? Options: send card images over the DataChannel (a few MB), or show the standard deck.
7. Identity: nickname only, or persistent per-device identity for reconnects?
8. Should a room outlive the host (host migration) in v1?
9. Is TURN needed at launch (adds cost and a component that relays traffic) or is "may fail behind strict NATs" acceptable initially?
10. Which reuse: hand-rolled WebRTC (~300 lines, no deps) vs a library (`trystero` for zero-server signaling experiments, `peerjs` for simplicity, `y-webrtc` + Yjs if we want CRDT state merging instead of host authority)?
11. Chat and voice: text chat in scope? Voice is a separate feature (WebRTC audio track, permissions).
12. Do we want spectators (read-only links) for sharing a live reading?


---

## Decisions taken in v1 (implemented without maintainer input — revert or change at will)

| Question | Decision | Rationale |
| --- | --- | --- |
| 1. Server? | **Yes, a tiny signaling helper** (`server/signaling/index.mjs`, Node + `ws`, ~150 lines, in-memory, no persistence). Manual/QR signaling *not* built. | A 6-character token is impossible without *some* rendezvous; the helper never sees table data. It runs on any Node host (or locally on the LAN with `npm run signaling`). |
| 2. Internet or LAN? | Both. STUN (Google public) for NAT traversal, **no TURN**. | Works on the same Wi-Fi with zero extra infra; works over the internet for most home NATs; strict symmetric NATs fail with a clear error and the hint "try the same Wi-Fi". |
| 3. Authority | **Host device** applies every op with the pure engine and broadcasts the full `TableState` snapshot (≈2 KB) after each op. No CRDT, no optimistic guest updates. | Simplest correct model; the engine is already pure; LAN/WebRTC latency is a few ms. |
| 4. Permissions | Everyone equal: move, flip, draw, shuffle, deal, reveal, gather, new reading, spread change. Deck artwork stays a local choice. | Tarot readings are collaborative; no "reader only" mode yet (easy to add as a host setting). |
| 5. Max players | Host + 7 guests (`MAX_GUESTS`). | Star topology; well within DataChannel limits. |
| 6. Custom deck artwork | Not transferred. Guests see the cards with their own selected deck. | Card ids are shared, art is local; sending MBs of blobs is a later feature. |
| 7. Identity | Nickname only (saved in settings); server-assigned peer id; colour derived from the id. | No accounts. |
| 8. Host leaves | Room closes; guests get "The host closed the room" and their own table back. No host migration. | v1 simplicity. |
| Helper goes away | The table keeps running on the DataChannels. The host retries the helper (5 attempts, growing delays) and takes a **new code**; with guests connected the room survives even if the helper never returns (code unavailable, *Get a new code* button); alone, it closes. Guests ignore the helper's `closed` while their channel to the host is open. | The helper only brokers new joiners; a restart or a blip on the host's socket must not end a reading. |
| 9. TURN | Not at launch. | Cost and a traffic-relaying component; revisit if users report failures. |
| 10. Library | **Hand-rolled WebRTC** (`src/net/room.ts`, ~300 lines, no dependency). | Full control, tiny, testable in Playwright with loopback ICE. |
| 11. Chat / voice | Not built. | Out of scope for v1. |
| 12. Spectators | Not built (every joiner is a full player). | Add a read-only flag later. |
| Undo in a room | Disabled (history is local; ops are authoritative). | Avoids divergent histories. |
| Guest's own table | Stashed on join (autosave paused) and restored on leave. | Joining a friend's reading must not destroy yours. |
| Presence | "Holding" indicators: a pulsing outline in the peer's colour on the card another player is dragging. No cursors. | Cheap and useful; cursors are noisy on phones. |
| Shuffle | Any peer may shuffle; the host applies it with a seed and broadcasts an `effect` so everyone sees the scatter animation. | Deterministic (`seededRng`), fun. |
| Token | 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; case-insensitive on entry; a room with no guests expires 10 minutes after its last join/leave (the host is told); room max 24 h. Rate limit 20 joins/min/IP. | ~10⁹ combinations; brute force impractical with the limits. |
| Join link | `https://host/#join=TOKEN` opens the panel with the token pre-filled; "Copy link" and Web Share on mobile. | One tap for the guest. |
| Signaling URL | `PUBLIC_SIGNALING_URL` at build time; default `ws(s)://<page host>:8787`. | Opening the app from a LAN IP finds the helper on the same machine. |

### How to run

```sh
npm run dev:all         # astro dev + signaling on :8787
npm run signaling       # helper only (PORT=…, HOST=…, MAX_GUESTS=…)
npm run test:e2e        # includes tests/e2e/multiplayer.spec.ts (two contexts, real DataChannel)
```

Deploying: run the helper behind TLS (`wss://`) on any Node host (Fly.io, Railway, a VPS) and build with `PUBLIC_SIGNALING_URL=wss://…`. A Cloudflare Worker port is straightforward (Durable Object per room) but was not written.

### Known gaps
- No automatic rejoin: a dropped DataChannel ends the session for that guest; the panel pre-fills the last code so rejoining is one tap. A `disconnected` connection gets 8 seconds to recover before it counts as dropped.
- After the host recovers a new code, guests already at the table are not registered with the helper any more, so the helper's per-room guest cap only counts newcomers.
- Guests behind symmetric NATs need TURN to reach a remote host.
- The host's `allowReversed` setting is what applies to everyone's flips.
- Guests see the host's chosen spread but keep their own deck artwork; a snapshot whose spread the guest's build does not know is ignored.
- The helper trusts `X-Forwarded-For` for rate limiting: deploy it behind a proxy that sets it.
- Playwright runs the multiplayer test on Chromium only (the other projects skip it).
