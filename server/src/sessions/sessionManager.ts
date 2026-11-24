import {
  MAX_JOIN_ATTEMPTS_PER_CODE,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_CONNECTED_TTL_MS,
  SESSION_TTL_MS,
} from '@shared/constants.js';
import type { DeviceInfo, SessionRole, SessionSnapshot, SessionStatus } from '@shared/types.js';
import { AppError } from '../errors.js';
import { generatePairingCode, generateSessionId, generateToken, safeEqual } from '../security/tokens.js';

export interface PeerRecord {
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
  sender: PeerRecord;
  receiver: PeerRecord | null;
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
  private readonly now: () => number;
  private readonly onEnded?: (event: SessionEndedEvent) => void;

  constructor(options: SessionManagerOptions = {}) {
    this.ttlMs = options.ttlMs ?? SESSION_TTL_MS;
    this.connectedTtlMs = options.connectedTtlMs ?? SESSION_CONNECTED_TTL_MS;
    this.absoluteTtlMs = options.absoluteTtlMs ?? SESSION_ABSOLUTE_TTL_MS;
    this.maxSessions = options.maxSessions ?? 5000;
    this.now = options.now ?? Date.now;
    this.onEnded = options.onEnded;
    if (this.ttlMs <= 0 || this.connectedTtlMs <= 0 || this.absoluteTtlMs <= 0) {
      throw new Error('Session TTLs must be positive');
    }
  }

  get size(): number {
    return this.byId.size;
  }

  create(device: DeviceInfo, socketId: string | null = null): CreateSessionResult {
    if (this.byId.size >= this.maxSessions) {
      this.sweep();
    }
    if (this.byId.size >= this.maxSessions) {
      throw new AppError('RATE_LIMITED', 'The server is at capacity. Please try again in a moment.', true);
    }

    const code = this.allocateCode();
    const now = this.now();
    const sender: PeerRecord = {
      role: 'sender',
      token: generateToken(),
      device,
      socketId,
      connectedAt: socketId ? now : null,
      lastSeenAt: now,
    };
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
      sender,
      receiver: null,
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

  /** Validates the invite token (if supplied) and attaches a receiver. */
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
    if (session.status !== 'waiting' || session.receiver) {
      throw new AppError('SESSION_FULL', 'That session already has a connected receiver.', false);
    }
    if (this.isExpired(session)) {
      this.end(session, 'expired');
      throw new AppError('SESSION_EXPIRED', 'This session has expired. Ask the sender for a new code.', true);
    }
    if (params.inviteToken !== undefined) {
      if (session.inviteConsumed || !safeEqual(params.inviteToken, session.inviteToken)) {
        this.recordJoinFailure(session.id);
        throw new AppError('INVITE_INVALID', 'This invitation link is no longer valid. Use the numeric code instead.', true);
      }
    }

    const now = this.now();
    const receiver: PeerRecord = {
      role: 'receiver',
      token: generateToken(),
      device: params.device,
      socketId: params.socketId,
      connectedAt: now,
      lastSeenAt: now,
    };
    session.inviteConsumed = true;
    session.receiver = receiver;
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
    const peer = role === 'sender' ? session.sender : session.receiver;
    if (!peer || !safeEqual(peer.token, token)) {
      throw new AppError('UNAUTHORIZED', 'You are not authorised for this session.', false);
    }
    if (this.isExpired(session)) {
      this.end(session, 'expired');
      throw new AppError('SESSION_EXPIRED', 'This session has expired.', true);
    }
    return peer;
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
    if (peer.socketId && peer.socketId !== params.socketId) {
      // The same peer reconnecting from a new socket replaces the stale binding.
      peer.socketId = params.socketId;
    }
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
    if (!session.receiver) return;
    const now = this.now();
    session.expiresAt = Math.min(now + this.connectedTtlMs, session.absoluteExpiresAt);
  }

  /** Detaches a dropped socket. The pairing survives so the peer can resume. */
  detachSocket(socketId: string): Array<{
    sessionId: string;
    code: string;
    role: SessionRole;
    peerSocketId: string | null;
  }> {
    const detached: Array<{
      sessionId: string;
      code: string;
      role: SessionRole;
      peerSocketId: string | null;
    }> = [];
    for (const session of this.byId.values()) {
      if (session.sender.socketId === socketId) {
        session.sender.socketId = null;
        detached.push({
          sessionId: session.id,
          code: session.code,
          role: 'sender',
          peerSocketId: session.receiver?.socketId ?? null,
        });
      }
      if (session.receiver?.socketId === socketId) {
        session.receiver.socketId = null;
        detached.push({
          sessionId: session.id,
          code: session.code,
          role: 'receiver',
          peerSocketId: session.sender.socketId,
        });
      }
    }
    return detached;
  }

  cancel(sessionId: string, role: SessionRole): void {
    const session = this.require(sessionId);
    if (role !== 'sender') {
      // Receivers may leave, but only the sender can destroy the session.
      const receiver = session.receiver;
      if (receiver) receiver.socketId = null;
      return;
    }
    this.end(session, 'cancelled');
  }

  /** Explicitly leave without destroying the session (receiver can resume). */
  leave(sessionId: string, role: SessionRole): { peerSocketId: string | null } {
    const session = this.get(sessionId);
    if (!session) return { peerSocketId: null };
    if (role === 'receiver' && session.receiver) {
      session.receiver.socketId = null;
      return { peerSocketId: session.sender.socketId };
    }
    return { peerSocketId: session.receiver?.socketId ?? null };
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
    return {
      id: session.id,
      code: session.code,
      status: session.status,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      sender: session.sender.device,
      receiver: session.receiver?.device ?? null,
    };
  }

  onlineSockets(sessionId: string): { sender: string | null; receiver: string | null } {
    const session = this.byId.get(sessionId);
    return {
      sender: session?.sender.socketId ?? null,
      receiver: session?.receiver?.socketId ?? null,
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
