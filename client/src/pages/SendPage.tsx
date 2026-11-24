import React, { useState } from 'react';
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
import { TransferProgress } from '../components/transfer/TransferProgress.js';
import { TransferComplete } from '../components/transfer/TransferComplete.js';
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
    error,
    isHost,
    peers,
    chatMessages,
    deviceName,
    sendChatMessage,
    sendVoiceMessage,
    disconnectRoom,
    reconnectRoom,
    removePeerFromRoom,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    resetSession,
  } = useTransferStore();

  const [step, setStep] = useState<'files' | 'pairing'>('files');

  const handleContinueToPairing = async () => {
    setStep('pairing');
    await startSenderSession();
  };

  const handleCancelAndBack = () => {
    cancelTransfer();
    setStep('files');
  };

  if (senderSnapshot && senderSnapshot.phase === 'completed') {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-8">
        <TransferComplete
          role="sender"
          totalBytes={senderSnapshot.totalBytes}
          onReset={() => {
            resetSession();
            setStep('files');
            onNavigateHome();
          }}
        />
      </div>
    );
  }

  if (
    senderSnapshot &&
    (senderSnapshot.phase === 'transferring' ||
      senderSnapshot.phase === 'paused' ||
      senderSnapshot.phase === 'waiting')
  ) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-8">
        <TransferProgress
          role="sender"
          senderSnapshot={senderSnapshot}
          receiverSnapshot={null}
          connectionMode={connectionMode}
          peerDeviceName={peerDevice?.name}
          onPause={pauseTransfer}
          onResume={resumeTransfer}
          onCancel={cancelTransfer}
        />
      </div>
    );
  }

  if (step === 'pairing' && connectionState === 'connected') {
    const fileMetas: SharedFileMeta[] = selectedFiles.map((f, i) => ({
      index: i,
      name: f.name,
      size: f.size,
      mime: f.type || 'application/octet-stream',
      lastModified: f.lastModified || Date.now(),
      relativePath: (f as { webkitRelativePath?: string }).webkitRelativePath || f.name,
    }));

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
        onNavigateHome={() => {
          resetSession();
          setStep('files');
          onNavigateHome();
        }}
        onDisconnectRoom={disconnectRoom}
        onReconnectRoom={reconnectRoom}
        onRemovePeer={removePeerFromRoom}
        onAddFiles={addFiles}
        onSendMessage={sendChatMessage}
        onSendVoice={sendVoiceMessage}
      />
    );
  }

  if (step === 'pairing') {
    return (
      <div className="flex flex-col items-center w-full max-w-lg mx-auto px-4 py-6 sm:py-8 gap-5 animate-in fade-in">
        {/* Top Bar */}
        <div className="flex items-center justify-between w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelAndBack}
            className="text-muted-foreground hover:text-foreground text-xs font-semibold h-8 px-2"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Back to files
          </Button>
          <ConnectionBadge mode={connectionMode} state={connectionState} />
        </div>

        {/* Pairing Card */}
        <div className="w-full p-6 sm:p-7 rounded-xl bg-card border border-border shadow-xl flex flex-col items-center text-center drooit-card">
          <h2 className="text-xl sm:text-2xl font-bold font-display text-foreground mb-1 tracking-tight">
            Connect with Receiver
          </h2>
          <p className="text-xs text-muted-foreground mb-5 max-w-sm leading-relaxed">
            Scan the QR code with a phone camera or enter the 6-digit code on the other device
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
              <span className="text-xs text-muted-foreground">Preparing connection...</span>
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
                  READY
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
                    Listening for receiver...
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Everything streams in real time. Zero server storage.
                  </span>
                </div>
              </div>
            )}
          </div>
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
          Cancel session
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 gap-5 animate-in fade-in">
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
        <span className="text-foreground font-semibold">Send files</span>
      </div>

      <div className="w-full flex flex-col gap-5">
        <Dropzone onFilesSelected={addFiles} />

        {selectedFiles.length > 0 && (
          <div className="p-5 sm:p-6 rounded-xl bg-card border border-border shadow-xl drooit-card">
            <FileList
              files={selectedFiles}
              onRemoveFile={removeFile}
              onClearFiles={clearFiles}
              onContinue={handleContinueToPairing}
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
    </div>
  );
};
