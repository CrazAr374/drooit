import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  AppErrorPayload,
  DeviceInfo,
  SessionRole,
  SessionSnapshot,
  WireSignalPayload,
} from '@shared/types.js';

export interface SignalingEvents {
  onPeerJoined?: (peer: DeviceInfo, session: SessionSnapshot) => void;
  onSignal?: (payload: WireSignalPayload, from: SessionRole) => void;
  onSessionEnded?: (reason: string) => void;
  onPeerLeft?: (role: SessionRole) => void;
  onPeerResumed?: (peer: DeviceInfo, session: SessionSnapshot) => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: AppErrorPayload) => void;
}

export class SignalingClient {
  private socket: Socket | null = null;
  private events: SignalingEvents = {};

  constructor(events: SignalingEvents = {}) {
    this.events = events;
  }

  setEvents(events: SignalingEvents): void {
    this.events = { ...this.events, ...events };
  }

  connect(): Promise<void> {
    if (this.socket && this.socket.connected) return Promise.resolve();

    return new Promise((resolve, reject) => {
      // Connect to the host origin or default proxy
      this.socket = io({
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        this.events.onError?.({
          code: 'INTERNAL',
          message: error.message || 'Failed to connect to signaling server',
          retryable: true,
        });
        reject(error);
      });

      this.socket.on('peer:joined', (data: { peer: DeviceInfo; session: SessionSnapshot }) => {
        this.events.onPeerJoined?.(data.peer, data.session);
      });

      this.socket.on('signal', (data: { from: SessionRole; payload: WireSignalPayload }) => {
        this.events.onSignal?.(data.payload, data.from);
      });

      this.socket.on('session:ended', (data: { reason: string }) => {
        this.events.onSessionEnded?.(data.reason);
      });

      this.socket.on('peer:left', (data: { role: SessionRole }) => {
        this.events.onPeerLeft?.(data.role);
      });

      this.socket.on('peer:resumed', (data: { peer: DeviceInfo; session: SessionSnapshot }) => {
        this.events.onPeerResumed?.(data.peer, data.session);
      });

      this.socket.on('disconnect', (reason) => {
        this.events.onDisconnect?.(reason);
      });
    });
  }

  get isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  async createSession(device: DeviceInfo): Promise<{
    session: SessionSnapshot;
    peerToken: string;
    inviteToken: string;
    inviteFragment: string;
  }> {
    await this.connect();
    return new Promise((resolve, reject) => {
      this.socket?.emit('session:create', { device }, (res: Ack<{
        session: SessionSnapshot;
        peerToken: string;
        inviteToken: string;
        inviteFragment: string;
      }>) => {
        if (!res) {
          reject(new Error('No response from signaling server'));
          return;
        }
        if (!res.ok) {
          this.events.onError?.(res.error);
          reject(new Error(res.error.message));
          return;
        }
        resolve(res);
      });
    });
  }

  async joinSession(params: {
    device: DeviceInfo;
    code?: string;
    inviteToken?: string;
  }): Promise<{
    session: SessionSnapshot;
    peerToken: string;
    role: SessionRole;
  }> {
    await this.connect();
    return new Promise((resolve, reject) => {
      this.socket?.emit('session:join', params, (res: Ack<{
        session: SessionSnapshot;
        peerToken: string;
        role: SessionRole;
      }>) => {
        if (!res) {
          reject(new Error('No response from signaling server'));
          return;
        }
        if (!res.ok) {
          this.events.onError?.(res.error);
          reject(new Error(res.error.message));
          return;
        }
        resolve(res);
      });
    });
  }

  async resumeSession(params: {
    sessionId: string;
    role: SessionRole;
    peerToken: string;
    device: DeviceInfo;
  }): Promise<{
    session: SessionSnapshot;
    role: SessionRole;
  }> {
    await this.connect();
    return new Promise((resolve, reject) => {
      this.socket?.emit('session:resume', params, (res: Ack<{
        session: SessionSnapshot;
        role: SessionRole;
      }>) => {
        if (!res) {
          reject(new Error('No response from signaling server'));
          return;
        }
        if (!res.ok) {
          this.events.onError?.(res.error);
          reject(new Error(res.error.message));
          return;
        }
        resolve(res);
      });
    });
  }

  async sendSignal(params: {
    sessionId: string;
    peerToken: string;
    payload: WireSignalPayload;
  }): Promise<void> {
    if (!this.socket?.connected) throw new Error('Not connected to signaling server');
    return new Promise((resolve, reject) => {
      this.socket?.emit('signal', params, (res?: Ack<Record<string, never>>) => {
        if (res && !res.ok) {
          this.events.onError?.(res.error);
          reject(new Error(res.error.message));
          return;
        }
        resolve();
      });
    });
  }

  async cancelSession(params: { sessionId: string; peerToken: string }): Promise<void> {
    if (!this.socket?.connected) return;
    return new Promise((resolve) => {
      this.socket?.emit('session:cancel', params, () => {
        resolve();
      });
    });
  }

  async leaveSession(params: { sessionId: string; peerToken: string }): Promise<void> {
    if (!this.socket?.connected) return;
    return new Promise((resolve) => {
      this.socket?.emit('session:leave', params, () => {
        resolve();
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
