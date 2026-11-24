import type { ControlMessage } from '@shared/protocol.js';
import type { WireSignalPayload, IceServerConfig } from '@shared/types.js';
import { WebRtcConnection, type WebRtcEvents, fetchIceConfig } from './connection.js';
import type { TransferChannel } from '../transfer/types.js';

export interface MeshEvents {
  onPeerReady?: (peerId: string) => void;
  onPeerClose?: (peerId: string) => void;
  onPeerModeChange?: (peerId: string, mode: 'direct' | 'relay' | 'unknown') => void;
  onControlMessage?: (message: ControlMessage, fromPeerId: string) => void;
  onBinaryFrame?: (frame: ArrayBuffer, fromPeerId: string) => void;
  onSignalNeeded?: (targetPeerId: string, payload: WireSignalPayload) => void;
  onError?: (error: Error, peerId?: string) => void;
}

/**
 * Multi-peer Full-Mesh WebRTC Coordinator.
 * Manages an independent WebRtcConnection to each joined peer in the room.
 */
export class MeshManager implements TransferChannel {
  private peers = new Map<string, WebRtcConnection>();
  private iceServers: IceServerConfig[] | null = null;
  private myPeerId: string;
  private events: MeshEvents;

  constructor(myPeerId: string, events: MeshEvents = {}) {
    this.myPeerId = myPeerId;
    this.events = events;
  }

  get localPeerId(): string {
    return this.myPeerId;
  }

  setEvents(events: MeshEvents): void {
    this.events = { ...this.events, ...events };
  }

  get connectedPeerCount(): number {
    return [...this.peers.values()].filter((p) => p.isOpen).length;
  }

  get peerIds(): string[] {
    return [...this.peers.keys()];
  }

  get isOpen(): boolean {
    return this.connectedPeerCount > 0;
  }

  get bufferedAmount(): number {
    let total = 0;
    for (const peer of this.peers.values()) {
      total += peer.bufferedAmount;
    }
    return total;
  }

  async waitForDrain(signal: AbortSignal): Promise<void> {
    const waiters = [...this.peers.values()].map((p) => p.waitForDrain(signal));
    await Promise.all(waiters);
  }

  sendControl(message: ControlMessage): void {
    this.broadcastControl(message);
  }

  sendFrame(frame: ArrayBuffer): void {
    this.broadcastFrame(frame);
  }

  broadcastControl(message: ControlMessage): void {
    for (const peer of this.peers.values()) {
      if (peer.isOpen) {
        try {
          peer.sendControl(message);
        } catch {
          // Ignore individual peer send error
        }
      }
    }
  }

  sendControlToPeer(targetPeerId: string, message: ControlMessage): void {
    const peer = this.peers.get(targetPeerId);
    if (peer && peer.isOpen) {
      peer.sendControl(message);
    }
  }

  broadcastFrame(frame: ArrayBuffer): void {
    for (const peer of this.peers.values()) {
      if (peer.isOpen) {
        try {
          peer.sendFrame(frame);
        } catch {
          // Ignore individual peer send error
        }
      }
    }
  }

  async ensureIceConfig(): Promise<IceServerConfig[]> {
    if (!this.iceServers) {
      this.iceServers = await fetchIceConfig();
    }
    return this.iceServers;
  }

  async addPeer(peerId: string, isOfferer: boolean): Promise<WebRtcConnection> {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const iceServers = await this.ensureIceConfig();
    const peerEvents: WebRtcEvents = {
      onSignalNeeded: (payload) => {
        this.events.onSignalNeeded?.(peerId, payload);
      },
      onReady: () => {
        this.events.onPeerReady?.(peerId);
      },
      onModeChange: (mode) => {
        this.events.onPeerModeChange?.(peerId, mode);
      },
      onControlMessage: (message) => {
        this.events.onControlMessage?.(message, peerId);
      },
      onBinaryFrame: (frame) => {
        this.events.onBinaryFrame?.(frame, peerId);
      },
      onClose: () => {
        this.events.onPeerClose?.(peerId);
        this.removePeer(peerId);
      },
      onError: (err) => {
        this.events.onError?.(err, peerId);
      },
    };

    const connection = new WebRtcConnection(isOfferer, peerEvents);
    this.peers.set(peerId, connection);
    await connection.init(iceServers);
    return connection;
  }

  async handleSignal(fromPeerId: string, payload: WireSignalPayload): Promise<void> {
    let peer = this.peers.get(fromPeerId);
    if (!peer) {
      // If we receive an offer from a peer we haven't registered yet, we are the answerer
      const isOfferer = payload.kind === 'description' && payload.description.type === 'offer' ? false : true;
      peer = await this.addPeer(fromPeerId, isOfferer);
    }
    await peer.handleSignal(payload);
  }

  removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.close();
      this.peers.delete(peerId);
    }
  }

  closeAll(): void {
    for (const peer of this.peers.values()) {
      peer.close();
    }
    this.peers.clear();
  }
}
