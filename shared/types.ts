export type SessionRole = 'sender' | 'receiver';

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_CODE'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXPIRED'
  | 'SESSION_FULL'
  | 'SESSION_CANCELLED'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'INVITE_INVALID'
  | 'PEER_DISCONNECTED'
  | 'INTERNAL';

export interface AppErrorPayload {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export interface DeviceInfo {
  /** User-visible label, e.g. "Atharva's MacBook". Never trusted for auth. */
  name: string;
  /** Coarse platform label, e.g. "macOS", "Android". */
  platform: string;
  /** Coarse browser label, e.g. "Safari". */
  browser: string;
}

export type SessionStatus = 'waiting' | 'connected' | 'cancelled' | 'expired';

export interface PeerSnapshot {
  peerId: string;
  device: DeviceInfo;
  role: SessionRole;
  joinedAt: number;
}

export interface SessionSnapshot {
  id: string;
  code: string;
  status: SessionStatus;
  createdAt: number;
  expiresAt: number;
  maxPeers?: number;
  host?: PeerSnapshot;
  peers?: PeerSnapshot[];
  sender: DeviceInfo | null;
  receiver: DeviceInfo | null;
}

export interface SessionCreateResult {
  session: SessionSnapshot;
  peerId?: string;
  /** Secret held by the sender for reconnects / lifecycle events. Never in the QR. */
  peerToken: string;
  /** One-time secret embedded in the QR invitation. Consumed by the first successful join. */
  inviteToken: string;
  /** Hash fragment payload appended to /join — kept out of server logs. */
  inviteFragment: string;
}

export interface SessionJoinResult {
  session: SessionSnapshot;
  peerToken: string;
  role: SessionRole;
  peerId?: string;
}

export interface ChatMessage {
  id: string;
  senderPeerId: string;
  senderName: string;
  timestamp: number;
  kind: 'text' | 'voice' | 'file';
  text?: string;
  audioPayloadBase64?: string;
  audioDurationSeconds?: number;
  files?: SharedFileMeta[];
  folderRef?: string;
}

export type Ack<T> = ({ ok: true } & T) | { ok: false; error: AppErrorPayload };

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface PublicConfig {
  protocolVersion: number;
  iceServers: IceServerConfig[];
  turnEnabled: boolean;
  limits: {
    maxFiles: number;
    maxFileSizeBytes: number;
    maxSessionBytes: number;
    chunkSize: number;
  };
  sessionTtlMs: number;
}

/**
 * Structural equivalents of `RTCSessionDescriptionInit` / `RTCIceCandidateInit`.
 * The server build has no DOM lib, and the browser types are assignable to these.
 */
export interface SerializedDescription {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

export interface SerializedCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

/** Minimal description of an SDP blob or ICE candidate, as exchanged over signaling. */
export type WireSignalPayload =
  | { kind: 'description'; description: SerializedDescription }
  | { kind: 'candidate'; candidate: SerializedCandidate };

export interface SharedFileMeta {
  index: number;
  name: string;
  relativePath: string;
  size: number;
  mime: string;
  lastModified: number;
}

export interface SocketErrorEvent {
  code: ErrorCode;
  message: string;
  retryable?: boolean;
}
