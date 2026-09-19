/**
 * Reactive wrapper around `Room`: status, token, peers and who is holding
 * which card. The orchestrator plugs in the message handler.
 */
import { computed, reactive, readonly, shallowRef } from 'vue';
import { Room } from '../net/room';
import { locKey, type Msg, type Peer } from '../net/protocol';
import type { Location } from '../engine/types';

export type RoomUiStatus = 'idle' | 'connecting' | 'hosting' | 'joined' | 'error';

interface RoomState {
  status: RoomUiStatus;
  token: string | null;
  /** The last code we hosted or joined with, so a dropped guest can rejoin in one tap. */
  lastToken: string | null;
  peers: Peer[];
  me: Peer | null;
  error: string | null;
  /** locKey → peer holding that card (other peers only). */
  held: Record<string, Peer>;
}

const state = reactive<RoomState>({ status: 'idle', token: null, lastToken: null, peers: [], me: null, error: null, held: {} });
const room = shallowRef<Room | null>(null);
/** Bumped on every host/join/leave so a cancelled attempt cannot land later. */
let attempt = 0;

let onMessage: ((from: string, msg: Msg, r: Room) => void) | null = null;
let onGuestReady: ((peer: Peer, r: Room) => void) | null = null;
let onLeft: ((reason: string, wasHost: boolean) => void) | null = null;

function reset(status: RoomUiStatus, error: string | null = null) {
  state.status = status;
  state.token = null;
  state.peers = [];
  state.me = null;
  state.error = error;
  state.held = {};
  room.value = null;
}

function handlers(id: number) {
  return {
    onToken: (token: string | null) => {
      if (id !== attempt) return;
      state.token = token;
      if (token) state.lastToken = token;
    },
    onMessage: (from: string, msg: Msg) => {
      if (msg.t === 'held') {
        const peer = state.peers.find((p) => p.id === msg.peerId);
        const next = { ...state.held };
        for (const k of Object.keys(next)) if (next[k]!.id === msg.peerId) delete next[k];
        if (msg.loc && peer) next[locKey(msg.loc)] = peer;
        state.held = next;
        return;
      }
      if (room.value) onMessage?.(from, msg, room.value);
    },
    onPeers: (peers: Peer[]) => {
      state.peers = peers;
    },
    onGuestReady: (peer: Peer) => {
      if (room.value) onGuestReady?.(peer, room.value);
    },
    onClosed: (reason: string) => {
      if (id !== attempt) return; // a room from a cancelled attempt
      const wasActive = state.status === 'hosting' || state.status === 'joined';
      const wasHost = state.status === 'hosting';
      reset(reason === 'left' ? 'idle' : 'error', reason === 'left' ? null : reason);
      if (wasActive) onLeft?.(reason, wasHost);
    },
  };
}

/** Shared by host() and join(): runs the attempt unless it was cancelled meanwhile. */
async function connect(status: 'hosting' | 'joined', open: (id: number) => Promise<Room>) {
  if (room.value) room.value.leave();
  const id = ++attempt;
  reset('connecting');
  try {
    const r = await open(id);
    if (id !== attempt) {
      r.leave(); // the user cancelled (or started another attempt) while this one was connecting
      return;
    }
    room.value = r;
    state.status = status;
    state.token = r.token;
    if (r.token) state.lastToken = r.token;
    state.me = r.me;
    state.peers = r.peers;
  } catch (e) {
    if (id === attempt) reset('error', (e as Error).message || 'unknown');
  }
}

export function useRoom() {
  const host = (name: string) => connect('hosting', (id) => Room.host(name, handlers(id)));

  const join = (token: string, name: string) => connect('joined', (id) => Room.join(token, name, handlers(id)));

  /** Leaves the room, or cancels an attempt that is still connecting. */
  const leave = () => {
    room.value?.leave(); // its onClosed resets the state and tells the table
    attempt++;
    if (state.status !== 'idle' && state.status !== 'error') reset('idle');
  };

  /** Host: ask the helper for a fresh code (after it was lost). */
  const renewToken = async () => {
    const r = room.value;
    if (!r || state.status !== 'hosting') return false;
    return r.renewToken();
  };

  const dismissError = () => {
    if (state.status === 'error') reset('idle');
  };

  const setHandlers = (h: {
    onMessage: typeof onMessage;
    onGuestReady: typeof onGuestReady;
    onLeft: typeof onLeft;
  }) => {
    onMessage = h.onMessage;
    onGuestReady = h.onGuestReady;
    onLeft = h.onLeft;
  };

  const heldBy = (loc: Location): Peer | undefined => state.held[locKey(loc)];

  return {
    state: readonly(state),
    room,
    inRoom: computed(() => state.status === 'hosting' || state.status === 'joined'),
    isHost: computed(() => state.status === 'hosting'),
    host,
    join,
    leave,
    renewToken,
    dismissError,
    setHandlers,
    heldBy,
  };
}
