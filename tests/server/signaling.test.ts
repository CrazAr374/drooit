import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import { createDrooitServer, type DrooitServer } from '../../server/src/createServer.js';
import type { AppConfig } from '../../server/src/config.js';
import { silentLogger } from '../../server/src/logger.js';
import { SlidingWindowRateLimiter } from '../../server/src/security/rateLimiter.js';
import { SESSION_CREATE_RATE } from '@shared/constants.js';

const ORIGIN = 'http://localhost:5173';
const DEVICE_SENDER = { name: 'Sender laptop', platform: 'Windows', browser: 'Chrome' };
const DEVICE_RECEIVER = { name: 'Receiver phone', platform: 'Android', browser: 'Chrome' };

const config: AppConfig = {
  env: 'test',
  port: 0,
  allowedOrigins: [ORIGIN],
  trustProxy: false,
  logLevel: 'error',
  stunUrls: ['stun:stun.l.google.com:19302'],
  turnUrls: [],
  turnSecret: '',
  turnUsername: '',
  turnPassword: '',
  turnTtlSeconds: 3600,
  sessionTtlMs: 60_000,
  maxSessions: 100,
};

let server: DrooitServer;
let port: number;
const sockets: Socket[] = [];

async function startServer(overrides: Partial<AppConfig> = {}): Promise<void> {
  server = createDrooitServer({
    config: { ...config, ...overrides },
    logger: silentLogger,
  });
  port = await server.listen(0, '127.0.0.1');
}

function connect(origin = ORIGIN): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: 4_000,
      extraHeaders: { origin },
    });
    sockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => reject(error));
  });
}

function ack<T = Record<string, unknown>>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No ack for ${event}`)), 5_000);
    socket.emit(event, payload, (response: T) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function nextEvent<T = unknown>(socket: Socket, event: string, timeoutMs = 4_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (data: T) => {
      clearTimeout(timer);
      resolve(data);
    };
    socket.once(event, handler);
  });
}

async function createSession(socket: Socket) {
  return ack<{
    ok: true;
    session: { id: string; code: string; expiresAt: number };
    peerToken: string;
    inviteToken: string;
    inviteFragment: string;
  }>(socket, 'session:create', { device: DEVICE_SENDER });
}

async function pairDevices(): Promise<{
  sender: Socket;
  receiver: Socket;
  created: Awaited<ReturnType<typeof createSession>>;
  joined: { ok: true; peerToken: string; session: { id: string; code: string } };
}> {
  const sender = await connect();
  const created = await createSession(sender);
  const receiver = await connect();
  const joinedPromise = nextEvent(sender, 'peer:joined');
  const joined = await ack<{ ok: true; peerToken: string; session: { id: string; code: string } }>(
    receiver,
    'session:join',
    {
      code: created.session.code,
      inviteToken: created.inviteFragment.split('.')[1],
      device: DEVICE_RECEIVER,
    },
  );
  const peerEvent = await joinedPromise;
  expect(peerEvent).toMatchObject({ role: 'receiver', peer: { name: DEVICE_RECEIVER.name } });
  return { sender, receiver, created, joined };
}

beforeEach(async () => {
  await startServer();
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await server.close();
});

describe('Socket.IO pairing and signaling', () => {
  it('creates a session, joins by invite, and relays SDP + ICE both ways', async () => {
    const { sender, receiver, created, joined } = await pairDevices();

    const offerSeen = nextEvent<{ from: string; payload: unknown }>(receiver, 'signal');
    const offerAck = await ack(sender, 'signal', {
      sessionId: created.session.id,
      peerToken: created.peerToken,
      payload: { kind: 'description', description: { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n' } },
    });
    expect(offerAck).toEqual({ ok: true });
    const offer = await offerSeen;
    expect(offer.from).toBe('sender');
    expect(offer.payload).toMatchObject({ kind: 'description', description: { type: 'offer' } });

    const answerSeen = nextEvent<{ from: string; payload: { description: { type: string } } }>(sender, 'signal');
    await ack(receiver, 'signal', {
      sessionId: created.session.id,
      peerToken: joined.peerToken,
      payload: { kind: 'description', description: { type: 'answer', sdp: 'v=0\r\na=answer\r\n' } },
    });
    const answer = await answerSeen;
    expect(answer.from).toBe('receiver');
    expect(answer.payload.description.type).toBe('answer');

    const candidateSeen = nextEvent<{ payload: { candidate: { candidate: string } } }>(receiver, 'signal');
    await ack(sender, 'signal', {
      sessionId: created.session.id,
      peerToken: created.peerToken,
      payload: { kind: 'candidate', candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 5000 typ host' } },
    });
    const candidate = await candidateSeen;
    expect(candidate.payload.candidate.candidate).toContain('candidate:1');
  });

  it('rejects a receiver that tries to send an offer', async () => {
    const { receiver, created, joined } = await pairDevices();
    const response = await ack<{ ok: false; error: { code: string } }>(receiver, 'signal', {
      sessionId: created.session.id,
      peerToken: joined.peerToken,
      payload: { kind: 'description', description: { type: 'offer', sdp: 'v=0' } },
    });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe('INVALID_INPUT');
  });

  it('rejects unauthenticated peers and cross-session signaling', async () => {
    const { sender, receiver, created, joined } = await pairDevices();
    const outsider = await connect();

    const noBinding = await ack<{ ok: false; error: { code: string } }>(outsider, 'signal', {
      sessionId: created.session.id,
      peerToken: joined.peerToken,
      payload: { kind: 'candidate', candidate: { candidate: 'candidate:1' } },
    });
    expect(noBinding.error.code).toBe('UNAUTHORIZED');

    const bogusToken = await ack<{ ok: false; error: { code: string } }>(receiver, 'signal', {
      sessionId: created.session.id,
      peerToken: 'A'.repeat(43),
      payload: { kind: 'candidate', candidate: { candidate: 'candidate:1' } },
    });
    expect(bogusToken.error.code).toBe('UNAUTHORIZED');

    const secondSender = await connect();
    const secondSession = await createSession(secondSender);
    const crossSession = await ack<{ ok: false; error: { code: string } }>(receiver, 'signal', {
      sessionId: secondSession.session.id,
      peerToken: joined.peerToken,
      payload: { kind: 'candidate', candidate: { candidate: 'candidate:2' } },
    });
    expect(crossSession.error.code).toBe('UNAUTHORIZED');
    expect(secondSession.ok).toBe(true);
    expect(sender.connected).toBe(true);
  });

  it('rejects an invalid invite token but accepts the numeric code', async () => {
    const sender = await connect();
    const created = await createSession(sender);
    const receiver = await connect();
    const bad = await ack<{ ok: false; error: { code: string } }>(receiver, 'session:join', {
      code: created.session.code,
      inviteToken: 'c'.repeat(43),
      device: DEVICE_RECEIVER,
    });
    expect(bad.ok).toBe(false);
    expect(bad.error.code).toBe('INVITE_INVALID');

    const joinedPromise = nextEvent(sender, 'peer:joined');
    const good = await ack<{ ok: true; role: string }>(receiver, 'session:join', {
      code: created.session.code,
      device: DEVICE_RECEIVER,
    });
    expect(good.ok).toBe(true);
    await joinedPromise;
  });

  it('rejects a third device when a receiver is already connected', async () => {
    const { created } = await pairDevices();
    const third = await connect();
    const response = await ack<{ ok: false; error: { code: string } }>(third, 'session:join', {
      code: created.session.code,
      device: DEVICE_RECEIVER,
    });
    expect(response.error.code).toBe('SESSION_FULL');
  });

  it('notifies the sender when the receiver drops and accepts a token-authenticated resume', async () => {
    const { sender, receiver, created, joined } = await pairDevices();
    const leftSeen = nextEvent<{ role: string }>(sender, 'peer:left');
    const peerToken = joined.peerToken;
    receiver.close();
    const left = await leftSeen;
    expect(left.role).toBe('receiver');

    const resumedSocket = await connect();
    const resumedSeen = nextEvent<{ role: string }>(sender, 'peer:resumed');
    const resumed = await ack<{ ok: true; role: string }>(resumedSocket, 'session:resume', {
      sessionId: created.session.id,
      role: 'receiver',
      peerToken,
      device: DEVICE_RECEIVER,
    });
    expect(resumed.ok).toBe(true);
    const notice = await resumedSeen;
    expect(notice.role).toBe('receiver');

    const signalSeen = nextEvent<{ from: string }>(resumedSocket, 'signal');
    await ack(sender, 'signal', {
      sessionId: created.session.id,
      peerToken: created.peerToken,
      payload: { kind: 'candidate', candidate: { candidate: 'candidate:9' } },
    });
    expect((await signalSeen).from).toBe('sender');
  });

  it('ends the session for both peers when the sender cancels', async () => {
    const { sender, receiver, created } = await pairDevices();
    const senderEnded = nextEvent<{ reason: string }>(sender, 'session:ended');
    const receiverEnded = nextEvent<{ reason: string }>(receiver, 'session:ended');
    const response = await ack(sender, 'session:cancel', {
      sessionId: created.session.id,
      peerToken: created.peerToken,
    });
    expect(response).toEqual({ ok: true });
    expect((await senderEnded).reason).toBe('cancelled');
    expect((await receiverEnded).reason).toBe('cancelled');
    expect(server.sessions.get(created.session.id)).toBeUndefined();
  });

  it('notifies peers when a session expires', async () => {
    const { sender, receiver, created } = await pairDevices();
    const senderEnded = nextEvent<{ reason: string }>(sender, 'session:ended');
    const receiverEnded = nextEvent<{ reason: string }>(receiver, 'session:ended');
    const session = server.sessions.get(created.session.id)!;
    session.expiresAt = Date.now() - 1;
    const ended = server.sessions.sweep();
    server.signaling.handleEnded(ended[0]!);
    expect((await senderEnded).reason).toBe('expired');
    expect((await receiverEnded).reason).toBe('expired');
  });

  it('rejects handshakes from disallowed origins', async () => {
    await expect(connect('http://evil.example')).rejects.toThrow();
  });

  it('rate limits session creation per IP', async () => {
    await server.close();
    server = createDrooitServer({
      config,
      logger: silentLogger,
      createRateLimiter: (options) =>
        new SlidingWindowRateLimiter({
          ...options,
          limit: options.limit === SESSION_CREATE_RATE.limit ? 2 : options.limit,
        }),
    });
    port = await server.listen(0, '127.0.0.1');

    const first = await connect();
    const second = await connect();
    const third = await connect();
    expect((await createSession(first)).ok).toBe(true);
    expect((await createSession(second)).ok).toBe(true);
    const limited = await ack<{ ok: false; error: { code: string; message: string } }>(
      third,
      'session:create',
      { device: DEVICE_SENDER },
    );
    expect(limited.ok).toBe(false);
    expect(limited.error.code).toBe('RATE_LIMITED');
    expect(limited.error.message).toContain('Try again');
  });
});

describe('HTTP endpoints', () => {
  it('serves health and public config without secrets', async () => {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { origin: ORIGIN } });
    expect(health.status).toBe(200);
    const healthBody = (await health.json()) as Record<string, unknown>;
    expect(healthBody.status).toBe('ok');
    expect(typeof healthBody.activeSessions).toBe('number');
    expect(JSON.stringify(healthBody)).not.toContain('peerToken');

    const configResponse = await fetch(`http://127.0.0.1:${port}/api/config`, {
      headers: { origin: ORIGIN },
    });
    const configBody = (await configResponse.json()) as {
      iceServers: Array<{ urls: unknown }>;
      turnEnabled: boolean;
      limits: { chunkSize: number };
    };
    expect(configBody.iceServers.length).toBeGreaterThan(0);
    expect(configBody.turnEnabled).toBe(false);
    expect(configBody.limits.chunkSize).toBe(256 * 1024);
    expect(JSON.stringify(configBody)).not.toContain('secret');
  });

  it('blocks API requests from foreign origins', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { origin: 'http://evil.example' },
    });
    expect(response.status).toBe(403);
  });

  it('returns JSON for unknown API routes', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/nope`, { headers: { origin: ORIGIN } });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_INPUT');
  });
});
