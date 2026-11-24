import {
  BUFFER_LOW_WATER,
  CONTROL_CHANNEL_LABEL,
  DATA_CHANNEL_LABEL,
} from '@shared/constants.js';
import type {
  ControlMessage,
} from '@shared/protocol.js';
import { parseControlMessage } from '@shared/protocol.js';
import type {
  IceServerConfig,
  PublicConfig,
  SerializedCandidate,
  WireSignalPayload,
} from '@shared/types.js';
import type { TransferChannel } from '../transfer/types.js';

export interface WebRtcEvents {
  onSignalNeeded?: (payload: WireSignalPayload) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onModeChange?: (mode: 'direct' | 'relay' | 'unknown') => void;
  onReady?: () => void;
  onControlMessage?: (message: ControlMessage) => void;
  onBinaryFrame?: (frame: ArrayBuffer) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export async function fetchIceConfig(): Promise<IceServerConfig[]> {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as PublicConfig;
    if (data.iceServers && data.iceServers.length > 0) {
      return data.iceServers;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load iceServers from server, falling back to public STUN:', err);
  }
  return [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
}

export class WebRtcConnection implements TransferChannel {
  private pc: RTCPeerConnection | null = null;
  private controlChannel: RTCDataChannel | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private drainWaiters: Array<() => void> = [];
  private isOfferer: boolean;
  private events: WebRtcEvents;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private currentMode: 'direct' | 'relay' | 'unknown' = 'unknown';

  constructor(isOfferer: boolean, events: WebRtcEvents = {}) {
    this.isOfferer = isOfferer;
    this.events = events;
  }

  setEvents(events: WebRtcEvents): void {
    this.events = { ...this.events, ...events };
  }

  get isOpen(): boolean {
    return (
      Boolean(this.controlChannel && this.controlChannel.readyState === 'open') &&
      Boolean(this.dataChannel && this.dataChannel.readyState === 'open')
    );
  }

  get bufferedAmount(): number {
    return this.dataChannel ? this.dataChannel.bufferedAmount : 0;
  }

  get mode(): 'direct' | 'relay' | 'unknown' {
    return this.currentMode;
  }

  async init(iceServers?: IceServerConfig[]): Promise<void> {
    const servers = iceServers ?? (await fetchIceConfig());
    const rtcConfig: RTCConfiguration = {
      iceServers: servers.map((s) => ({
        urls: s.urls,
        username: s.username,
        credential: s.credential,
      })),
      iceCandidatePoolSize: 2,
    };

    const pc = new RTCPeerConnection(rtcConfig);
    this.pc = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateInit = event.candidate.toJSON() as SerializedCandidate;
        this.events.onSignalNeeded?.({
          kind: 'candidate',
          candidate: candidateInit,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      this.events.onConnectionStateChange?.(pc.connectionState);
      if (pc.connectionState === 'connected') {
        this.startStatsPoll();
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.stopStatsPoll();
      }
    };

    pc.oniceconnectionstatechange = () => {
      this.events.onIceConnectionStateChange?.(pc.iceConnectionState);
    };

    if (this.isOfferer) {
      // Create data channels
      this.setupControlChannel(
        pc.createDataChannel(CONTROL_CHANNEL_LABEL, { ordered: true }),
      );
      this.setupDataChannel(
        pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true }),
      );
    } else {
      // Answerer listens for channels
      pc.ondatachannel = (event) => {
        const ch = event.channel;
        if (ch.label === CONTROL_CHANNEL_LABEL) {
          this.setupControlChannel(ch);
        } else if (ch.label === DATA_CHANNEL_LABEL) {
          this.setupDataChannel(ch);
        }
      };
    }
  }

  async startOffer(): Promise<void> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.events.onSignalNeeded?.({
      kind: 'description',
      description: {
        type: 'offer',
        sdp: offer.sdp,
      },
    });
  }

  async handleSignal(payload: WireSignalPayload): Promise<void> {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    if (payload.kind === 'description') {
      const desc = payload.description;
      await this.pc.setRemoteDescription(
        new RTCSessionDescription({ type: desc.type, sdp: desc.sdp }),
      );
      this.remoteDescriptionSet = true;

      // Drain buffered candidates
      while (this.pendingCandidates.length > 0) {
        const cand = this.pendingCandidates.shift()!;
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('Error adding buffered candidate:', err);
        }
      }

      if (desc.type === 'offer') {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.events.onSignalNeeded?.({
          kind: 'description',
          description: {
            type: 'answer',
            sdp: answer.sdp,
          },
        });
      }
    } else if (payload.kind === 'candidate') {
      const candidateInit = payload.candidate;
      if (!this.remoteDescriptionSet) {
        this.pendingCandidates.push(candidateInit);
      } else {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidateInit));
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('Error adding ICE candidate:', err);
        }
      }
    }
  }

  sendControl(message: ControlMessage): void {
    if (!this.controlChannel || this.controlChannel.readyState !== 'open') {
      throw new Error('Control channel is not open');
    }
    this.controlChannel.send(JSON.stringify(message));
  }

  sendFrame(frame: ArrayBuffer): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel is not open');
    }
    this.dataChannel.send(frame);
  }

  waitForDrain(signal: AbortSignal): Promise<void> {
    if (!this.dataChannel || this.dataChannel.bufferedAmount <= BUFFER_LOW_WATER) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        signal.removeEventListener('abort', done);
        resolve();
      };
      signal.addEventListener('abort', done, { once: true });
      this.drainWaiters.push(done);
    });
  }

  private checkReady(): void {
    if (this.isOpen) {
      this.events.onReady?.();
    }
  }

  private setupControlChannel(channel: RTCDataChannel): void {
    this.controlChannel = channel;
    channel.onopen = () => {
      this.checkReady();
    };
    channel.onclose = () => {
      this.events.onClose?.();
    };
    channel.onerror = (e) => {
      this.events.onError?.(new Error(`Control channel error: ${(e as ErrorEvent).message || 'unknown'}`));
    };
    channel.onmessage = (event) => {
      try {
        if (typeof event.data === 'string') {
          const parsed = parseControlMessage(event.data);
          if (parsed.ok) {
            this.events.onControlMessage?.(parsed.message);
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to parse control message:', err);
      }
    };
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = BUFFER_LOW_WATER;

    channel.onopen = () => {
      this.checkReady();
    };
    channel.onclose = () => {
      this.events.onClose?.();
    };
    channel.onerror = (e) => {
      this.events.onError?.(new Error(`Data channel error: ${(e as ErrorEvent).message || 'unknown'}`));
    };
    channel.onbufferedamountlow = () => {
      const waiters = this.drainWaiters;
      this.drainWaiters = [];
      for (const w of waiters) w();
    };
    channel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.events.onBinaryFrame?.(event.data);
      }
    };
  }

  private startStatsPoll(): void {
    this.stopStatsPoll();
    this.pollStats();
    this.statsTimer = setInterval(() => {
      void this.pollStats();
    }, 2000);
  }

  private stopStatsPoll(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private async pollStats(): Promise<void> {
    if (!this.pc) return;
    try {
      const stats = await this.pc.getStats();
      let selectedPairId: string | null = null;
      stats.forEach((report) => {
        if (report.type === 'transport' && report.selectedCandidatePairId) {
          selectedPairId = report.selectedCandidatePairId as string;
        }
      });

      stats.forEach((report) => {
        if (
          report.type === 'candidate-pair' &&
          (report.state === 'succeeded' || report.nominated === true || report.id === selectedPairId)
        ) {
          const remoteCandidate = stats.get(report.remoteCandidateId as string);
          const localCandidate = stats.get(report.localCandidateId as string);
          const isRelay =
            remoteCandidate?.candidateType === 'relay' || localCandidate?.candidateType === 'relay';

          const newMode = isRelay ? 'relay' : 'direct';
          if (newMode !== this.currentMode) {
            this.currentMode = newMode;
            this.events.onModeChange?.(newMode);
          }
        }
      });
    } catch {
      // Ignore stats query failure
    }
  }

  close(): void {
    this.stopStatsPoll();
    if (this.drainWaiters.length > 0) {
      const waiters = this.drainWaiters;
      this.drainWaiters = [];
      for (const w of waiters) w();
    }
    if (this.controlChannel) {
      this.controlChannel.close();
      this.controlChannel = null;
    }
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
