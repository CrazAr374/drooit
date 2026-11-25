import type { Server, Socket } from 'socket.io';
import type { AppConfig } from '../config.js';
import type { Logger } from '../logger.js';
import type { OriginValidator } from '../security/origin.js';
import {
  SlidingWindowRateLimiter,
  clientKey,
  type RateLimiterLike,
} from '../security/rateLimiter.js';
import { SESSION_JOIN_RATE, SESSION_CREATE_RATE, SIGNAL_RATE, SESSION_SWEEP_INTERVAL_MS } from '@shared/constants.js';
import type { Ack, SessionRole, SessionSnapshot } from '@shared/types.js';
import { AppError, errorPayload } from '../errors.js';
import {
  sessionCancelSchema,
  sessionCreateSchema,
  sessionJoinSchema,
  sessionLeaveSchema,
  sessionResumeSchema,
  signalSchema,
  validateInput,
} from '../validation.js';
import type { PairingService } from '../sessions/pairingService.js';
import type { SessionEndedEvent, SessionManager } from '../sessions/sessionManager.js';

interface SocketBinding {
  sessionId: string;
  role: SessionRole;
}

export interface SignalingDependencies {
  io: Server;
  sessions: SessionManager;
  pairing: PairingService;
  config: AppConfig;
  logger: Logger;
  originValidator: OriginValidator;
  /** Injectable for tests. */
  createRateLimiter?: (options: { limit: number; windowMs: number }) => RateLimiterLike;
}

type AckFn = (response: unknown) => void;

/**
 * Socket.IO signaling service.
 *
 * Only lifecycle, SDP and ICE data crosses this layer. File bytes never touch the
 * server. Every event validates the sender's peer token, and sockets are placed in
 * a per-session room only after authentication.
 */
export class SignalingService {
  private readonly bindingBySocket = new Map<string, SocketBinding>();
  private readonly room = (sessionId: string) => `session:${sessionId}`;
  private readonly limiterFactory: (options: { limit: number; windowMs: number }) => RateLimiterLike;
  private readonly createLimiter: RateLimiterLike;
  private readonly joinLimiter: RateLimiterLike;
  private readonly connectLimiter: RateLimiterLike;
  private readonly signalLimiters = new Map<string, RateLimiterLike>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: SignalingDependencies) {
    this.limiterFactory =
      deps.createRateLimiter ??
      ((options) => new SlidingWindowRateLimiter({ ...options, now: () => Date.now() }));
    this.createLimiter = this.limiterFactory(SESSION_CREATE_RATE);
    this.joinLimiter = this.limiterFactory(SESSION_JOIN_RATE);
    this.connectLimiter = this.limiterFactory({ limit: 60, windowMs: 60_000 });
  }

  start(): void {
    const { io, originValidator, logger } = this.deps;

    io.use((socket, next) => {
      const origin = socket.handshake.headers.origin;
      if (!originValidator.isAllowed(origin)) {
        logger.warn('Rejected socket handshake from disallowed origin', {
          origin: origin ?? 'none',
          ip: socket.handshake.address,
        });
        next(new Error('Origin not allowed'));
        return;
      }
      const result = this.connectLimiter.consume(clientKey(socket.handshake.address));
      if (!result.allowed) {
        next(new Error('Too many connection attempts'));
        return;
      }
      next();
    });

    io.on('connection', (socket) => {
      logger.debug('Socket connected', { socketId: socket.id });
      socket.on('session:create', (payload: unknown, ack?: AckFn) => {
        void this.handleCreate(socket, payload, ack);
      });
      socket.on('session:join', (payload: unknown, ack?: AckFn) => {
        void this.handleJoin(socket, payload, ack);
      });
      socket.on('session:resume', (payload: unknown, ack?: AckFn) => {
        void this.handleResume(socket, payload, ack);
      });
      socket.on('signal', (payload: unknown, ack?: AckFn) => {
        void this.handleSignal(socket, payload, ack);
      });
      socket.on('session:cancel', (payload: unknown, ack?: AckFn) => {
        void this.handleCancel(socket, payload, ack);
      });
      socket.on('session:leave', (payload: unknown, ack?: AckFn) => {
        void this.handleLeave(socket, payload, ack);
      });
      socket.on('disconnect', (reason) => {
        this.handleDisconnect(socket, reason);
      });
    });

    this.sweepTimer = setInterval(() => {
      const ended = this.deps.sessions.sweep();
      for (const event of ended) this.handleEnded(event);
    }, SESSION_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    this.signalLimiters.clear();
  }

  /** Emits termination to both peers and clears any room bindings. */
  handleEnded(event: SessionEndedEvent): void {
    const { io, logger } = this.deps;
    for (const socketId of [event.senderSocketId, event.receiverSocketId]) {
      if (!socketId) continue;
      io.to(socketId).emit('session:ended', { reason: event.reason });
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(this.room(event.sessionId));
        this.bindingBySocket.delete(socket.id);
      }
    }
    logger.info('Session ended', { sessionId: event.sessionId, reason: event.reason });
  }

  private async handleCreate(socket: Socket, payload: unknown, ack?: AckFn): Promise<void> {
    const { sessions, pairing, logger } = this.deps;
    try {
      this.enforceRate(this.createLimiter, clientKey(socket.handshake.address), 'session:create');
      if (this.bindingBySocket.has(socket.id)) {
        throw new AppError('INVALID_INPUT', 'This connection is already part of a session.', false);
      }
      const input = validateInput(sessionCreateSchema, payload);
      const created = pairing.createSession(input.device, socket.id, input.maxPeers);
      await socket.join(this.room(created.session.id));
      this.bindingBySocket.set(socket.id, { sessionId: created.session.id, role: 'sender' });

      const response: Ack<{
        session: SessionSnapshot;
        peerToken: string;
        inviteToken: string;
        inviteFragment: string;
        peerId: string;
      }> = {
        ok: true,
        session: sessions.snapshot(created.session),
        peerToken: created.peerToken,
        inviteToken: created.inviteToken,
        inviteFragment: created.inviteFragment,
        peerId: created.session.sender.id,
      };
      ack?.(response);
      logger.info('Session created', {
        sessionId: created.session.id,
        expiresAt: created.session.expiresAt,
      });
    } catch (error) {
      this.fail(socket, error, ack, 'session:create');
    }
  }

  private async handleJoin(socket: Socket, payload: unknown, ack?: AckFn): Promise<void> {
    const { sessions, pairing, io, logger } = this.deps;
    try {
      this.enforceRate(this.joinLimiter, clientKey(socket.handshake.address), 'session:join');
      if (this.bindingBySocket.has(socket.id)) {
        throw new AppError('INVALID_INPUT', 'This connection is already part of a session.', false);
      }
      const input = validateInput(sessionJoinSchema, payload);
      const { session, peerToken, receiver } = pairing.joinSession({
        code: input.code,
        inviteToken: input.inviteToken,
        device: input.device,
        socketId: socket.id,
      });
      await socket.join(this.room(session.id));
      this.bindingBySocket.set(socket.id, { sessionId: session.id, role: 'receiver' });

      const response: Ack<{ session: SessionSnapshot; peerToken: string; role: SessionRole; peerId: string }> = {
        ok: true,
        session: sessions.snapshot(session),
        peerToken,
        role: 'receiver',
        peerId: receiver.id,
      };
      ack?.(response);

      const allSockets = sessions.onlineSockets(session.id);
      for (const targetSocketId of allSockets.all) {
        if (targetSocketId !== socket.id) {
          io.to(targetSocketId).emit('peer:joined', {
            peer: receiver.device,
            peerId: receiver.id,
            role: 'receiver',
            session: sessions.snapshot(session),
          });
        }
      }
      logger.info('Receiver joined', { sessionId: session.id });
    } catch (error) {
      this.fail(socket, error, ack, 'session:join');
    }
  }

  private async handleResume(socket: Socket, payload: unknown, ack?: AckFn): Promise<void> {
    const { sessions, pairing, io, logger } = this.deps;
    try {
      const input = validateInput(sessionResumeSchema, payload);
      const { session, peer } = pairing.resumeSession({
        sessionId: input.sessionId,
        role: input.role,
        peerToken: input.peerToken,
        socketId: socket.id,
        device: input.device,
      });
      await socket.join(this.room(session.id));
      this.bindingBySocket.set(socket.id, { sessionId: session.id, role: input.role });

      const response: Ack<{ session: SessionSnapshot; role: SessionRole }> = {
        ok: true,
        session: sessions.snapshot(session),
        role: input.role,
      };
      ack?.(response);

      const peerSocketId = input.role === 'sender' ? session.receiver?.socketId : session.sender.socketId;
      if (peerSocketId) {
        io.to(peerSocketId).emit('peer:resumed', {
          role: input.role,
          peer: peer.device,
          session: sessions.snapshot(session),
        });
      }
      logger.info('Peer resumed session', { sessionId: session.id, role: input.role });
    } catch (error) {
      this.fail(socket, error, ack, 'session:resume');
    }
  }

  private handleSignal(socket: Socket, payload: unknown, ack?: AckFn): void {
    const { sessions, pairing, io } = this.deps;
    try {
      const binding = this.requireBinding(socket);
      const limiter = this.signalLimiter(socket.id);
      this.enforceRate(limiter, socket.id, 'signal');

      const input = validateInput(signalSchema, payload);
      if (input.sessionId !== binding.sessionId) {
        throw new AppError('UNAUTHORIZED', 'Signal does not belong to your session.', false);
      }
      const peer = pairing.authenticate(input.sessionId, binding.role, input.peerToken);
      pairing.assertRole(peer, binding.role);

      if (input.payload.kind === 'description') {
        const expectedType = binding.role === 'sender' ? 'offer' : 'answer';
        if (input.payload.description.type !== expectedType) {
          throw new AppError('INVALID_INPUT', `Only ${expectedType}s may be sent by the ${binding.role}.`, false);
        }
      }

      const session = sessions.require(binding.sessionId);
      let peerSocketId: string | null = null;

      if (input.targetPeerId) {
        const target = session.peers.get(input.targetPeerId);
        peerSocketId = target?.socketId ?? null;
      } else {
        peerSocketId =
          binding.role === 'sender' ? session.receiver?.socketId ?? null : session.sender.socketId;
      }

      if (!peerSocketId) {
        throw new AppError('PEER_DISCONNECTED', 'The other device is not connected right now.', true);
      }

      io.to(peerSocketId).emit('signal', {
        from: binding.role,
        fromPeerId: peer.id,
        payload: input.payload,
      });
      sessions.touch(session);
      ack?.({ ok: true });
    } catch (error) {
      this.fail(socket, error, ack, 'signal');
    }
  }

  private handleCancel(socket: Socket, payload: unknown, ack?: AckFn): void {
    const { sessions, pairing } = this.deps;
    try {
      const binding = this.requireBinding(socket);
      const input = validateInput(sessionCancelSchema, payload);
      if (input.sessionId !== binding.sessionId) {
        throw new AppError('UNAUTHORIZED', 'Session mismatch.', false);
      }
      const peer = pairing.authenticate(input.sessionId, binding.role, input.peerToken);
      pairing.assertRole(peer, 'sender');
      sessions.cancel(input.sessionId, 'sender');
      ack?.({ ok: true });
    } catch (error) {
      this.fail(socket, error, ack, 'session:cancel');
    }
  }

  private handleLeave(socket: Socket, payload: unknown, ack?: AckFn): void {
    const { sessions, pairing, io } = this.deps;
    try {
      const binding = this.requireBinding(socket);
      const input = validateInput(sessionLeaveSchema, payload);
      if (input.sessionId !== binding.sessionId) {
        throw new AppError('UNAUTHORIZED', 'Session mismatch.', false);
      }
      const peer = pairing.authenticate(input.sessionId, binding.role, input.peerToken);
      const { peerId, otherSocketIds, peerSocketId } = sessions.leave(input.sessionId, peer.token);
      for (const targetId of otherSocketIds) {
        io.to(targetId).emit('peer:left', {
          role: peer.role,
          peerId: peerId ?? peer.id,
          canResume: true,
        });
      }
      if (peerSocketId && otherSocketIds.length === 0) {
        io.to(peerSocketId).emit('peer:left', { role: peer.role, canResume: true });
      }
      socket.leave(this.room(input.sessionId));
      this.bindingBySocket.delete(socket.id);
      ack?.({ ok: true });
    } catch (error) {
      this.fail(socket, error, ack, 'session:leave');
    }
  }

  private handleDisconnect(socket: Socket, reason: string): void {
    const binding = this.bindingBySocket.get(socket.id);
    this.bindingBySocket.delete(socket.id);
    if (!binding) return;

    const detached = this.deps.sessions.detachSocket(socket.id);
    for (const entry of detached) {
      for (const peerSocketId of entry.otherSocketIds) {
        this.deps.io.to(peerSocketId).emit('peer:left', {
          role: entry.role,
          peerId: entry.peerId,
          canResume: true,
        });
      }
    }
    this.deps.logger.info('Socket disconnected', {
      sessionId: binding.sessionId,
      role: binding.role,
      reason,
    });
    this.signalLimiters.delete(socket.id);
  }

  private requireBinding(socket: Socket): SocketBinding {
    const binding = this.bindingBySocket.get(socket.id);
    if (!binding) {
      throw new AppError('UNAUTHORIZED', 'Join a session before sending signaling data.', false);
    }
    return binding;
  }

  private signalLimiter(socketId: string): RateLimiterLike {
    let limiter = this.signalLimiters.get(socketId);
    if (!limiter) {
      limiter = this.limiterFactory(SIGNAL_RATE);
      this.signalLimiters.set(socketId, limiter);
    }
    return limiter;
  }

  private enforceRate(
    limiter: RateLimiterLike,
    key: string,
    label: string,
  ): void {
    const result = limiter.consume(key);
    if (!result.allowed) {
      this.deps.logger.warn('Rate limit exceeded', { label, key });
      throw new AppError(
        'RATE_LIMITED',
        `Too many requests. Try again in ${Math.ceil(result.retryAfterMs / 1000)}s.`,
        true,
      );
    }
  }

  private fail(socket: Socket, error: unknown, ack: AckFn | undefined, event: string): void {
    const payload = errorPayload(error);
    if (!(error instanceof AppError)) {
      this.deps.logger.error('Unhandled signaling error', {
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    } else if (payload.code === 'RATE_LIMITED') {
      this.deps.logger.warn('Signaling request rejected', { event, code: payload.code });
    }
    socket.emit('session:error', payload);
    ack?.({ ok: false, error: payload });
  }
}
