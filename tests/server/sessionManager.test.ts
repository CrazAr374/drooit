import { describe, expect, it, vi } from 'vitest';
import { SessionManager } from '../../server/src/sessions/sessionManager.js';
import { PairingService } from '../../server/src/sessions/pairingService.js';
import { generatePairingCode, isPairingCode, safeEqual } from '../../server/src/security/tokens.js';
import { AppError } from '../../server/src/errors.js';

const device = { name: 'Test laptop', platform: 'Windows', browser: 'Chrome' };

function createClock(start = 1_700_000_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function setup(options: { ttlMs?: number; connectedTtlMs?: number } = {}) {
  const clock = createClock();
  const onEnded = vi.fn();
  const sessions = new SessionManager({
    ttlMs: options.ttlMs ?? 60_000,
    connectedTtlMs: options.connectedTtlMs ?? 120_000,
    absoluteTtlMs: 3_600_000,
    now: clock.now,
    onEnded,
  });
  const pairing = new PairingService(sessions);
  return { sessions, pairing, clock, onEnded };
}

describe('pairing codes and tokens', () => {
  it('generates six-digit codes', () => {
    for (let i = 0; i < 250; i += 1) {
      const code = generatePairingCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(isPairingCode(code)).toBe(true);
    }
    expect(isPairingCode('12345')).toBe(false);
    expect(isPairingCode('abcdef')).toBe(false);
    expect(isPairingCode('1234567')).toBe(false);
  });

  it('compares tokens in constant time without throwing on length mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('SessionManager', () => {
  it('creates a unique, short-lived session with secrets kept out of the snapshot', () => {
    const { sessions } = setup();
    const created = sessions.create(device, 'socket-sender');
    expect(created.session.code).toMatch(/^\d{6}$/);
    expect(created.session.id).toMatch(/^[a-f0-9]{32}$/);
    expect(created.session.status).toBe('waiting');
    expect(created.inviteToken.length).toBeGreaterThanOrEqual(32);
    expect(created.peerToken).not.toBe(created.inviteToken);

    const snapshot = sessions.snapshot(created.session);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain(created.inviteToken);
    expect(serialized).not.toContain(created.peerToken);
    expect(serialized).not.toContain('inviteConsumed');
    expect(snapshot.sender?.name).toBe(device.name);
  });

  it('allocates distinct codes for concurrent sessions', () => {
    const { sessions } = setup();
    const codes = new Set<string>();
    for (let i = 0; i < 200; i += 1) codes.add(sessions.create(device).session.code);
    expect(codes.size).toBe(200);
  });

  it('joins with the one-time invite token and sets a connected deadline', () => {
    const { sessions, clock } = setup();
    const created = sessions.create(device);
    const joined = sessions.joinByCode({
      code: created.session.code,
      inviteToken: created.inviteToken,
      device: { name: 'Phone', platform: 'Android', browser: 'Chrome' },
      socketId: 'socket-receiver',
    });
    expect(joined.session.status).toBe('connected');
    expect(joined.session.receiver?.device.name).toBe('Phone');
    expect(joined.session.inviteConsumed).toBe(true);
    expect(joined.session.expiresAt).toBe(clock.now() + 120_000);

    expect(() =>
      sessions.joinByCode({
        code: created.session.code,
        inviteToken: created.inviteToken,
        device,
        socketId: 'socket-third',
      }),
    ).toThrowError(/already has a connected receiver/);
  });

  it('rejects a bad invite token and invalidates the session after repeated attempts', () => {
    const { sessions } = setup();
    const created = sessions.create(device);
    for (let i = 0; i < 24; i += 1) {
      expect(() =>
        sessions.joinByCode({
          code: created.session.code,
          inviteToken: 'a'.repeat(43),
          device,
          socketId: 'attacker',
        }),
      ).toThrowError(/invitation link is no longer valid/);
    }
    expect(sessions.get(created.session.id)?.joinAttempts).toBe(24);
    expect(() =>
      sessions.joinByCode({
        code: created.session.code,
        inviteToken: 'b'.repeat(43),
        device,
        socketId: 'attacker',
      }),
    ).toThrow();
    expect(sessions.get(created.session.id)).toBeUndefined();
  });

  it('allows joining with only the numeric code', () => {
    const { sessions } = setup();
    const created = sessions.create(device);
    const joined = sessions.joinByCode({
      code: created.session.code,
      device: { name: 'Phone', platform: 'iOS', browser: 'Safari' },
      socketId: 'socket-receiver',
    });
    expect(joined.session.receiver?.device.platform).toBe('iOS');
  });

  it('returns a clear error for an unknown code', () => {
    const { sessions } = setup();
    try {
      sessions.joinByCode({ code: '000000', device, socketId: 'x' });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('INVALID_CODE');
    }
  });

  it('expires waiting sessions and reports them once', () => {
    const { sessions, clock } = setup({ ttlMs: 1_000 });
    const created = sessions.create(device);
    clock.advance(999);
    expect(sessions.sweep()).toHaveLength(0);
    clock.advance(2);
    const ended = sessions.sweep();
    expect(ended).toHaveLength(1);
    expect(ended[0]?.reason).toBe('expired');
    expect(ended[0]?.code).toBe(created.session.code);
    expect(sessions.get(created.session.id)).toBeUndefined();
    expect(sessions.getByCode(created.session.code)).toBeUndefined();
    expect(sessions.sweep()).toHaveLength(0);
  });

  it('refreshes the connected deadline on activity but respects the absolute cap', () => {
    const { sessions, clock } = setup();
    const created = sessions.create(device);
    sessions.joinByCode({ code: created.session.code, device, socketId: 'rx' });
    const session = sessions.get(created.session.id)!;
    clock.advance(60_000);
    sessions.touch(session);
    expect(session.expiresAt).toBe(clock.now() + 120_000);
    clock.advance(3_500_000);
    sessions.touch(session);
    expect(session.expiresAt).toBe(session.absoluteExpiresAt);
  });

  it('authenticates peers and rejects wrong roles or tokens', () => {
    const { pairing } = setup();
    const created = pairing.createSession(device, 'socket-sender');
    expect(() => pairing.authenticate(created.session.id, 'sender', 'wrong-token')).toThrowError(
      /not authorised/,
    );
    const sender = pairing.authenticate(created.session.id, 'sender', created.peerToken);
    expect(sender.role).toBe('sender');
    const receiver = pairing.joinSession({
      code: created.session.code,
      device,
      socketId: 'socket-rx',
    });
    expect(() => pairing.authenticate(created.session.id, 'receiver', created.peerToken)).toThrow();
    expect(pairing.authenticate(created.session.id, 'receiver', receiver.peerToken).role).toBe('receiver');
    expect(() =>
      pairing.assertRole(pairing.authenticate(created.session.id, 'receiver', receiver.peerToken), 'sender'),
    ).toThrowError(/not allowed for your role/);
  });

  it('lets only the sender cancel the session', () => {
    const { sessions, onEnded } = setup();
    const created = sessions.create(device, 'sender-socket');
    sessions.joinByCode({ code: created.session.code, device, socketId: 'receiver-socket' });
    const receiver = sessions.get(created.session.id)!.receiver!;
    sessions.cancel(created.session.id, 'receiver');
    expect(sessions.get(created.session.id)).toBeDefined();
    expect(receiver.socketId).toBeNull();
    expect(onEnded).not.toHaveBeenCalled();

    sessions.cancel(created.session.id, 'sender');
    expect(sessions.get(created.session.id)).toBeUndefined();
    expect(onEnded).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'cancelled', senderSocketId: 'sender-socket' }),
    );
  });

  it('supports resuming a detached receiver with its peer token', () => {
    const { sessions } = setup();
    const created = sessions.create(device, 'sender-socket');
    const joined = sessions.joinByCode({ code: created.session.code, device, socketId: 'old-socket' });
    sessions.detachSocket('old-socket');
    const resumed = sessions.resume({
      sessionId: created.session.id,
      role: 'receiver',
      token: joined.peerToken,
      socketId: 'new-socket',
    });
    expect(resumed.session.receiver?.socketId).toBe('new-socket');
    expect(resumed.session.receiver?.token).toBe(joined.peerToken);
  });

  it('never exceeds the configured session capacity', () => {
    const { sessions } = setup();
    const limited = new SessionManager({ maxSessions: 2, now: Date.now });
    limited.create(device);
    limited.create(device);
    expect(() => limited.create(device)).toThrowError(/at capacity/);
    expect(sessions.size).toBe(0);
  });

  it('refuses expired and cancelled sessions', () => {
    const { sessions, clock } = setup({ ttlMs: 100 });
    const created = sessions.create(device);
    clock.advance(200);
    expect(() => sessions.require(created.session.id)).toThrowError(/expired/);

    const second = sessions.create(device);
    sessions.cancel(second.session.id, 'sender');
    expect(() => sessions.require(second.session.id)).toThrowError(/no longer exists/);
  });
});
