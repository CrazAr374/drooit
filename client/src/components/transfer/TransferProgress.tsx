import React from 'react';
import {
  Pause,
  Play,
  XCircle,
  FileText,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import {
  formatBytes,
  formatEta,
  formatPercent,
  formatSpeed,
} from '@shared/format.js';
import { Button } from '../common/Button.js';
import { ConnectionBadge } from '../common/Badge.js';
import type {
  ReceiverSnapshot,
  SenderSnapshot,
} from '../../lib/transfer/types.js';

interface TransferProgressProps {
  role: 'sender' | 'receiver';
  senderSnapshot: SenderSnapshot | null;
  receiverSnapshot: ReceiverSnapshot | null;
  connectionMode: 'direct' | 'relay' | 'unknown';
  peerDeviceName?: string | null;
  onPause?: () => void;
  onResume?: () => void;
  onCancel: () => void;
}

export const TransferProgress: React.FC<TransferProgressProps> = ({
  role,
  senderSnapshot,
  receiverSnapshot,
  connectionMode,
  peerDeviceName,
  onPause,
  onResume,
  onCancel,
}) => {
  const isSender = role === 'sender';
  const snapshot = isSender ? senderSnapshot : receiverSnapshot;

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center bg-card rounded-xl border border-border drooit-card">
        <Loader2 className="w-7 h-7 text-foreground animate-spin mb-3" />
        <p className="text-xs text-muted-foreground font-semibold">
          Connecting to device...
        </p>
      </div>
    );
  }

  const totalBytes = snapshot.totalBytes || 1;
  const currentBytes = isSender
    ? (snapshot as SenderSnapshot).transferredBytes
    : (snapshot as ReceiverSnapshot).receivedBytes;
  const overallPercent = Math.min(100, Math.max(0, (currentBytes / totalBytes) * 100));
  const isPaused = snapshot.phase === 'paused';
  const speedBps = snapshot.speedBps || 0;
  const eta = (snapshot as SenderSnapshot).etaSeconds || 0;

  const activeFile = snapshot.files.find(
    (f) => f.status === 'sending' || f.status === 'verifying',
  );

  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-card border border-border shadow-sm drooit-card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-foreground border border-border shrink-0">
            {isSender ? (
              <ArrowUpRight className="h-5 w-5" />
            ) : (
              <ArrowDownLeft className="h-5 w-5" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
              <span className="text-muted-foreground font-normal">
                {isSender ? 'Sending to:' : 'Receiving from:'}
              </span>
              <span className="text-foreground font-semibold">{peerDeviceName || 'Connected Device'}</span>
            </h3>
            <span className="text-xs text-muted-foreground">
              {snapshot.files.length} {snapshot.files.length === 1 ? 'file' : 'files'} • {formatBytes(totalBytes)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ConnectionBadge mode={connectionMode} />

          {isSender && onPause && onResume && (
            <Button
              variant="outline"
              size="sm"
              onClick={isPaused ? onResume : onPause}
              className="h-8 px-3 rounded-md text-xs font-semibold"
            >
              {isPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 mr-1 text-emerald-500 fill-emerald-500" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 mr-1" />
                  <span>Pause</span>
                </>
              )}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
            title="Cancel transfer"
          >
            <XCircle className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main Progress Display */}
      <div className="p-5 sm:p-6 rounded-xl bg-card border border-border shadow-lg flex flex-col gap-4 drooit-card">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-3xl font-display font-extrabold text-foreground tracking-tight">
              {formatPercent(overallPercent)}
            </span>
            <span className="text-xs text-muted-foreground ml-2 font-medium">
              {formatBytes(currentBytes)} / {formatBytes(totalBytes)}
            </span>
          </div>

          <div className="text-right">
            <span className="text-base font-bold text-foreground font-display">
              {formatSpeed(speedBps)}
            </span>
            <div className="text-xs text-muted-foreground font-medium">
              {isSender && eta > 0 ? `ETA: ${formatEta(eta)}` : isPaused ? 'Paused' : 'Streaming live'}
            </div>
          </div>
        </div>

        {/* Overall Progress Bar in Signal Yellow */}
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-yellow-400 rounded-full transition-all duration-200 shadow-[0_0_8px_rgba(250,204,21,0.5)]"
            style={{ width: `${overallPercent}%` }}
          />
        </div>

        {/* Current Active File Info */}
        {activeFile && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
            <div className="flex items-center gap-1.5 truncate max-w-[70%]">
              <FileText className="w-3.5 h-3.5 text-foreground shrink-0" />
              <span className="truncate text-foreground font-semibold">{activeFile.name}</span>
            </div>
            <span>
              {activeFile.status === 'verifying' ? (
                <span className="text-amber-500 font-semibold flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Verifying integrity...
                </span>
              ) : (
                <span className="font-medium">
                  {formatBytes(
                    isSender
                      ? (activeFile as any).sentBytes || 0
                      : activeFile.receivedBytes || 0,
                  )}{' '}
                  / {formatBytes(activeFile.size)}
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Per-file Progress List */}
      <div className="flex flex-col gap-1.5 rounded-xl bg-card border border-border p-3 max-h-[240px] overflow-y-auto drooit-card">
        <div className="text-xs font-semibold text-muted-foreground mb-1 px-1">
          Files in transfer ({snapshot.files.length})
        </div>

        {snapshot.files.map((file) => {
          const filePercent =
            file.size > 0
              ? Math.min(
                  100,
                  (((isSender ? (file as any).sentBytes : file.receivedBytes) || 0) /
                    file.size) *
                    100,
                )
              : 100;

          return (
            <div
              key={file.index}
              className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/80 text-xs gap-2"
            >
              <div className="flex items-center gap-2 truncate min-w-0">
                {file.status === 'done' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : file.status === 'failed' ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                ) : file.status === 'verifying' ? (
                  <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0" />
                ) : file.status === 'sending' ? (
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate font-medium text-foreground">{file.name}</span>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 text-xs">
                <span className="text-muted-foreground">{formatBytes(file.size)}</span>
                <span className="font-bold w-10 text-right text-foreground">
                  {file.status === 'done' ? '100%' : `${Math.round(filePercent)}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
