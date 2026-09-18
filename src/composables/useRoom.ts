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
  peers: Peer[];
  me: Peer | null;
  error: string | null;
  /** locKey → peer holding that card (other peers only). */
  held: Record<string, Peer>;
}

const state = reactive<RoomState>({ status: 'idle', token: null, peers: [], me: null, error: null, held: {} });
const room = shallowRef<Room | null>(null);

let onMessage: ((from: string, msg: Msg, r: Room) => void) | null = null;
let onGuestReady: ((peer: Peer, r: Room) => void) | null = null;
let onLeft: ((reason: string) => void) | null = null;

function reset(status: RoomUiStatus, error: string | null = null) {
  state.status = status;
  state.token = null;
  state.peers = [];
  state.me = null;
  state.error = error;
  state.held = {};
  room.value = null;
}

function handlers() {
  return {
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
      const wasActive = state.status === 'hosting' || state.status === 'joined';
      reset(reason === 'left' ? 'idle' : 'error', reason === 'left' ? null : reason);
      if (wasActive) onLeft?.(reason);
    },
  };
}

export function useRoom() {
  const host = async (name: string) => {
    if (room.value) room.value.leave();
    reset('connecting');
    try {
      const r = await Room.host(name, handlers());
      room.value = r;
      state.status = 'hosting';
      state.token = r.token;
      state.me = r.me;
      state.peers = r.peers;
    } catch (e) {
      reset('error', (e as Error).message || 'unknown');
    }
  };

  const join = async (token: string, name: string) => {
    if (room.value) room.value.leave();
    reset('connecting');
    try {
      const r = await Room.join(token, name, handlers());
      room.value = r;
      state.status = 'joined';
      state.token = r.token;
      state.me = r.me;
      state.peers = r.peers;
    } catch (e) {
      reset('error', (e as Error).message || 'unknown');
    }
  };

  const leave = () => {
    room.value?.leave();
    reset('idle');
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
    dismissError,
    setHandlers,
    heldBy,
  };
}
