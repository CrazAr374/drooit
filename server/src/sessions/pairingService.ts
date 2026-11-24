import type { DeviceInfo } from '@shared/types.js';
import { AppError } from '../errors.js';
import type { DeviceInput } from '../validation.js';
import type { SessionManager, PeerRecord, SessionRecord } from './sessionManager.js';

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Peer-supplied device labels are display-only, but still normalised and bounded. */
export function sanitizeDevice(device: DeviceInput): DeviceInfo {
  const clean = (value: string, fallback: string, max: number): string => {
    const normalized = value
      .normalize('NFC')
      .replace(CONTROL_CHARS, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
    return normalized.length > 0 ? normalized : fallback;
  };
  return {
    name: clean(device.name, 'Unknown device', 60),
    platform: clean(device.platform, 'Unknown', 32),
    browser: clean(device.browser, 'Browser', 32),
  };
}

export interface CreatedSession {
  session: SessionRecord;
  peerToken: string;
  inviteToken: string;
  inviteFragment: string;
}

/**
 * Pairing rules live here: session creation, invite/one-time-code validation and
 * peer authentication. The session store stays a pure data structure.
 */
export class PairingService {
  constructor(private readonly sessions: SessionManager) {}

  createSession(device: DeviceInput, socketId: string): CreatedSession {
    const result = this.sessions.create(sanitizeDevice(device), socketId);
    return {
      session: result.session,
      peerToken: result.peerToken,
      inviteToken: result.inviteToken,
      // Hash fragment keeps the secret out of server logs and Referer headers.
      inviteFragment: `${result.session.code}.${result.inviteToken}`,
    };
  }

  joinSession(params: {
    code: string;
    inviteToken?: string;
    device: DeviceInput;
    socketId: string;
  }): { session: SessionRecord; peerToken: string } {
    const result = this.sessions.joinByCode({
      code: params.code,
      inviteToken: params.inviteToken,
      device: sanitizeDevice(params.device),
      socketId: params.socketId,
    });
    return { session: result.session, peerToken: result.peerToken };
  }

  resumeSession(params: {
    sessionId: string;
    role: 'sender' | 'receiver';
    peerToken: string;
    socketId: string;
    device?: DeviceInput;
  }): { session: SessionRecord; peer: PeerRecord } {
    return this.sessions.resume({
      sessionId: params.sessionId,
      role: params.role,
      token: params.peerToken,
      socketId: params.socketId,
      device: params.device ? sanitizeDevice(params.device) : undefined,
    });
  }

  authenticate(sessionId: string, role: 'sender' | 'receiver', peerToken: string): PeerRecord {
    return this.sessions.verifyPeer(sessionId, role, peerToken);
  }

  assertRole(peer: PeerRecord, expected: 'sender' | 'receiver'): void {
    if (peer.role !== expected) {
      throw new AppError('UNAUTHORIZED', 'This action is not allowed for your role.', false);
    }
  }
}
