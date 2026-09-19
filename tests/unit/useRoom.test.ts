import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * useRoom's attempt bookkeeping: cancelling while connecting must win over a
 * join that completes later, and a room from a cancelled attempt is left.
 */
type Handlers = { onClosed: (reason: string) => void; onToken?: (t: string | null) => void };
let pendingJoin: { resolve: (r: unknown) => void; reject: (e: Error) => void; handlers: Handlers } | null = null;
const leave = vi.fn();

vi.mock('../../src/net/room', () => ({
  Room: {
    join: (token: string, name: string, handlers: Handlers) =>
      new Promise((resolve, reject) => {
        pendingJoin = { resolve, reject, handlers };
      }),
    host: vi.fn(),
  },
}));

const { useRoom } = await import('../../src/composables/useRoom');

const fakeRoom = (token: string) => ({
  token,
  me: { id: 'g1', name: 'Bea', color: '#6fc2e0' },
  peers: [],
  isHost: false,
  leave,
});

describe('useRoom', () => {
  beforeEach(() => {
    pendingJoin = null;
    leave.mockClear();
    useRoom().leave();
  });

  it('a join that completes after Cancel is left, and the state stays idle', async () => {
    const api = useRoom();
    const p = api.join('ABC234', 'Bea');
    expect(api.state.status).toBe('connecting');
    api.leave(); // cancel
    expect(api.state.status).toBe('idle');
    pendingJoin!.resolve(fakeRoom('ABC234'));
    await p;
    expect(leave).toHaveBeenCalledTimes(1);
    expect(api.state.status).toBe('idle');
    expect(api.inRoom.value).toBe(false);
  });

  it('a join that fails after Cancel does not surface an error', async () => {
    const api = useRoom();
    const p = api.join('ABC234', 'Bea');
    api.leave();
    pendingJoin!.reject(new Error('bad-token'));
    await p;
    expect(api.state.status).toBe('idle');
    expect(api.state.error).toBeNull();
  });

  it('a successful join records the token for a later rejoin, and a lost host reports an error', async () => {
    const api = useRoom();
    const p = api.join('abc234', 'Bea');
    const { handlers } = pendingJoin!;
    pendingJoin!.resolve(fakeRoom('ABC234'));
    await p;
    expect(api.state.status).toBe('joined');
    expect(api.state.lastToken).toBe('ABC234');
    handlers.onClosed('host-unreachable');
    expect(api.state.status).toBe('error');
    expect(api.state.error).toBe('host-unreachable');
    expect(api.state.lastToken).toBe('ABC234');
    api.dismissError();
    expect(api.state.status).toBe('idle');
  });
});
