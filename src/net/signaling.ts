/** WebSocket client for the signaling helper (see server/signaling/index.mjs). */

export type SignalingEvent =
  | { t: 'created'; token: string }
  | { t: 'joined'; peerId: string }
  | { t: 'peer-joined'; peerId: string; name: string }
  | { t: 'peer-left'; peerId: string }
  | { t: 'signal'; from: string; data: unknown }
  | { t: 'closed' }
  | { t: 'error'; code: string };

export function defaultSignalingUrl(): string {
  const env = (import.meta.env.PUBLIC_SIGNALING_URL as string | undefined)?.trim();
  if (env) return env;
  if (typeof location === 'undefined') return 'ws://localhost:8787';
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:8787`;
}

export class SignalingClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<(e: SignalingEvent) => void>();
  onClose: (() => void) | null = null;

  constructor(private url: string = defaultSignalingUrl()) {}

  connect(timeoutMs = 8000): Promise<void> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch (e) {
        return reject(e);
      }
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('signaling-timeout'));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        this.ws = ws;
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('signaling-unreachable'));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as SignalingEvent;
          for (const l of this.listeners) l(msg);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        this.ws = null;
        // A pending request() must not sit until its timeout when the socket is gone.
        for (const l of this.listeners) l({ t: 'error', code: 'signaling-lost' });
        this.onClose?.();
      };
    });
  }

  on(listener: (e: SignalingEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Sends and waits for the first event matching `t` (or an error). */
  request<T extends SignalingEvent['t']>(msg: object, t: T, timeoutMs = 8000): Promise<Extract<SignalingEvent, { t: T }>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error('signaling-timeout'));
      }, timeoutMs);
      const off = this.on((e) => {
        if (e.t === t) {
          clearTimeout(timer);
          off();
          resolve(e as Extract<SignalingEvent, { t: T }>);
        } else if (e.t === 'error') {
          clearTimeout(timer);
          off();
          reject(new Error(e.code));
        }
      });
      this.send(msg);
    });
  }

  close(): void {
    this.onClose = null;
    this.ws?.close();
    this.ws = null;
  }
}
