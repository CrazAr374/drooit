import React, { useState } from 'react';
import {
  ArrowLeft,
  QrCode,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  Folder,
  MessageSquare,
  Users,
} from 'lucide-react';
import type { ChatMessage, PeerSnapshot, SharedFileMeta } from '@shared/types.js';
import type { AudioRecordingResult } from '../../lib/audio/recorder.js';
import type { SenderSnapshot, ReceiverSnapshot } from '../../lib/transfer/types.js';
import { formatSpeed, formatEta, formatPercent } from '@shared/format.js';
import { PeerRoster } from './PeerRoster.js';
import { FolderExplorer } from './FolderExplorer.js';
import { ChatStream } from './ChatStream.js';
import { QrCodeDisplay } from '../pairing/QrCodeDisplay.js';
import { Button } from '../common/Button.js';

interface RoomWorkspaceProps {
  roomCode: string;
  sessionId: string;
  isHost: boolean;
  peers: PeerSnapshot[];
  files: SharedFileMeta[];
  chatMessages: ChatMessage[];
  qrDataUrl: string | null;
  inviteUrl: string | null;
  expiresAt: number | null;
  connectionState: 'idle' | 'signaling' | 'connecting' | 'connected' | 'disconnected' | 'failed';
  currentDeviceName?: string;
  senderSnapshot?: SenderSnapshot | null;
  receiverSnapshot?: ReceiverSnapshot | null;
  onPauseTransfer?: () => void;
  onResumeTransfer?: () => void;
  onCancelTransfer?: () => void;
  onNavigateHome: () => void;
  onDisconnectRoom: () => void;
  onReconnectRoom: () => void;
  onRemovePeer?: (peerId: string) => void;
  onAddFiles?: (files: File[]) => void;
  onDownloadFile?: (identifier: string | number) => void;
  onDownloadAll?: () => void;
  onSendMessage: (
    text: string,
    folderRef?: string,
    files?: File[],
    voice?: AudioRecordingResult,
  ) => void;
}

export const RoomWorkspace: React.FC<RoomWorkspaceProps> = ({
  roomCode,
  isHost,
  peers,
  files,
  chatMessages,
  qrDataUrl,
  inviteUrl,
  expiresAt,
  connectionState,
  currentDeviceName,
  senderSnapshot,
  receiverSnapshot,
  onPauseTransfer,
  onResumeTransfer,
  onCancelTransfer,
  onNavigateHome,
  onDisconnectRoom,
  onReconnectRoom,
  onRemovePeer,
  onAddFiles,
  onDownloadFile,
  onDownloadAll,
  onSendMessage,
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'chat'>('files');
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  const [activeFolderRef, setActiveFolderRef] = useState<string | undefined>(undefined);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore
    }
  };

  const codeChars = roomCode.padEnd(6, '-').slice(0, 6).split('');

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col h-[calc(100vh-140px)] min-h-[580px] p-2 sm:p-4 animate-in fade-in">
      {/* Top Breadcrumb & Room Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-border">
        {/* Left: Breadcrumbs & Room Identity */}
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateHome}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Home /</span>
            <span>Room</span>
          </button>

          {/* Segmented 6-digit Code Display */}
          <div
            onClick={handleCopyCode}
            title="Click to copy code"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-card border border-border hover:border-yellow-400/50 cursor-pointer transition-all drooit-card shadow-sm"
          >
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground mr-1">
              Code:
            </span>
            <div className="flex items-center gap-1">
              {codeChars.map((char, i) => (
                <span
                  key={i}
                  className="w-5 h-6 rounded bg-secondary text-foreground text-xs font-mono font-bold flex items-center justify-center border border-border"
                >
                  {char}
                </span>
              ))}
            </div>
            {copiedCode ? (
              <Check className="w-3.5 h-3.5 text-emerald-500 ml-1.5" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-muted-foreground ml-1.5 hover:text-foreground" />
            )}
          </div>
        </div>

        {/* Right: Peers, QR Code & Connection Status */}
        <div className="flex items-center gap-2">
          {/* Peer Roster Pill Toggle */}
          <button
            onClick={() => setIsRosterOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-semibold transition-all ${
              isRosterOpen
                ? 'bg-yellow-400/10 border-yellow-400/40 text-yellow-500'
                : 'bg-secondary text-foreground border-border hover:bg-secondary/80'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-yellow-400" />
            <span>Peers ({peers.length})</span>
          </button>

          {/* Optical QR Invite Button */}
          {qrDataUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsQrOpen(true)}
              className="text-xs h-8 px-2.5 gap-1.5 rounded-lg border-border font-medium"
            >
              <QrCode className="w-3.5 h-3.5 text-yellow-500" />
              <span className="hidden sm:inline">Invite QR</span>
            </Button>
          )}

          {/* Reconnect / Disconnect Button */}
          {connectionState === 'disconnected' || connectionState === 'failed' ? (
            <Button
              variant="accent"
              size="sm"
              onClick={onReconnectRoom}
              className="text-xs h-8 px-3 rounded-lg font-bold gap-1 bg-yellow-400 text-black hover:bg-yellow-300"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reconnect</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDisconnectRoom}
              title="Leave Room"
              className="text-xs h-8 px-2.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline ml-1">Leave</span>
            </Button>
          )}
        </div>
      </div>

      {/* Active Transfer Progress HUD (Sender) */}
      {senderSnapshot && (senderSnapshot.phase === 'transferring' || senderSnapshot.phase === 'paused') && (
        <div className="mb-3 p-3 rounded-xl bg-secondary/80 border border-yellow-400/30 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-foreground truncate">
                  Transferring files... (
                  {formatPercent(
                    senderSnapshot.totalBytes > 0
                      ? (senderSnapshot.transferredBytes / senderSnapshot.totalBytes) * 100
                      : 0,
                  )}
                  )
                </span>
                <span className="font-mono text-muted-foreground text-[11px] shrink-0 ml-2">
                  {formatSpeed(senderSnapshot.speedBps)} • ETA: {formatEta(senderSnapshot.etaSeconds)}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-yellow-400 transition-all duration-200 rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      senderSnapshot.totalBytes > 0
                        ? (senderSnapshot.transferredBytes / senderSnapshot.totalBytes) * 100
                        : 0,
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {senderSnapshot.phase === 'paused' ? (
              <Button variant="ghost" size="sm" onClick={onResumeTransfer} className="h-7 px-2 text-xs">
                Resume
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onPauseTransfer} className="h-7 px-2 text-xs">
                Pause
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancelTransfer}
              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Active Transfer Progress HUD (Receiver) */}
      {receiverSnapshot && (receiverSnapshot.phase === 'transferring' || receiverSnapshot.phase === 'paused') && (
        <div className="mb-3 p-3 rounded-xl bg-secondary/80 border border-yellow-400/30 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-foreground truncate">
                  Receiving files... (
                  {formatPercent(
                    receiverSnapshot.totalBytes > 0
                      ? (receiverSnapshot.receivedBytes / receiverSnapshot.totalBytes) * 100
                      : 0,
                  )}
                  )
                </span>
                <span className="font-mono text-muted-foreground text-[11px] shrink-0 ml-2">
                  {formatSpeed(receiverSnapshot.speedBps)} • ETA: {formatEta(receiverSnapshot.etaSeconds)}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-yellow-400 transition-all duration-200 rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      receiverSnapshot.totalBytes > 0
                        ? (receiverSnapshot.receivedBytes / receiverSnapshot.totalBytes) * 100
                        : 0,
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancelTransfer}
              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Transfer Success Confirmation Banner (Non-blocking) */}
      {senderSnapshot && senderSnapshot.phase === 'completed' && (
        <div className="mb-3 px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            All files successfully sent and verified bit-for-bit with SHA-256.
          </span>
        </div>
      )}

      {receiverSnapshot && receiverSnapshot.phase === 'completed' && (
        <div className="mb-3 px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            All files successfully received and verified bit-for-bit with SHA-256.
          </span>
          {onDownloadAll && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadAll}
              className="h-6 text-[11px] px-2 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
            >
              Download All (ZIP)
            </Button>
          )}
        </div>
      )}

      {/* Roster Overlay Drawer (when open) */}
      {isRosterOpen && (
        <div className="mb-3 animate-in slide-in-from-top-2 duration-150">
          <PeerRoster
            peers={peers}
            isHost={isHost}
            onDisconnect={onDisconnectRoom}
            onRemovePeer={onRemovePeer}
          />
        </div>
      )}

      {/* Mobile Tab Switcher */}
      <div className="flex sm:hidden mb-2.5 p-1 rounded-lg bg-secondary/80 border border-border">
        <button
          onClick={() => setActiveTab('files')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'files'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Folder className="w-3.5 h-3.5 text-yellow-400" />
          <span>Files ({files.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'chat'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-yellow-400" />
          <span>Chat ({chatMessages.length})</span>
        </button>
      </div>

      {/* Main Split-Pane Workspace (Desktop) / Tab Content (Mobile) */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-3 min-h-0">
        {/* Left Pane: Files & Folders */}
        <div
          className={`sm:col-span-7 h-full min-h-0 ${
            activeTab === 'files' ? 'block' : 'hidden sm:block'
          }`}
        >
          <FolderExplorer
            files={files}
            onAddFiles={onAddFiles}
            onDownloadFile={onDownloadFile}
            onDownloadAll={onDownloadAll}
            onSelectFolderForChat={(folder) => {
              setActiveFolderRef(folder);
              setActiveTab('chat');
            }}
          />
        </div>

        {/* Right Pane: Real-Time Chat & Voice Memos */}
        <div
          className={`sm:col-span-5 h-full min-h-0 ${
            activeTab === 'chat' ? 'block' : 'hidden sm:block'
          }`}
        >
          <ChatStream
            messages={chatMessages}
            currentPeerName={currentDeviceName}
            activeFolderRef={activeFolderRef}
            onClearFolderRef={() => setActiveFolderRef(undefined)}
            onSendMessage={onSendMessage}
            onDownloadFile={(fileName) => onDownloadFile?.(fileName)}
          />
        </div>
      </div>

      {/* QR Code Invitation Modal */}
      {isQrOpen && qrDataUrl && inviteUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-sm rounded-xl bg-card border border-border shadow-2xl p-6 drooit-card">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
              <h3 className="font-bold text-sm text-foreground font-display">Invite to Room</h3>
              <button
                onClick={() => setIsQrOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <QrCodeDisplay
              qrDataUrl={qrDataUrl}
              inviteUrl={inviteUrl}
              expiresAt={expiresAt}
            />
          </div>
        </div>
      )}
    </div>
  );
};
