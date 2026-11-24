import React, { useEffect } from 'react';
import {
  ArrowLeft,
  Loader2,
  Radio,
  XCircle,
  AlertCircle,
  Smartphone,
} from 'lucide-react';
import { useTransferStore } from '../store/transferStore.js';
import { Dropzone } from '../components/file/Dropzone.js';
import { FileList } from '../components/file/FileList.js';
import { QrCodeDisplay } from '../components/pairing/QrCodeDisplay.js';
import { NumericCodeDisplay } from '../components/pairing/NumericCodeDisplay.js';
import { Button } from '../components/common/Button.js';
import { ConnectionBadge } from '../components/common/Badge.js';
import { RoomWorkspace } from '../components/room/RoomWorkspace.js';
import type { SharedFileMeta } from '@shared/protocol.js';

interface SendPageProps {
  onNavigateHome: () => void;
}

export const SendPage: React.FC<SendPageProps> = ({ onNavigateHome }) => {
  const {
    selectedFiles,
    addFiles,
    removeFile,
    clearFiles,
    startSenderSession,
    sessionId,
    sessionCode,
    sessionExpiresAt,
    inviteUrl,
    qrDataUrl,
    connectionState,
    connectionMode,
    peerDevice,
    senderSnapshot,
    receiverSnapshot,
    receivedFiles,
    error,
    isHost,
    peers,
    chatMessages,
    deviceName,
    sendChatMessage,
    disconnectRoom,
    reconnectRoom,
    removePeerFromRoom,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    resetSession,
    downloadFile,
    downloadAllZip,
  } = useTransferStore();

  // Connect first: initialize session immediately on mount
  useEffect(() => {
    if (connectionState === 'idle') {
      void startSenderSession();
    }
  }, []);

  const handleCancelAndBack = () => {
    cancelTransfer();
    onNavigateHome();
  };

  // When connected, stay inside the collaborative Room Workspace (Files + Chat together)
  if (connectionState === 'connected') {
    const fileMetas: SharedFileMeta[] = [
      ...selectedFiles.map((f, i) => ({
        index: i,
        name: f.name,
        size: f.size,
        mime: f.type || 'application/octet-stream',
        lastModified: f.lastModified || Date.now(),
        relativePath: (f as { webkitRelativePath?: string }).webkitRelativePath || f.name,
      })),
      ...receivedFiles.map((rf) => rf.meta),
    ];

    return (
      <RoomWorkspace
        roomCode={sessionCode || ''}
        sessionId={sessionId || ''}
        isHost={isHost}
        peers={peers}
        files={fileMetas}
        chatMessages={chatMessages}
        qrDataUrl={qrDataUrl}
        inviteUrl={inviteUrl}
        expiresAt={sessionExpiresAt}
        connectionState={connectionState}
        currentDeviceName={deviceName}
        senderSnapshot={senderSnapshot}
        receiverSnapshot={receiverSnapshot}
        onPauseTransfer={pauseTransfer}
        onResumeTransfer={resumeTransfer}
        onCancelTransfer={cancelTransfer}
        onNavigateHome={() => {
          resetSession();
          onNavigateHome();
        }}
        onDisconnectRoom={disconnectRoom}
        onReconnectRoom={reconnectRoom}
        onRemovePeer={removePeerFromRoom}
        onAddFiles={addFiles}
        onDownloadFile={downloadFile}
        onDownloadAll={downloadAllZip}
        onSendMessage={sendChatMessage}
      />
    );
  }

  // Initial Connection & Pairing Console
  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto px-4 py-6 sm:py-8 gap-5 animate-in fade-in">
      {/* Top Bar */}
      <div className="flex items-center justify-between w-full">
        <button
          type="button"
          onClick={handleCancelAndBack}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium group"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Home</span>
          <span className="text-muted-foreground/30">/</span>
          <span className="text-foreground font-semibold">Create Room</span>
        </button>
        <ConnectionBadge mode={connectionMode} state={connectionState} />
      </div>

      {/* Pairing Card */}
      <div className="w-full p-6 sm:p-7 rounded-xl bg-card border border-border shadow-xl flex flex-col items-center text-center drooit-card">
        <h2 className="text-xl sm:text-2xl font-bold font-display text-foreground mb-1 tracking-tight">
          Encrypted Room Created
        </h2>
        <p className="text-xs text-muted-foreground mb-5 max-w-sm leading-relaxed">
          Connect first. Scan the QR code or enter the 6-digit code on the other device to chat and share files.
        </p>

        {/* QR Code Display */}
        {qrDataUrl && inviteUrl ? (
          <QrCodeDisplay
            qrDataUrl={qrDataUrl}
            inviteUrl={inviteUrl}
            expiresAt={sessionExpiresAt}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-52 w-52 bg-secondary/40 rounded-xl mb-4 border border-border">
            <Loader2 className="w-6 h-6 text-foreground animate-spin mb-2" />
            <span className="text-xs text-muted-foreground">Opening encrypted tunnel...</span>
          </div>
        )}

        {/* Numeric PIN */}
        {sessionCode && (
          <div className="w-full mt-5 pt-5 border-t border-border">
            <NumericCodeDisplay code={sessionCode} />
          </div>
        )}

        {/* Connection status */}
        <div className="mt-6 pt-5 border-t border-border w-full flex items-center justify-center">
          {peerDevice ? (
            <div className="flex items-center justify-between p-3.5 rounded-lg bg-secondary/80 border border-border w-full text-left">
              <div className="flex items-center gap-2.5">
                <div className="relative flex items-center justify-center w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{peerDevice.name}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium">
                    Direct P2P link verified on the fly
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-card px-2 py-0.5 rounded border border-border">
                CONNECTING
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3.5 rounded-lg bg-secondary/50 border border-border w-full text-left">
              <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-yellow-400/10 shrink-0">
                <div className="absolute inset-0 rounded-full border border-yellow-400/30 animate-radar" />
                <Radio className="w-4 h-4 text-yellow-500 dark:text-yellow-400 animate-pulse" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-foreground font-display">
                  Waiting for other device to join...
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Direct peer connection opens on the fly. Zero server storage.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Optional Staging Dropzone (Share files right away or in the room) */}
      <div className="w-full flex flex-col gap-3">
        <div className="text-left px-1">
          <span className="text-xs font-semibold text-foreground">
            Optional: Stage files to send upon connection
          </span>
          <p className="text-[11px] text-muted-foreground">
            You can drop files here now, or share them anytime inside the room alongside encrypted chat.
          </p>
        </div>
        <Dropzone onFilesSelected={addFiles} />

        {selectedFiles.length > 0 && (
          <div className="p-4 rounded-xl bg-card border border-border shadow-md drooit-card">
            <FileList
              files={selectedFiles}
              onRemoveFile={removeFile}
              onClearFiles={clearFiles}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive w-full">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error.message}</span>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handleCancelAndBack}
        className="text-xs text-muted-foreground hover:text-destructive h-8 px-4 rounded-md"
      >
        <XCircle className="w-3.5 h-3.5 mr-1" />
        Cancel room
      </Button>
    </div>
  );
};
