import {
  MAX_JOIN_ATTEMPTS_PER_CODE,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_CONNECTED_TTL_MS,
  SESSION_TTL_MS,
} from '@shared/constants.js';
import type { DeviceInfo, PeerSnapshot, SessionRole, SessionSnapshot, SessionStatus } from '@shared/types.js';
import { AppError } from '../errors.js';
import { generatePairingCode, generateSessionId, generateToken, safeEqual } from '../security/tokens.js';

export interface PeerRecord {
  id: string;
  role: SessionRole;
  token: string;
  device: DeviceInfo;
  socketId: string | null;
  connectedAt: number | null;
  lastSeenAt: number;
}

export interface SessionRecord {
  id: string;
  code: string;
  inviteToken: string;
  inviteConsumed: boolean;
  createdAt: number;
  expiresAt: number;
  absoluteExpiresAt: number;
  status: SessionStatus;
  joinAttempts: number;
  maxPeers: number;
  sender: PeerRecord;
  receiver: PeerRecord | null;
  peers: Map<string, PeerRecord>;
}

export type EndReason = 'expired' | 'cancelled' | 'abuse';

export interface SessionEndedEvent {
  sessionId: string;
  code: string;
  reason: EndReason;
  senderSocketId: string | null;
  receiverSocketId: string | null;
}

export interface SessionManagerOptions {
  ttlMs?: number;
  connectedTtlMs?: number;
  absoluteTtlMs?: number;
  maxSessions?: number;
  maxPeersPerSession?: number;
  now?: () => number;
  onEnded?: (event: SessionEndedEvent) => void;
}

export interface CreateSessionResult {
  session: SessionRecord;
  peerToken: string;
  inviteToken: string;
}

export interface JoinSessionResult {
  session: SessionRecord;
  peerToken: string;
  receiver: PeerRecord;
}

/**
 * In-memory session store for the MVP.
 *
 * The public method surface is intentionally free of transport concerns so a
 * Redis-backed implementation can replace it for multi-instance deployments
 * without touching the signaling layer.
 */
export class SessionManager {
  private readonly byId = new Map<string, SessionRecord>();
  private readonly byCode = new Map<string, string>();
  private readonly ttlMs: number;
  private readonly connectedTtlMs: number;
  private readonly absoluteTtlMs: number;
  private readonly maxSessions: number;
  private readonly maxPeersPerSession: number;
  private readonly now: () => number;
  private readonly onEnded?: (event: SessionEndedEvent) => void;

  constructor(options: SessionManagerOptions = {}) {
    this.ttlMs = options.ttlMs ?? SESSION_TTL_MS;
    this.connectedTtlMs = options.connectedTtlMs ?? SESSION_CONNECTED_TTL_MS;
    this.absoluteTtlMs = options.absoluteTtlMs ?? SESSION_ABSOLUTE_TTL_MS;
    this.maxSessions = options.maxSessions ?? 5000;
    this.maxPeersPerSession = options.maxPeersPerSession ?? 8;
    this.now = options.now ?? Date.now;
    this.onEnded = options.onEnded;
    if (this.ttlMs <= 0 || this.connectedTtlMs <= 0 || this.absoluteTtlMs <= 0) {
      throw new Error('Session TTLs must be positive');
    }
  }

  get size(): number {
    return this.byId.size;
  }

  get maxPeers(): number {
    return this.maxPeersPerSession;
  }

  create(device: DeviceInfo, socketId: string | null = null, maxPeers = 2): CreateSessionResult {
    if (this.byId.size >= this.maxSessions) {
      this.sweep();
    }
    if (this.byId.size >= this.maxSessions) {
      throw new AppError('RATE_LIMITED', 'The server is at capacity. Please try again in a moment.', true);
    }

    const code = this.allocateCode();
    const now = this.now();
    const senderId = generateToken();
    const sender: PeerRecord = {
      id: senderId,
      role: 'sender',
      token: generateToken(),
      device,
      socketId,
      connectedAt: socketId ? now : null,
      lastSeenAt: now,
    };
    const peers = new Map<string, PeerRecord>();
    peers.set(senderId, sender);

    const session: SessionRecord = {
      id: generateSessionId(),
      code,
      inviteToken: generateToken(),
      inviteConsumed: false,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      absoluteExpiresAt: now + this.absoluteTtlMs,
      status: 'waiting',
      joinAttempts: 0,
      maxPeers,
      sender,
      receiver: null,
      peers,
    };
    this.byId.set(session.id, session);
    this.byCode.set(code, session.id);
    return { session, peerToken: sender.token, inviteToken: session.inviteToken };
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.byId.get(sessionId);
  }

  getByCode(code: string): SessionRecord | undefined {
    const id = this.byCode.get(code);
    return id ? this.byId.get(id) : undefined;
  }

  require(sessionId: string): SessionRecord {
    const session = this.byId.get(sessionId);
    if (!session) {
      throw new AppError('SESSION_NOT_FOUND', 'That session no longer exists. Ask for a new code.', true);
    }
    if (session.status === 'expired') {
      throw new AppError('SESSION_EXPIRED', 'This session has expired. Ask the sender for a new code.', true);
    }
    if (session.status === 'cancelled') {
      throw new AppError('SESSION_CANCELLED', 'The sender cancelled this session.', true);
    }
    if (this.isExpiredByTime(session, this.now())) {
      this.end(session, 'expired');
      throw new AppError('SESSION_EXPIRED', 'This session has expired. Ask the sender for a new code.', true);
    }
    return session;
  }

  /** Validates the invite token (if supplied) and attaches a receiver/peer. */
  joinByCode(params: {
    code: string;
    inviteToken?: string;
    device: DeviceInfo;
    socketId: string;
  }): JoinSessionResult {
    const session = this.getByCode(params.code);
    if (!session) {
      throw new AppError('INVALID_CODE', 'No active session matches that code. Check the code and try again.', true);
    }
    if (this.isExpired(session)) {
      this.end(session, 'expired');
      throw new AppError('SESSION_EXPIRED', 'This session has expired. Ask the sender for a new code.', true);
    }
    if (session.peers.size >= session.maxPeers) {
      throw new AppError('SESSION_FULL', 'That session already has a connected receiver.', false);
    }
    if (params.inviteToken !== undefined) {
      if (session.inviteConsumed || !safeEqual(params.inviteToken, session.inviteToken)) {
        this.recordJoinFailure(session.id);
        throw new AppError('INVITE_INVALID', 'This invitation link is no longer valid. Use the numeric code instead.', true);
      }
    }

    const now = this.now();
    const receiverId = generateToken();
    const receiver: PeerRecord = {
      id: receiverId,
      role: 'receiver',
      token: generateToken(),
      device: params.device,
      socketId: params.socketId,
      connectedAt: now,
      lastSeenAt: now,
    };
    session.inviteConsumed = true;
    session.peers.set(receiverId, receiver);
    if (!session.receiver) {
      session.receiver = receiver;
    }
    session.status = 'connected';
    session.expiresAt = Math.min(now + this.connectedTtlMs, session.absoluteExpiresAt);
    return { session, peerToken: receiver.token, receiver };
  }

  /** Records a failed invite-token attempt and invalidates the session on abuse. */
  recordJoinFailure(sessionId: string): void {
    const session = this.byId.get(sessionId);
    if (!session) return;
    session.joinAttempts += 1;
    if (session.joinAttempts >= MAX_JOIN_ATTEMPTS_PER_CODE) {
      this.end(session, 'abuse');
    }
  }

  verifyPeer(sessionId: string, role: SessionRole, token: string): PeerRecord {
    const session = this.get(sessionId);
    if (!session) {
      throw new AppError('SESSION_NOT_FOUND', 'That session no longer exists.', true);
    }
    for (const peer of session.peers.values()) {
      if (safeEqual(peer.token, token)) {
        if (peer.role !== role) {
          throw new AppError('UNAUTHORIZED', 'You are not authorised for this session.', false);
        }
        if (this.isExpired(session)) {
          this.end(session, 'expired');
          throw new AppError('SESSION_EXPIRED', 'This session has expired.', true);
        }
        return peer;
      }
    }
    throw new AppError('UNAUTHORIZED', 'You are not authorised for this session.', false);
  }

  /** Re-binds a socket after a refresh or network drop, using the peer token. */
  resume(params: {
    sessionId: string;
    role: SessionRole;
    token: string;
    socketId: string;
    device?: DeviceInfo;
  }): { session: SessionRecord; peer: PeerRecord } {
    const session = this.get(params.sessionId);
    if (!session) {
      throw new AppError('SESSION_NOT_FOUND', 'That session no longer exists.', true);
    }
    const peer = this.verifyPeer(params.sessionId, params.role, params.token);
    peer.socketId = params.socketId;
    peer.connectedAt = peer.connectedAt ?? this.now();
    peer.lastSeenAt = this.now();
    if (params.device) peer.device = params.device;
    this.touch(session);
    return { session, peer };
  }

  attachSocket(sessionId: string, role: SessionRole, socketId: string): void {
    const session = this.byId.get(sessionId);
    if (!session) return;
    const peer = role === 'sender' ? session.sender : session.receiver;
    if (!peer) return;
    peer.socketId = socketId;
    peer.connectedAt = peer.connectedAt ?? this.now();
    peer.lastSeenAt = this.now();
    this.touch(session);
  }

  /** Refreshes the connected-session deadline on activity, capped by the absolute TTL. */
  touch(session: SessionRecord): void {
    const now = this.now();
    session.expiresAt = Math.min(now + this.connectedTtlMs, session.absoluteExpiresAt);
  }

  /** Detaches a dropped socket. The pairing survives so the peer can resume. */
  detachSocket(socketId: string): Array<{
    sessionId: string;
    code: string;
    peerId: string;
    role: SessionRole;
    otherSocketIds: string[];
    peerSocketId: string | null;
  }> {
    const detached: Array<{
      sessionId: string;
      code: string;
      peerId: string;
      role: SessionRole;
      otherSocketIds: string[];
      peerSocketId: string | null;
    }> = [];
    for (const session of this.byId.values()) {
      for (const peer of session.peers.values()) {
        if (peer.socketId === socketId) {
          peer.socketId = null;
          const otherSocketIds = [...session.peers.values()]
            .map((p) => p.socketId)
            .filter((id): id is string => id !== null && id !== socketId);
          detached.push({
            sessionId: session.id,
            code: session.code,
            peerId: peer.id,
            role: peer.role,
            otherSocketIds,
            peerSocketId: otherSocketIds[0] ?? null,
          });
        }
      }
    }
    return detached;
  }

  cancel(sessionId: string, role: SessionRole): void {
    const session = this.require(sessionId);
    if (role !== 'sender') {
      const receiver = session.receiver;
      if (receiver) receiver.socketId = null;
      return;
    }
    this.end(session, 'cancelled');
  }

  /** Explicitly leave without destroying the session (peers can resume or leave). */
  leave(sessionId: string, roleOrToken: string): { peerId: string | null; otherSocketIds: string[]; peerSocketId: string | null } {
    const session = this.get(sessionId);
    if (!session) return { peerId: null, otherSocketIds: [], peerSocketId: null };
    for (const [id, peer] of session.peers.entries()) {
      if (safeEqual(peer.token, roleOrToken) || peer.role === roleOrToken || id === roleOrToken) {
        peer.socketId = null;
        session.peers.delete(id);
        if (session.receiver?.id === id) {
          session.receiver = [...session.peers.values()].find((p) => p.role === 'receiver') ?? null;
        }
        const otherSocketIds = [...session.peers.values()]
          .map((p) => p.socketId)
          .filter((s): s is string => s !== null);
        return { peerId: id, otherSocketIds, peerSocketId: otherSocketIds[0] ?? null };
      }
    }
    return { peerId: null, otherSocketIds: [], peerSocketId: null };
  }

  isExpired(session: SessionRecord): boolean {
    const now = this.now();
    return now >= session.expiresAt || now >= session.absoluteExpiresAt;
  }

  /** Removes expired sessions and reports them so peers can be notified. */
  sweep(): SessionEndedEvent[] {
    const ended: SessionEndedEvent[] = [];
    for (const session of [...this.byId.values()]) {
      if (this.isExpired(session)) {
        const event = this.end(session, 'expired', false);
        if (event) ended.push(event);
      }
    }
    return ended;
  }

  snapshot(session: SessionRecord): SessionSnapshot {
    const peerList: PeerSnapshot[] = [...session.peers.values()].map((p) => ({
      peerId: p.id,
      device: p.device,
      role: p.role,
      joinedAt: p.connectedAt ?? session.createdAt,
    }));
    return {
      id: session.id,
      code: session.code,
      status: session.status,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      maxPeers: session.maxPeers,
      peers: peerList,
      host: {
        peerId: session.sender.id,
        device: session.sender.device,
        role: 'sender',
        joinedAt: session.sender.connectedAt ?? session.createdAt,
      },
      sender: session.sender.device,
      receiver: session.receiver?.device ?? (peerList.find((p) => p.role === 'receiver')?.device ?? null),
    };
  }

  onlineSockets(sessionId: string): { all: string[]; sender: string | null; receiver: string | null } {
    const session = this.byId.get(sessionId);
    if (!session) return { all: [], sender: null, receiver: null };
    const all = [...session.peers.values()]
      .map((p) => p.socketId)
      .filter((s): s is string => s !== null);
    return {
      all,
      sender: session.sender.socketId,
      receiver: session.receiver?.socketId ?? null,
    };
  }

  destroyAll(): void {
    this.byId.clear();
    this.byCode.clear();
  }

  private allocateCode(): string {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const code = generatePairingCode();
      if (!this.byCode.has(code)) return code;
    }
    throw new AppError('INTERNAL', 'Could not allocate a pairing code. Please retry.', true);
  }

  private isExpiredByTime(session: SessionRecord, now: number): boolean {
    return now >= session.expiresAt || now >= session.absoluteExpiresAt;
  }

  private end(session: SessionRecord, reason: EndReason, notify = true): SessionEndedEvent | null {
    if (!this.byId.has(session.id)) return null;
    if (this.isExpiredByTime(session, this.now()) && reason !== 'cancelled') {
      reason = 'expired';
    }
    session.status = reason === 'cancelled' ? 'cancelled' : 'expired';
    const event: SessionEndedEvent = {
      sessionId: session.id,
      code: session.code,
      reason,
      senderSocketId: session.sender.socketId,
      receiverSocketId: session.receiver?.socketId ?? null,
    };
    this.byId.delete(session.id);
    this.byCode.delete(session.code);
    if (notify) this.onEnded?.(event);
    return event;
  }
}
