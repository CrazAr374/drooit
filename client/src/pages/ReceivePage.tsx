import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Hash,
  ArrowRight,
  AlertCircle,
  XCircle,
  Radio,
  Lock,
} from 'lucide-react';
import { useTransferStore } from '../store/transferStore.js';
import { QrScannerModal } from '../components/pairing/QrScannerModal.js';
import { ReceiverConsentModal } from '../components/transfer/ReceiverConsentModal.js';
import { TransferProgress } from '../components/transfer/TransferProgress.js';
import { Button } from '../components/common/Button.js';
import { ConnectionBadge } from '../components/common/Badge.js';
import { RoomWorkspace } from '../components/room/RoomWorkspace.js';
import type { SharedFileMeta } from '@shared/protocol.js';

interface ReceivePageProps {
  onNavigateHome: () => void;
  initialCode?: string;
  initialToken?: string;
}

export const ReceivePage: React.FC<ReceivePageProps> = ({
  onNavigateHome,
  initialCode = '',
  initialToken = '',
}) => {
  const {
    sessionId,
    sessionCode,
    joinByCode,
    joinByInvite,
    connectionState,
    connectionMode,
    peerDevice,
    senderSnapshot,
    receiverSnapshot,
    selectedFiles,
    addFiles,
    incomingReviewFiles,
    receivedFiles,
    error,
    isHost,
    peers,
    chatMessages,
    deviceName,
    sendChatMessage,
    disconnectRoom,
    reconnectRoom,
    acceptTransfer,
    rejectTransfer,
    cancelTransfer,
    resetSession,
    downloadFile,
    downloadAllZip,
  } = useTransferStore();

  const [digits, setDigits] = useState<string[]>(
    initialCode ? initialCode.padEnd(6, '').slice(0, 6).split('') : ['', '', '', '', '', ''],
  );
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (initialToken) {
      setIsJoining(true);
      void joinByInvite(initialToken).finally(() => setIsJoining(false));
    } else if (initialCode && initialCode.length === 6) {
      setIsJoining(true);
      void joinByCode(initialCode).finally(() => setIsJoining(false));
    }
  }, [initialCode, initialToken]);

  const fullCode = digits.join('');

  const handleDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      return;
    }

    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, 6).split('');
      const next = [...digits];
      chars.forEach((c, i) => {
        if (index + i < 6) next[index + i] = c;
      });
      setDigits(next);
      const nextFocus = Math.min(5, index + chars.length);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = cleaned[0]!;
    setDigits(next);

    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleJoin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (fullCode.length !== 6) return;
    setIsJoining(true);
    try {
      await joinByCode(fullCode);
    } finally {
      setIsJoining(false);
    }
  };

  const handleScanResult = async (decodedText: string) => {
    setIsScannerOpen(false);
    setIsJoining(true);
    try {
      const trimmed = decodedText.trim();

      // Check for URL containing join code or token in search or hash
      try {
        let url: URL | null = null;
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          url = new URL(trimmed);
        } else if (trimmed.includes('?')) {
          url = new URL(`http://dummy/${trimmed.slice(trimmed.indexOf('?'))}`);
        } else if (trimmed.includes('#')) {
          url = new URL(`http://dummy/?${trimmed.slice(trimmed.indexOf('#') + 1)}`);
        }

        if (url) {
          const search = url.searchParams;
          const hashStr = url.hash.replace(/^#/, '');
          const hashParams = new URLSearchParams(hashStr);

          const token =
            search.get('token') ||
            hashParams.get('token') ||
            search.get('invite') ||
            hashParams.get('invite');
          const code =
            search.get('join') ||
            hashParams.get('join') ||
            search.get('code') ||
            hashParams.get('code');

          if (token) {
            await joinByInvite(token);
            return;
          }
          if (code && code.length === 6) {
            setDigits(code.split(''));
            await joinByCode(code);
            return;
          }
        }
      } catch {
        // Fall back to pattern matching
      }

      // Check if text is directly a 6-digit code
      const match = trimmed.match(/\b\d{6}\b/);
      if (match) {
        const code = match[0];
        setDigits(code.split(''));
        await joinByCode(code);
        return;
      }

      // Fall back to treating as token
      await joinByInvite(trimmed);
    } finally {
      setIsJoining(false);
    }
  };

  if (connectionState === 'connected') {
    const fileMetas: SharedFileMeta[] = [
      ...receivedFiles.map((rf) => rf.meta),
      ...selectedFiles.map((sf, idx) => ({
        index: receivedFiles.length + idx,
        name: sf.name,
        size: sf.size,
        mime: sf.type || 'application/octet-stream',
        lastModified: sf.lastModified,
        relativePath: (sf as { webkitRelativePath?: string }).webkitRelativePath || sf.name,
      })),
    ];

    return (
      <RoomWorkspace
        roomCode={sessionCode || fullCode}
        sessionId={sessionId || ''}
        isHost={isHost}
        peers={peers}
        files={fileMetas}
        chatMessages={chatMessages}
        qrDataUrl={null}
        inviteUrl={null}
        expiresAt={null}
        connectionState={connectionState}
        currentDeviceName={deviceName}
        senderSnapshot={senderSnapshot}
        receiverSnapshot={receiverSnapshot}
        onCancelTransfer={cancelTransfer}
        onNavigateHome={() => {
          resetSession();
          onNavigateHome();
        }}
        onDisconnectRoom={disconnectRoom}
        onReconnectRoom={reconnectRoom}
        onAddFiles={addFiles}
        onDownloadFile={downloadFile}
        onDownloadAll={downloadAllZip}
        onSendMessage={sendChatMessage}
      />
    );
  }

  if (incomingReviewFiles && incomingReviewFiles.length > 0) {
    return (
      <ReceiverConsentModal
        files={incomingReviewFiles}
        peerName={peerDevice?.name || 'Sender'}
        onAccept={acceptTransfer}
        onReject={rejectTransfer}
      />
    );
  }

  if (
    receiverSnapshot &&
    (receiverSnapshot.phase === 'transferring' ||
      receiverSnapshot.phase === 'preparing' ||
      receiverSnapshot.phase === 'paused')
  ) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-8">
        <TransferProgress
          role="receiver"
          senderSnapshot={null}
          receiverSnapshot={receiverSnapshot}
          connectionMode={connectionMode}
          peerDeviceName={peerDevice?.name}
          onCancel={cancelTransfer}
        />
      </div>
    );
  }

  if (connectionState === 'signaling' || connectionState === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 max-w-md mx-auto my-8 text-center bg-card rounded-xl border border-border shadow-xl drooit-card animate-in zoom-in-95">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-foreground border border-border mb-4">
          <div className="absolute inset-0 rounded-2xl border border-yellow-400/40 animate-radar pointer-events-none" />
          <Radio className="w-6 h-6 text-yellow-500 dark:text-yellow-400 animate-pulse" />
        </div>

        <h3 className="font-display font-bold text-xl text-foreground mb-1 tracking-tight">
          Establishing Connection
        </h3>
        <p className="text-xs text-muted-foreground mb-5 max-w-xs leading-relaxed">
          Opening direct peer tunnel on the fly. Nothing is stored on any server.
        </p>

        {/* Live Verification Checklist */}
        <div className="w-full flex flex-col gap-2 p-3.5 rounded-lg bg-secondary/50 border border-border mb-5 text-left text-xs font-mono">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Session Verification
            </span>
            <span className="text-emerald-500 font-bold text-[11px]">VALIDATED</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Direct P2P DataChannel
            </span>
            <span className="text-emerald-500 font-bold text-[11px]">OPENED</span>
          </div>
          <div className="flex items-center justify-between text-foreground">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              Memory Stream Buffer
            </span>
            <span className="text-yellow-500 dark:text-yellow-400 font-bold text-[11px]">READY</span>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <ConnectionBadge mode={connectionMode} state={connectionState} />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            cancelTransfer();
            onNavigateHome();
          }}
          className="text-xs text-muted-foreground hover:text-destructive h-8 px-4 rounded-md"
        >
          <XCircle className="w-3.5 h-3.5 mr-1" />
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto px-4 py-6 sm:py-8 gap-5 animate-in fade-in">
      {/* Page Navigation Breadcrumb */}
      <div className="flex items-center gap-2 w-full text-xs text-muted-foreground">
        <button
          type="button"
          onClick={onNavigateHome}
          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors font-medium text-muted-foreground group"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Home</span>
        </button>
        <span className="text-muted-foreground/30">/</span>
        <span className="text-foreground font-semibold">Join Room</span>
      </div>

      <div className="w-full p-6 sm:p-7 rounded-xl bg-card border border-border shadow-xl flex flex-col items-center text-center drooit-card">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-foreground border border-border mb-3.5 shadow-sm">
          <Hash className="h-6 w-6 text-yellow-500 dark:text-yellow-400" />
        </div>

        <h2 className="text-xl sm:text-2xl font-bold font-display text-foreground mb-1 tracking-tight">
          Join Encrypted Room
        </h2>
        <p className="text-xs text-muted-foreground mb-6 max-w-xs leading-relaxed">
          Connect first. Enter the 6-digit code or scan the optical QR code to chat and share files.
        </p>

        {/* 6 Structured Digit Inputs */}
        <form onSubmit={handleJoin} className="w-full flex flex-col items-center gap-5">
          <div className="flex items-center justify-center gap-1.5 sm:gap-2.5 w-full">
            {digits.map((digit, idx) => (
              <React.Fragment key={idx}>
                <input
                  ref={(el) => (inputRefs.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className={`w-10 h-13 sm:w-12 sm:h-14 text-center font-display font-extrabold text-xl sm:text-2xl rounded-lg border transition-all ${
                    digit
                      ? 'bg-secondary border-foreground text-foreground shadow-sm'
                      : 'bg-secondary/40 border-border text-foreground focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 focus:bg-background'
                  }`}
                />
                {idx === 2 && (
                  <div className="w-2.5 h-[2px] bg-yellow-400 mx-1 rounded-full shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>

          <Button
            type="submit"
            variant="accent"
            size="md"
            isLoading={isJoining}
            disabled={fullCode.length !== 6 || isJoining}
            className="w-full font-bold text-xs h-10 rounded-lg"
          >
            <span>Connect & Join Room</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </form>

        <div className="flex items-center gap-3 w-full my-5">
          <div className="flex-1 h-[1px] bg-border" />
          <span className="text-xs text-muted-foreground uppercase font-semibold">or</span>
          <div className="flex-1 h-[1px] bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={() => setIsScannerOpen(true)}
          className="w-full border-border text-xs h-10 font-medium rounded-lg"
        >
          <Camera className="w-4 h-4 mr-2 text-foreground" />
          <span>Scan QR Code with Camera</span>
        </Button>

        <div className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          <Lock className="w-3.5 h-3.5 text-foreground/60" />
          <span>Streams directly into your local downloads folder</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive w-full">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error.message}</span>
        </div>
      )}

      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanResult={handleScanResult}
      />
    </div>
  );
};
