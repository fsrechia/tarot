/**
 * A shared table room: WebRTC DataChannels in a star around the host.
 *
 * The signaling helper is used only to exchange SDP/ICE. Once a DataChannel is
 * open, all table traffic goes peer to peer (DTLS-encrypted). On the same LAN
 * ICE connects directly; across the internet STUN is used for NAT discovery
 * (no TURN relay in v1, so strict symmetric NATs may fail to connect).
 */
import { SignalingClient, type SignalingEvent } from './signaling';
import { colorFor, isValidMsg, PROTOCOL_VERSION, type Msg, type Peer } from './protocol';

export type RoomStatus = 'connecting' | 'open' | 'closed';

export interface RoomHandlers {
  /** A message from a peer (`from` is 'host' for guests). */
  onMessage: (from: string, msg: Msg) => void;
  onPeers: (peers: Peer[]) => void;
  /** A guest's channel is open and it said hello (host only). */
  onGuestReady?: (peer: Peer) => void;
  onClosed: (reason: string) => void;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const CONNECT_TIMEOUT_MS = 20_000;
/** How long a `disconnected` connection may try to recover before it is dropped. */
const DISCONNECT_GRACE_MS = 8_000;

interface Link {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  peer: Peer | null;
  pendingIce: RTCIceCandidateInit[];
  graceTimer: ReturnType<typeof setTimeout> | null;
}

export class Room {
  readonly isHost: boolean;
  readonly token: string;
  readonly me: Peer;
  status: RoomStatus = 'connecting';
  private links = new Map<string, Link>();
  /** Guest side: the peer list as last announced by the host. */
  private remotePeers: Peer[] | null = null;
  private handlers: RoomHandlers;
  private signaling: SignalingClient;
  private offSignaling: () => void;

  private constructor(isHost: boolean, token: string, me: Peer, signaling: SignalingClient, handlers: RoomHandlers) {
    this.isHost = isHost;
    this.token = token;
    this.me = me;
    this.signaling = signaling;
    this.handlers = handlers;
    this.offSignaling = signaling.on((e) => this.onSignaling(e));
    signaling.onClose = () => {
      // Guests keep playing over the DataChannel; the host needs signaling for new joiners.
      if (this.isHost && this.status !== 'closed') this.close('signaling-lost');
    };
  }

  /** Creates a room and returns once the token is known. */
  static async host(name: string, handlers: RoomHandlers, signalingUrl?: string): Promise<Room> {
    const signaling = new SignalingClient(signalingUrl);
    await signaling.connect();
    const created = await signaling.request({ t: 'create' }, 'created');
    const room = new Room(true, created.token, { id: 'host', name, color: colorFor('host') }, signaling, handlers);
    room.status = 'open';
    return room;
  }

  /** Joins a room and resolves when the DataChannel to the host is open and welcomed. */
  static async join(token: string, name: string, handlers: RoomHandlers, signalingUrl?: string): Promise<Room> {
    const signaling = new SignalingClient(signalingUrl);
    await signaling.connect();
    const joined = await signaling.request({ t: 'join', token, name }, 'joined');
    const me: Peer = { id: joined.peerId, name, color: colorFor(joined.peerId) };
    const room = new Room(false, token.toUpperCase(), me, signaling, handlers);
    try {
      await room.waitForHostChannel();
    } catch (e) {
      // Otherwise the signaling socket and the peer connection would outlive
      // the failed attempt and the host would keep a ghost guest.
      room.close((e as Error).message || 'connect-timeout');
      throw e;
    }
    return room;
  }

  get peers(): Peer[] {
    if (!this.isHost) return this.remotePeers ?? [this.me];
    return [this.me, ...Array.from(this.links.values()).map((l) => l.peer).filter((p): p is Peer => !!p)];
  }

  /** Sends to one peer (guests always send to 'host'). */
  send(msg: Msg, to: string = 'host'): void {
    const link = this.links.get(to);
    if (link?.channel?.readyState === 'open') link.channel.send(JSON.stringify(msg));
  }

  /** Sends to every connected peer except `except`. */
  broadcast(msg: Msg, except?: string): void {
    const data = JSON.stringify(msg);
    for (const [id, link] of this.links) {
      if (id !== except && link.channel?.readyState === 'open') link.channel.send(data);
    }
  }

  leave(): void {
    this.broadcast({ t: 'bye' });
    this.close('left');
  }

  private close(reason: string): void {
    if (this.status === 'closed') return;
    this.status = 'closed';
    for (const link of this.links.values()) {
      if (link.graceTimer) clearTimeout(link.graceTimer);
      try {
        link.channel?.close();
        link.pc.close();
      } catch {
        /* ignore */
      }
    }
    this.links.clear();
    this.offSignaling();
    this.signaling.send({ t: 'leave' });
    this.signaling.close();
    this.handlers.onClosed(reason);
  }

  // ---------------------------------------------------------------------------
  // Signaling
  // ---------------------------------------------------------------------------
  private onSignaling(e: SignalingEvent): void {
    switch (e.t) {
      case 'peer-joined':
        if (this.isHost) void this.offerTo(e.peerId, e.name);
        break;
      case 'peer-left':
        // Once the DataChannel is open the helper is out of the loop for this
        // guest; only a guest that never connected is dropped here.
        if (this.links.get(e.peerId)?.channel?.readyState !== 'open') this.dropLink(e.peerId);
        break;
      case 'signal':
        void this.onSignal(e.from, e.data as { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit | null }).catch(() => {
          if (this.isHost) this.dropLink(e.from);
          else this.close('host-unreachable');
        });
        break;
      case 'closed':
        // The helper closed the room: the host left (guests) or it expired (host).
        this.close(this.isHost ? 'room-expired' : 'host-left');
        break;
      case 'error':
        break;
    }
  }

  private newLink(peerId: string): Link {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const link: Link = { pc, channel: null, peer: null, pendingIce: [], graceTimer: null };
    this.links.set(peerId, link);
    pc.onicecandidate = (ev) => {
      this.signaling.send({ t: 'signal', to: peerId, data: { candidate: ev.candidate ? ev.candidate.toJSON() : null } });
    };
    const lost = () => {
      if (this.isHost) this.dropLink(peerId);
      else this.close('host-unreachable');
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (link.graceTimer && st !== 'disconnected') {
        clearTimeout(link.graceTimer);
        link.graceTimer = null;
      }
      if (st === 'failed' || st === 'closed') lost();
      else if (st === 'disconnected' && !link.graceTimer) {
        // A phone switching networks goes through `disconnected` and often
        // recovers; give ICE a moment before ending the session.
        link.graceTimer = setTimeout(() => {
          link.graceTimer = null;
          if (this.links.get(peerId) === link && pc.connectionState === 'disconnected') lost();
        }, DISCONNECT_GRACE_MS);
      }
    };
    setTimeout(() => {
      if (this.links.get(peerId) === link && link.channel?.readyState !== 'open') {
        if (this.isHost) this.dropLink(peerId);
        else this.close('connect-timeout');
      }
    }, CONNECT_TIMEOUT_MS);
    return link;
  }

  private attachChannel(peerId: string, link: Link, channel: RTCDataChannel): void {
    link.channel = channel;
    channel.onmessage = (ev) => this.onChannelMessage(peerId, link, String(ev.data));
    channel.onclose = () => {
      if (this.isHost) this.dropLink(peerId);
      else this.close('host-left');
    };
    channel.onopen = () => {
      if (!this.isHost) this.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.me.name });
    };
  }

  /** Host side: create the connection + channel and send an offer. */
  private async offerTo(peerId: string, name: string): Promise<void> {
    const link = this.newLink(peerId);
    link.peer = { id: peerId, name: name || peerId, color: colorFor(peerId) };
    const channel = link.pc.createDataChannel('table', { ordered: true });
    this.attachChannel(peerId, link, channel);
    const offer = await link.pc.createOffer();
    await link.pc.setLocalDescription(offer);
    this.signaling.send({ t: 'signal', to: peerId, data: { sdp: offer } });
  }

  private async onSignal(from: string, data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit | null }): Promise<void> {
    let link = this.links.get(from);
    if (!link) {
      if (this.isHost) return; // unknown guest
      link = this.newLink(from);
      link.pc.ondatachannel = (ev) => this.attachChannel(from, link!, ev.channel);
    }
    if (data.sdp) {
      await link.pc.setRemoteDescription(data.sdp);
      for (const c of link.pendingIce) await link.pc.addIceCandidate(c).catch(() => {});
      link.pendingIce = [];
      if (data.sdp.type === 'offer') {
        const answer = await link.pc.createAnswer();
        await link.pc.setLocalDescription(answer);
        this.signaling.send({ t: 'signal', to: from, data: { sdp: answer } });
      }
    } else if (data.candidate !== undefined) {
      const c = data.candidate ?? undefined;
      if (link.pc.remoteDescription) await link.pc.addIceCandidate(c).catch(() => {});
      else if (c) link.pendingIce.push(c);
    }
  }

  private waitForHostChannel(): Promise<void> {
    return new Promise((resolve, reject) => {
      const original = this.handlers;
      const timer = setTimeout(() => reject(new Error('connect-timeout')), CONNECT_TIMEOUT_MS);
      this.handlers = {
        ...original,
        onMessage: (from, msg) => {
          if (msg.t === 'welcome') {
            clearTimeout(timer);
            this.status = 'open';
            this.remotePeers = msg.peers;
            this.handlers = original;
            original.onPeers(msg.peers);
            resolve();
          }
        },
        onClosed: (reason) => {
          clearTimeout(timer);
          this.handlers = original;
          reject(new Error(reason));
        },
      };
    });
  }

  private onChannelMessage(peerId: string, link: Link, raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isValidMsg(msg)) return;

    if (this.isHost) {
      if (msg.t === 'hello') {
        link.peer = { id: peerId, name: msg.name.slice(0, 32) || peerId, color: colorFor(peerId) };
        this.send({ t: 'welcome', v: PROTOCOL_VERSION, you: link.peer, peers: this.peers }, peerId);
        this.broadcast({ t: 'peers', peers: this.peers }, peerId);
        this.handlers.onPeers(this.peers);
        this.handlers.onGuestReady?.(link.peer);
        return;
      }
      if (msg.t === 'bye') return this.dropLink(peerId);
      if (msg.t === 'holding') {
        this.broadcast({ t: 'held', peerId, loc: msg.loc }, peerId);
        this.handlers.onMessage(peerId, { t: 'held', peerId, loc: msg.loc });
        return;
      }
      if (!link.peer) return; // not yet welcomed
      this.handlers.onMessage(peerId, msg);
    } else {
      if (msg.t === 'peers') {
        this.remotePeers = msg.peers;
        this.handlers.onPeers(msg.peers);
      }
      if (msg.t === 'bye') return this.close('host-left');
      this.handlers.onMessage('host', msg);
    }
  }

  private dropLink(peerId: string): void {
    const link = this.links.get(peerId);
    if (!link) return;
    this.links.delete(peerId);
    if (link.graceTimer) clearTimeout(link.graceTimer);
    try {
      link.channel?.close();
      link.pc.close();
    } catch {
      /* ignore */
    }
    if (this.isHost) {
      this.broadcast({ t: 'peers', peers: this.peers });
      this.broadcast({ t: 'held', peerId, loc: null });
      this.handlers.onMessage(peerId, { t: 'held', peerId, loc: null });
      this.handlers.onPeers(this.peers);
    }
  }
}
