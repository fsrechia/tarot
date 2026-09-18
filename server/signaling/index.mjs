#!/usr/bin/env node
/**
 * Tiny WebRTC signaling helper for "Play together".
 *
 * It only maps a short join token to a room and relays opaque SDP / ICE
 * messages between the host and its guests until their peer connection is
 * up. It never sees table data. Everything is in memory; nothing is logged
 * but counts.
 *
 *   node server/signaling/index.mjs            # ws://0.0.0.0:8787
 *   PORT=9000 node server/signaling/index.mjs
 *
 * Protocol (JSON text frames):
 *   → {t:'create'}                        ← {t:'created', token}
 *   → {t:'join', token, name?}            ← {t:'joined', peerId}   host gets {t:'peer-joined', peerId}
 *   → {t:'signal', to, data}              ← {t:'signal', from, data}     (relayed verbatim)
 *   → {t:'leave'}                         ← guests: {t:'closed'} when the host leaves
 *   ← {t:'error', code}   codes: bad-token, room-full, rate-limited, not-in-room, bad-message
 */
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_GUESTS = Number(process.env.MAX_GUESTS || 7);
const TOKEN_TTL_MS = 10 * 60 * 1000; // a room with no guests expires this long after its last activity
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_BYTES = 64 * 1024;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** @type {Map<string, {token:string, host:import('ws').WebSocket, guests:Map<string, import('ws').WebSocket>, createdAt:number, lastActivity:number, nextGuest:number}>} */
const rooms = new Map();
/** @type {Map<string, number[]>} join attempts per IP (timestamps) */
const attempts = new Map();

function makeToken() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let token = '';
  for (const b of bytes) token += ALPHABET[b % ALPHABET.length];
  return rooms.has(token) ? makeToken() : token;
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function rateLimited(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  attempts.set(ip, list);
  return list.length > 20;
}

/** Ends a room. `notifyHost` tells the host too (expiry), not just the guests. */
function closeRoom(room, notifyHost = false) {
  rooms.delete(room.token);
  for (const g of room.guests.values()) {
    send(g, { t: 'closed' });
    g.room = null;
  }
  if (notifyHost) send(room.host, { t: 'closed' });
  room.host.room = null;
}

const wss = new WebSocketServer({ port: PORT, host: HOST, maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || '?';
  ws.room = null;
  ws.peerId = null;
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { t: 'error', code: 'bad-message' });
    }
    if (!msg || typeof msg.t !== 'string') return send(ws, { t: 'error', code: 'bad-message' });

    switch (msg.t) {
      case 'create': {
        if (ws.room) leave(ws);
        const token = makeToken();
        const room = { token, host: ws, guests: new Map(), createdAt: Date.now(), lastActivity: Date.now(), nextGuest: 1 };
        rooms.set(token, room);
        ws.room = room;
        ws.peerId = 'host';
        return send(ws, { t: 'created', token });
      }
      case 'join': {
        if (rateLimited(ip)) return send(ws, { t: 'error', code: 'rate-limited' });
        const token = String(msg.token || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const room = rooms.get(token);
        if (!room || room.host.readyState !== room.host.OPEN) return send(ws, { t: 'error', code: 'bad-token' });
        if (room.guests.size >= MAX_GUESTS) return send(ws, { t: 'error', code: 'room-full' });
        if (ws.room) leave(ws);
        const peerId = `g${room.nextGuest++}`;
        room.guests.set(peerId, ws);
        room.lastActivity = Date.now();
        ws.room = room;
        ws.peerId = peerId;
        send(ws, { t: 'joined', peerId });
        return send(room.host, { t: 'peer-joined', peerId, name: typeof msg.name === 'string' ? msg.name.slice(0, 32) : '' });
      }
      case 'signal': {
        const room = ws.room;
        if (!room) return send(ws, { t: 'error', code: 'not-in-room' });
        const target = msg.to === 'host' ? room.host : room.guests.get(String(msg.to));
        if (!target) return;
        // Guests may only talk to the host.
        if (ws.peerId !== 'host' && msg.to !== 'host') return;
        return send(target, { t: 'signal', from: ws.peerId, data: msg.data });
      }
      case 'leave':
        return leave(ws);
      default:
        return send(ws, { t: 'error', code: 'bad-message' });
    }
  });

  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  if (ws.peerId === 'host') {
    closeRoom(room);
  } else {
    room.guests.delete(ws.peerId);
    room.lastActivity = Date.now();
    send(room.host, { t: 'peer-left', peerId: ws.peerId });
    ws.room = null;
  }
}

// Heartbeat + expiry sweep
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const room of rooms.values()) {
    // Idle means nobody has been connected for a while, measured from the last
    // join or leave, so a room whose guests all left is not closed under a host
    // who is still waiting with the code on screen.
    const idle = room.guests.size === 0 && now - room.lastActivity > TOKEN_TTL_MS;
    const old = now - room.createdAt > ROOM_TTL_MS;
    if (idle || old) closeRoom(room, true);
  }
  // Forget rate-limit windows that have fully elapsed so the map cannot grow forever.
  for (const [ip, list] of attempts) {
    if (list.every((t) => now - t >= 60_000)) attempts.delete(ip);
  }
}, 30_000).unref();

console.log(`signaling helper listening on ws://${HOST}:${PORT} (rooms: ${rooms.size})`);
