import { create } from 'zustand';
import QRCode from 'qrcode';
import { zipSync } from 'fflate';
import type {
  DeviceInfo,
  WireSignalPayload,
  PeerSnapshot,
  ChatMessage,
  SessionSnapshot,
} from '@shared/types.js';
import type {
  ControlMessage,
  SharedFileMeta,
} from '@shared/protocol.js';
import {
  getLocalDeviceInfo,
  getStoredDeviceName,
  saveDeviceName,
} from '../lib/device.js';
import { SignalingClient } from '../lib/signaling/client.js';
import { WebRtcConnection } from '../lib/webrtc/connection.js';
import { createFileSources } from '../lib/transfer/fileSource.js';
import type { SinkFactory } from '../lib/transfer/types.js';
import { createDefaultSinkFactory } from '../lib/transfer/sinkFactory.js';
import { SenderEngine } from '../lib/transfer/sender.js';
import { ReceiverEngine } from '../lib/transfer/receiver.js';
import type { AudioRecordingResult } from '../lib/audio/recorder.js';
import type {
  ReceivedFile,
  ReceiverSnapshot,
  SenderSnapshot,
} from '../lib/transfer/types.js';

export interface TransferStoreState {
  // Theme & Preferences
  theme: 'dark' | 'light';
  deviceName: string;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  setDeviceName: (name: string) => void;

  // Session & Connection
  role: 'idle' | 'sender' | 'receiver';
  sessionId: string | null;
  sessionCode: string | null;
  sessionExpiresAt: number | null;
  inviteToken: string | null;
  inviteUrl: string | null;
  qrDataUrl: string | null;
  peerDevice: DeviceInfo | null;
  connectionState: 'idle' | 'signaling' | 'connecting' | 'connected' | 'disconnected' | 'failed';
  connectionMode: 'unknown' | 'direct' | 'relay';
  error: { code: string; message: string } | null;

  // Multi-Peer Room & Chat
  myPeerId: string | null;
  isHost: boolean;
  peers: PeerSnapshot[];
  chatMessages: ChatMessage[];
  sendChatMessage: (content: string, folderRef?: string, attachedFiles?: File[]) => Promise<void>;
  sendVoiceMessage: (result: AudioRecordingResult) => Promise<void>;
  disconnectRoom: () => void;
  reconnectRoom: () => Promise<void>;
  removePeerFromRoom: (peerId: string) => void;

  // Sender Data
  selectedFiles: File[];
  senderSnapshot: SenderSnapshot | null;
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;

  // Receiver Data
  receiverSnapshot: ReceiverSnapshot | null;
  incomingReviewFiles: SharedFileMeta[] | null;
  receivedFiles: ReceivedFile[];

  // Actions
  startSenderSession: () => Promise<void>;
  joinByCode: (code: string) => Promise<void>;
  joinByInvite: (inviteToken: string) => Promise<void>;
  acceptTransfer: (selectedIndexes?: number[]) => void;
  rejectTransfer: (reason?: string) => void;
  pauseTransfer: () => void;
  resumeTransfer: () => void;
  cancelTransfer: () => void;
  resetSession: () => void;
  downloadReceivedFile: (fileIndex: number) => void;
  downloadAllZip: () => void;
}

// Active singleton instances for signaling, connection, and transfer engines
let activeSignaling: SignalingClient | null = null;
let activeWebRtc: WebRtcConnection | null = null;
let activeSenderEngine: SenderEngine | null = null;
let activeReceiverEngine: ReceiverEngine | null = null;
let activeSinkFactory: SinkFactory | null = null;
let activePeerToken: string | null = null;

function cleanupEngines(): void {
  if (activeSenderEngine) {
    activeSenderEngine.cancel();
    activeSenderEngine = null;
  }
  if (activeReceiverEngine) {
    activeReceiverEngine.dispose();
    activeReceiverEngine = null;
  }
  if (activeSinkFactory) {
    void activeSinkFactory.cleanup();
    activeSinkFactory = null;
  }
  if (activeWebRtc) {
    activeWebRtc.close();
    activeWebRtc = null;
  }
  if (activeSignaling) {
    activeSignaling.disconnect();
    activeSignaling = null;
  }
  activePeerToken = null;
}

export const useTransferStore = create<TransferStoreState>((set, get) => {
  // Initialize theme
  const initialTheme: 'dark' | 'light' =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'dark';

  return {
    theme: initialTheme,
    deviceName: getStoredDeviceName(),

    setTheme: (theme) => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      try {
        localStorage.setItem('drooit-preferences', JSON.stringify({ state: { theme } }));
      } catch {}
      set({ theme });
    },

    toggleTheme: () => {
      const nextTheme = get().theme === 'dark' ? 'light' : 'dark';
      get().setTheme(nextTheme);
    },

    setDeviceName: (name) => {
      saveDeviceName(name);
      set({ deviceName: name });
    },

    role: 'idle',
    sessionId: null,
    sessionCode: null,
    sessionExpiresAt: null,
    inviteToken: null,
    inviteUrl: null,
    qrDataUrl: null,
    peerDevice: null,
    connectionState: 'idle',
    connectionMode: 'unknown',
    error: null,

    // Multi-Peer Room & Chat
    myPeerId: null,
    isHost: false,
    peers: [],
    chatMessages: [],

    selectedFiles: [],
    senderSnapshot: null,

    receiverSnapshot: null,
    incomingReviewFiles: null,
    receivedFiles: [],

    addFiles: (newFiles) => {
      const current = get().selectedFiles;
      // Filter duplicate names if same size
      const filtered = newFiles.filter(
        (nf) => !current.some((cf) => cf.name === nf.name && cf.size === nf.size),
      );
      set({ selectedFiles: [...current, ...filtered] });
    },

    removeFile: (index) => {
      const current = [...get().selectedFiles];
      current.splice(index, 1);
      set({ selectedFiles: current });
    },

    clearFiles: () => {
      set({ selectedFiles: [] });
    },

    startSenderSession: async () => {
      const { selectedFiles } = get();
      if (selectedFiles.length === 0) {
        set({ error: { code: 'INVALID_INPUT', message: 'Please select at least one file to send.' } });
        return;
      }

      cleanupEngines();
      set({
        role: 'sender',
        connectionState: 'signaling',
        error: null,
        peerDevice: null,
        senderSnapshot: null,
      });

      try {
        const device = getLocalDeviceInfo();
        const signaling = new SignalingClient();
        activeSignaling = signaling;

        const webrtc = new WebRtcConnection(true);
        activeWebRtc = webrtc;

        // Wire signaling events
        signaling.setEvents({
          onPeerJoined: async (peer: DeviceInfo, session: SessionSnapshot, peerId?: string) => {
            const currentPeers = session?.peers || [
              ...get().peers,
              {
                peerId: peerId || 'peer',
                role: 'receiver',
                device: peer,
                isConnected: true,
                joinedAt: Date.now(),
              },
            ];
            const sysMsg: ChatMessage = {
              id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              senderPeerId: 'system',
              senderName: 'System',
              timestamp: Date.now(),
              kind: 'text',
              text: `${peer.name || 'A new device'} joined the room.`,
            };
            set((state) => ({
              peerDevice: peer,
              peers: currentPeers,
              chatMessages: [...state.chatMessages, sysMsg],
              connectionState: 'connecting',
            }));

            // Start WebRTC offer now that receiver is in the room
            try {
              await webrtc.init();
              await webrtc.startOffer();
            } catch (err) {
              set({
                error: {
                  code: 'INTERNAL',
                  message: (err as Error).message || 'Failed to start WebRTC offer',
                },
              });
            }
          },
          onSignal: async (payload: WireSignalPayload) => {
            try {
              await webrtc.handleSignal(payload);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error('Error handling remote signal:', err);
            }
          },
          onSessionEnded: (reason: string) => {
            set({
              connectionState: 'disconnected',
              error: { code: 'SESSION_EXPIRED', message: `Session ended: ${reason}` },
            });
          },
          onPeerLeft: (_role, peerId) => {
            const nextPeers = get().peers.filter((p) => (peerId ? p.peerId !== peerId : false));
            const sysMsg: ChatMessage = {
              id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              senderPeerId: 'system',
              senderName: 'System',
              timestamp: Date.now(),
              kind: 'text',
              text: 'A device left the room.',
            };
            set((state) => ({
              peers: nextPeers,
              chatMessages: [...state.chatMessages, sysMsg],
              connectionState: nextPeers.length > 0 ? state.connectionState : 'disconnected',
            }));
          },
          onError: (err) => {
            set({ error: err });
          },
        });

        // Wire WebRTC events
        webrtc.setEvents({
          onSignalNeeded: (payload) => {
            const { sessionId } = get();
            if (sessionId && activePeerToken) {
              void signaling.sendSignal({
                sessionId,
                peerToken: activePeerToken,
                payload,
              });
            }
          },
          onConnectionStateChange: (state) => {
            if (state === 'connected') {
              set({ connectionState: 'connected' });
            } else if (state === 'failed' || state === 'closed') {
              set({ connectionState: 'failed' });
            } else if (state === 'disconnected') {
              set({ connectionState: 'disconnected' });
            }
          },
          onModeChange: (mode) => {
            set({ connectionMode: mode });
          },
          onReady: () => {
            set({ connectionState: 'connected' });
            // Both data channels open! Instantiate and start SenderEngine
            const fileSources = createFileSources(get().selectedFiles);
            const engine = new SenderEngine({
              sources: fileSources.map((f) => f.source),
              device: getLocalDeviceInfo(),
              channel: webrtc,
              onUpdate: (snapshot) => {
                set({ senderSnapshot: snapshot });
              },
            });
            activeSenderEngine = engine;
            void engine.start();
          },
          onControlMessage: (message: ControlMessage) => {
            if (message.type === 'chat:message') {
              set((state) => ({
                chatMessages: [
                  ...state.chatMessages,
                  {
                    id: message.id,
                    senderPeerId: message.senderPeerId,
                    senderName: message.senderName,
                    timestamp: message.timestamp,
                    kind: message.files && message.files.length > 0 ? 'file' : 'text',
                    text: message.content,
                    folderRef: message.folderRef,
                    files: message.files,
                  },
                ],
              }));
            } else if (message.type === 'chat:voice') {
              set((state) => ({
                chatMessages: [
                  ...state.chatMessages,
                  {
                    id: message.id,
                    senderPeerId: message.senderPeerId,
                    senderName: message.senderName,
                    timestamp: message.timestamp,
                    kind: 'voice',
                    audioPayloadBase64: message.audioPayloadBase64,
                    audioDurationSeconds: message.durationSeconds,
                  },
                ],
              }));
            } else if (message.type === 'peer:leave') {
              set((state) => ({
                peers: state.peers.filter((p) => p.peerId !== message.peerId),
                chatMessages: [
                  ...state.chatMessages,
                  {
                    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    senderPeerId: 'system',
                    senderName: 'System',
                    timestamp: Date.now(),
                    kind: 'text',
                    text: message.reason || 'A device left the room.',
                  },
                ],
              }));
            } else if (activeSenderEngine) {
              activeSenderEngine.handleControl(message);
            }
          },
        });

        // Create session on server
        const result = await signaling.createSession(device, 8);
        activePeerToken = result.peerToken;

        // Construct invitation URL with clean query parameters
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const inviteUrl = `${origin}/?join=${result.session.code}&token=${result.inviteToken}`;
        const qrDataUrl = await QRCode.toDataURL(inviteUrl, {
          margin: 2,
          width: 320,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });

        set({
          sessionId: result.session.id,
          sessionCode: result.session.code,
          sessionExpiresAt: result.session.expiresAt,
          inviteToken: result.inviteToken,
          inviteUrl,
          qrDataUrl,
          isHost: true,
          myPeerId: result.peerId || 'host',
          peers: result.session.peers || [],
          connectionState: 'signaling',
        });
      } catch (err) {
        set({
          connectionState: 'failed',
          error: {
            code: 'INTERNAL',
            message: (err as Error).message || 'Failed to initialize session',
          },
        });
      }
    },

    joinByCode: async (code: string) => {
      cleanupEngines();
      set({
        role: 'receiver',
        connectionState: 'signaling',
        error: null,
        peerDevice: null,
        receiverSnapshot: null,
        incomingReviewFiles: null,
        receivedFiles: [],
      });

      try {
        const device = getLocalDeviceInfo();
        const signaling = new SignalingClient();
        activeSignaling = signaling;

        const webrtc = new WebRtcConnection(false);
        activeWebRtc = webrtc;

        // Wire signaling events
        signaling.setEvents({
          onPeerJoined: (peer: DeviceInfo, session: SessionSnapshot, peerId?: string) => {
            const currentPeers = session?.peers || [
              ...get().peers,
              {
                peerId: peerId || 'peer',
                role: 'receiver',
                device: peer,
                isConnected: true,
                joinedAt: Date.now(),
              },
            ];
            const sysMsg: ChatMessage = {
              id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              senderPeerId: 'system',
              senderName: 'System',
              timestamp: Date.now(),
              kind: 'text',
              text: `${peer.name || 'A new device'} joined the room.`,
            };
            set((state) => ({
              peers: currentPeers,
              chatMessages: [...state.chatMessages, sysMsg],
            }));
          },
          onSignal: async (payload: WireSignalPayload) => {
            try {
              await webrtc.handleSignal(payload);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error('Error handling remote signal:', err);
            }
          },
          onSessionEnded: (reason: string) => {
            set({
              connectionState: 'disconnected',
              error: { code: 'SESSION_EXPIRED', message: `Session ended: ${reason}` },
            });
          },
          onPeerLeft: (_role, peerId) => {
            const nextPeers = get().peers.filter((p) => (peerId ? p.peerId !== peerId : false));
            const sysMsg: ChatMessage = {
              id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              senderPeerId: 'system',
              senderName: 'System',
              timestamp: Date.now(),
              kind: 'text',
              text: 'A device left the room.',
            };
            set((state) => ({
              peers: nextPeers,
              chatMessages: [...state.chatMessages, sysMsg],
              connectionState: nextPeers.length > 0 ? state.connectionState : 'disconnected',
            }));
          },
          onError: (err) => {
            set({ error: err });
          },
        });

        // Wire WebRTC events
        webrtc.setEvents({
          onSignalNeeded: (payload) => {
            const { sessionId } = get();
            if (sessionId && activePeerToken) {
              void signaling.sendSignal({
                sessionId,
                peerToken: activePeerToken,
                payload,
              });
            }
          },
          onConnectionStateChange: (state) => {
            if (state === 'connected') {
              set({ connectionState: 'connected' });
            } else if (state === 'failed' || state === 'closed') {
              set({ connectionState: 'failed' });
            } else if (state === 'disconnected') {
              set({ connectionState: 'disconnected' });
            }
          },
          onModeChange: (mode) => {
            set({ connectionMode: mode });
          },
          onReady: () => {
            set({ connectionState: 'connected' });
            // Both data channels open! Instantiate ReceiverEngine
            const sinkFactory = createDefaultSinkFactory();
            activeSinkFactory = sinkFactory;

            const engine = new ReceiverEngine({
              transferId: get().sessionId || 'transfer',
              sinkFactory,
              channel: webrtc,
              onMeta: (files, peerName) => {
                set({
                  incomingReviewFiles: files,
                  peerDevice: peerName ? { name: peerName, platform: '', browser: '' } : null,
                });
              },
              onUpdate: (snapshot) => {
                set({ receiverSnapshot: snapshot });
              },
              onFileComplete: (file: ReceivedFile) => {
                set((state) => ({ receivedFiles: [...state.receivedFiles, file] }));
              },
              onError: (err) => {
                set({ error: err });
              },
            });
            activeReceiverEngine = engine;
          },
          onControlMessage: (message: ControlMessage) => {
            if (message.type === 'chat:message') {
              set((state) => ({
                chatMessages: [
                  ...state.chatMessages,
                  {
                    id: message.id,
                    senderPeerId: message.senderPeerId,
                    senderName: message.senderName,
                    timestamp: message.timestamp,
                    kind: message.files && message.files.length > 0 ? 'file' : 'text',
                    text: message.content,
                    folderRef: message.folderRef,
                    files: message.files,
                  },
                ],
              }));
            } else if (message.type === 'chat:voice') {
              set((state) => ({
                chatMessages: [
                  ...state.chatMessages,
                  {
                    id: message.id,
                    senderPeerId: message.senderPeerId,
                    senderName: message.senderName,
                    timestamp: message.timestamp,
                    kind: 'voice',
                    audioPayloadBase64: message.audioPayloadBase64,
                    audioDurationSeconds: message.durationSeconds,
                  },
                ],
              }));
            } else if (message.type === 'peer:leave') {
              set((state) => ({
                peers: state.peers.filter((p) => p.peerId !== message.peerId),
                chatMessages: [
                  ...state.chatMessages,
                  {
                    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    senderPeerId: 'system',
                    senderName: 'System',
                    timestamp: Date.now(),
                    kind: 'text',
                    text: message.reason || 'A device left the room.',
                  },
                ],
              }));
            } else if (activeReceiverEngine) {
              activeReceiverEngine.handleControl(message);
            }
          },
          onBinaryFrame: (frame: ArrayBuffer) => {
            if (activeReceiverEngine) {
              activeReceiverEngine.handleBinary(frame);
            }
          },
        });

        // Initialize WebRTC as answerer
        await webrtc.init();

        // Join session by code
        const result = await signaling.joinSession({ device, code: code.trim() });
        activePeerToken = result.peerToken;

        set({
          sessionId: result.session.id,
          sessionCode: result.session.code,
          sessionExpiresAt: result.session.expiresAt,
          peerDevice: result.session.sender,
          isHost: false,
          myPeerId: result.peerId || 'receiver',
          peers: result.session.peers || [],
          connectionState: 'connecting',
        });
      } catch (err) {
        set({
          connectionState: 'failed',
          error: {
            code: 'INVALID_CODE',
            message: (err as Error).message || 'Failed to join session. Please check the code.',
          },
        });
      }
    },

    joinByInvite: async (inviteToken: string) => {
      cleanupEngines();
      set({
        role: 'receiver',
        connectionState: 'signaling',
        error: null,
        peerDevice: null,
        receiverSnapshot: null,
        incomingReviewFiles: null,
        receivedFiles: [],
      });

      try {
        const device = getLocalDeviceInfo();
        const signaling = new SignalingClient();
        activeSignaling = signaling;

        const webrtc = new WebRtcConnection(false);
        activeWebRtc = webrtc;

        // Wire signaling events
        signaling.setEvents({
          onPeerJoined: (peer: DeviceInfo, session: SessionSnapshot, peerId?: string) => {
            const currentPeers = session?.peers || [
              ...get().peers,
              {
                peerId: peerId || 'peer',
                role: 'receiver',
                device: peer,
                isConnected: true,
                joinedAt: Date.now(),
              },
            ];
            const sysMsg: ChatMessage = {
              id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              senderPeerId: 'system',
              senderName: 'System',
              timestamp: Date.now(),
              kind: 'text',
              text: `${peer.name || 'A new device'} joined the room.`,
            };
            set((state) => ({
              peers: currentPeers,
              chatMessages: [...state.chatMessages, sysMsg],
            }));
          },
          onSignal: async (payload: WireSignalPayload) => {
            try {
              await webrtc.handleSignal(payload);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error('Error handling remote signal:', err);
            }
          },
          onSessionEnded: (reason: string) => {
            set({
              connectionState: 'disconnected',
              error: { code: 'SESSION_EXPIRED', message: `Session ended: ${reason}` },
            });
          },
          onPeerLeft: (_role, peerId) => {
            const nextPeers = get().peers.filter((p) => (peerId ? p.peerId !== peerId : false));
            const sysMsg: ChatMessage = {
              id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              senderPeerId: 'system',
              senderName: 'System',
              timestamp: Date.now(),
              kind: 'text',
              text: 'A device left the room.',
            };
            set((state) => ({
              peers: nextPeers,
              chatMessages: [...state.chatMessages, sysMsg],
              connectionState: nextPeers.length > 0 ? state.connectionState : 'disconnected',
            }));
          },
          onError: (err) => {
            set({ error: err });
          },
        });

        // Wire WebRTC events
        webrtc.setEvents({
          onSignalNeeded: (payload) => {
            const { sessionId } = get();
            if (sessionId && activePeerToken) {
              void signaling.sendSignal({
                sessionId,
                peerToken: activePeerToken,
                payload,
              });
            }
          },
          onConnectionStateChange: (state) => {
            if (state === 'connected') {
              set({ connectionState: 'connected' });
            } else if (state === 'failed' || state === 'closed') {
              set({ connectionState: 'failed' });
            } else if (state === 'disconnected') {
              set({ connectionState: 'disconnected' });
            }
          },
          onModeChange: (mode) => {
            set({ connectionMode: mode });
          },
          onReady: () => {
            set({ connectionState: 'connected' });
            const sinkFactory = createDefaultSinkFactory();
            activeSinkFactory = sinkFactory;

            const engine = new ReceiverEngine({
              transferId: get().sessionId || 'transfer',
              sinkFactory,
              channel: webrtc,
              onMeta: (files, peerName) => {
                set({
                  incomingReviewFiles: files,
                  peerDevice: peerName ? { name: peerName, platform: '', browser: '' } : null,
                });
              },
              onUpdate: (snapshot) => {
                set({ receiverSnapshot: snapshot });
              },
              onFileComplete: (file: ReceivedFile) => {
                set((state) => ({ receivedFiles: [...state.receivedFiles, file] }));
              },
              onError: (err) => {
                set({ error: err });
              },
            });
            activeReceiverEngine = engine;
          },
          onControlMessage: (message: ControlMessage) => {
            if (message.type === 'chat:message') {
              set((state) => ({
                chatMessages: [
                  ...state.chatMessages,
                  {
                    id: message.id,
                    senderPeerId: message.senderPeerId,
                    senderName: message.senderName,
                    timestamp: message.timestamp,
                    kind: message.files && message.files.length > 0 ? 'file' : 'text',
                    text: message.content,
                    folderRef: message.folderRef,
                    files: message.files,
                  },
                ],
              }));
            } else if (message.type === 'chat:voice') {
              set((state) => ({
                chatMessages: [
                  ...state.chatMessages,
                  {
                    id: message.id,
                    senderPeerId: message.senderPeerId,
                    senderName: message.senderName,
                    timestamp: message.timestamp,
                    kind: 'voice',
                    audioPayloadBase64: message.audioPayloadBase64,
                    audioDurationSeconds: message.durationSeconds,
                  },
                ],
              }));
            } else if (message.type === 'peer:leave') {
              set((state) => ({
                peers: state.peers.filter((p) => p.peerId !== message.peerId),
                chatMessages: [
                  ...state.chatMessages,
                  {
                    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    senderPeerId: 'system',
                    senderName: 'System',
                    timestamp: Date.now(),
                    kind: 'text',
                    text: message.reason || 'A device left the room.',
                  },
                ],
              }));
            } else if (activeReceiverEngine) {
              activeReceiverEngine.handleControl(message);
            }
          },
          onBinaryFrame: (frame: ArrayBuffer) => {
            if (activeReceiverEngine) {
              activeReceiverEngine.handleBinary(frame);
            }
          },
        });

        await webrtc.init();

        const result = await signaling.joinSession({ device, inviteToken });
        activePeerToken = result.peerToken;

        set({
          sessionId: result.session.id,
          sessionCode: result.session.code,
          sessionExpiresAt: result.session.expiresAt,
          peerDevice: result.session.sender,
          isHost: false,
          myPeerId: result.peerId || 'receiver',
          peers: result.session.peers || [],
          connectionState: 'connecting',
        });
      } catch (err) {
        set({
          connectionState: 'failed',
          error: {
            code: 'INVITE_INVALID',
            message: (err as Error).message || 'Invalid or expired invitation link.',
          },
        });
      }
    },

    acceptTransfer: (selectedIndexes) => {
      if (activeReceiverEngine) {
        activeReceiverEngine.accept(selectedIndexes);
        set({ incomingReviewFiles: null });
      }
    },

    rejectTransfer: (reason) => {
      if (activeReceiverEngine) {
        activeReceiverEngine.reject(reason || 'User declined transfer');
        set({ incomingReviewFiles: null });
      }
    },

    pauseTransfer: () => {
      if (activeSenderEngine) {
        activeSenderEngine.pause();
      }
    },

    resumeTransfer: () => {
      if (activeSenderEngine) {
        activeSenderEngine.resume();
      }
    },

    cancelTransfer: () => {
      const { sessionId } = get();
      if (activeSenderEngine) {
        activeSenderEngine.cancel();
      }
      if (activeReceiverEngine) {
        activeReceiverEngine.cancel();
      }
      if (sessionId && activePeerToken && activeSignaling) {
        void activeSignaling.cancelSession({ sessionId, peerToken: activePeerToken });
      }
      get().resetSession();
    },

    sendChatMessage: async (content, folderRef, attachedFiles) => {
      const myName = get().deviceName || getLocalDeviceInfo().name;
      const myId = get().myPeerId || 'local';
      const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const attachedMeta: SharedFileMeta[] | undefined = attachedFiles?.map((f, idx) => ({
        index: idx,
        name: f.name,
        size: f.size,
        mime: f.type || 'application/octet-stream',
        lastModified: f.lastModified || Date.now(),
        relativePath: (f as { webkitRelativePath?: string }).webkitRelativePath || f.name,
      }));
      const newMsg: ChatMessage = {
        id: msgId,
        senderPeerId: myId,
        senderName: myName,
        timestamp: Date.now(),
        kind: attachedMeta && attachedMeta.length > 0 ? 'file' : 'text',
        text: content,
        folderRef,
        files: attachedMeta,
      };
      set((state) => ({ chatMessages: [...state.chatMessages, newMsg] }));

      const controlMsg: ControlMessage = {
        type: 'chat:message',
        id: msgId,
        senderPeerId: myId,
        senderName: myName,
        timestamp: Date.now(),
        content,
        folderRef,
        files: attachedMeta,
      };
      if (activeWebRtc && activeWebRtc.isOpen) {
        activeWebRtc.sendControl(controlMsg);
      }
      if (attachedFiles && attachedFiles.length > 0) {
        get().addFiles(attachedFiles);
      }
    },

    sendVoiceMessage: async (result) => {
      const myName = get().deviceName || getLocalDeviceInfo().name;
      const myId = get().myPeerId || 'local';
      const voiceId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newMsg: ChatMessage = {
        id: voiceId,
        senderPeerId: myId,
        senderName: myName,
        timestamp: Date.now(),
        kind: 'voice',
        audioPayloadBase64: result.base64,
        audioDurationSeconds: result.durationSeconds,
      };
      set((state) => ({ chatMessages: [...state.chatMessages, newMsg] }));

      const controlMsg: ControlMessage = {
        type: 'chat:voice',
        id: voiceId,
        senderPeerId: myId,
        senderName: myName,
        timestamp: Date.now(),
        durationSeconds: result.durationSeconds,
        mime: result.mime,
        audioPayloadBase64: result.base64,
      };
      if (activeWebRtc && activeWebRtc.isOpen) {
        activeWebRtc.sendControl(controlMsg);
      }
    },

    disconnectRoom: () => {
      const { sessionId } = get();
      if (activeSignaling && sessionId && activePeerToken) {
        void activeSignaling.leaveSession({ sessionId, peerToken: activePeerToken });
      }
      if (activeWebRtc) {
        activeWebRtc.close();
        activeWebRtc = null;
      }
      set({ connectionState: 'disconnected' });
    },

    reconnectRoom: async () => {
      const { role, sessionCode, inviteToken } = get();
      if (role === 'sender') {
        await get().startSenderSession();
      } else if (inviteToken) {
        await get().joinByInvite(inviteToken);
      } else if (sessionCode) {
        await get().joinByCode(sessionCode);
      }
    },

    removePeerFromRoom: (peerId: string) => {
      set((state) => ({
        peers: state.peers.filter((p) => p.peerId !== peerId),
      }));
      const controlMsg: ControlMessage = {
        type: 'peer:leave',
        peerId,
      };
      if (activeWebRtc && activeWebRtc.isOpen) {
        activeWebRtc.sendControl(controlMsg);
      }
    },

    resetSession: () => {
      cleanupEngines();
      set({
        role: 'idle',
        sessionId: null,
        sessionCode: null,
        sessionExpiresAt: null,
        inviteToken: null,
        inviteUrl: null,
        qrDataUrl: null,
        peerDevice: null,
        connectionState: 'idle',
        connectionMode: 'unknown',
        error: null,
        myPeerId: null,
        isHost: false,
        peers: [],
        chatMessages: [],
        selectedFiles: [],
        senderSnapshot: null,
        receiverSnapshot: null,
        incomingReviewFiles: null,
        receivedFiles: [],
      });
    },

    downloadReceivedFile: (fileIndex: number) => {
      const file = get().receivedFiles.find((f) => f.meta.index === fileIndex);
      if (!file || !file.blob) return;

      const url = URL.createObjectURL(file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.meta.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    downloadAllZip: () => {
      const { receivedFiles } = get();
      if (receivedFiles.length === 0) return;

      const zipObject: Record<string, Uint8Array> = {};
      const promises: Array<Promise<void>> = [];

      for (const file of receivedFiles) {
        if (!file.blob) continue;
        const filePath = file.meta.relativePath || file.meta.name;
        promises.push(
          file.blob.arrayBuffer().then((buf) => {
            zipObject[filePath] = new Uint8Array(buf);
          }),
        );
      }

      Promise.all(promises)
        .then(() => {
          const zipped = zipSync(zipObject);
          const zipBlob = new Blob([zipped as BlobPart], { type: 'application/zip' });
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `drooit-transfer-${Date.now()}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Failed to create ZIP package:', err);
        });
    },
  };
});
