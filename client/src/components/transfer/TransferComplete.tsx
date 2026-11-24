import React from 'react';
import {
  CheckCircle2,
  Download,
  Archive,
  RefreshCw,
  Home,
  ShieldCheck,
} from 'lucide-react';
import { formatBytes, pluralize } from '@shared/format.js';
import { Button } from '../common/Button.js';
import type { ReceivedFile } from '../../lib/transfer/types.js';

interface TransferCompleteProps {
  role: 'sender' | 'receiver';
  receivedFiles?: ReceivedFile[];
  totalBytes?: number;
  onDownloadFile?: (index: number) => void;
  onDownloadAllZip?: () => void;
  onReset: () => void;
}

export const TransferComplete: React.FC<TransferCompleteProps> = ({
  role,
  receivedFiles = [],
  totalBytes = 0,
  onDownloadFile,
  onDownloadAllZip,
  onReset,
}) => {
  const isReceiver = role === 'receiver';

  return (
    <div className="flex flex-col items-center text-center p-6 sm:p-8 max-w-lg mx-auto bg-card rounded-xl border border-border shadow-2xl animate-in zoom-in-95 drooit-card">
      {/* Icon */}
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 mb-4 border border-emerald-500/25">
        <CheckCircle2 className="h-8 w-8 text-emerald-500 animate-in zoom-in-50" />
      </div>

      <h2 className="text-xl sm:text-2xl font-display font-extrabold tracking-tight text-foreground mb-1">
        Transfer Complete
      </h2>
      <p className="text-xs text-muted-foreground mb-5 max-w-sm leading-relaxed">
        {isReceiver
          ? `All ${pluralize(receivedFiles.length, 'file')} received directly to your browser with bit-for-bit verification.`
          : 'All files successfully transferred directly to the receiver with bit-for-bit verification.'}
      </p>

      {/* Summary Stats */}
      <div className="w-full grid grid-cols-2 gap-2.5 p-3.5 rounded-lg bg-secondary/50 border border-border mb-5 text-left">
        <div>
          <span className="text-xs font-semibold text-muted-foreground">
            Total Transferred
          </span>
          <div className="text-base font-bold text-foreground font-display mt-0.5">
            {formatBytes(totalBytes)}
          </div>
        </div>
        <div>
          <span className="text-xs font-semibold text-muted-foreground">
            Security Status
          </span>
          <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-display mt-0.5">
            <ShieldCheck className="w-4 h-4" />
            <span>Direct & Verified</span>
          </div>
        </div>
      </div>

      {/* Receiver Actions */}
      {isReceiver && receivedFiles.length > 0 && (
        <div className="w-full flex flex-col gap-2.5 mb-5">
          {receivedFiles.length > 1 && onDownloadAllZip && (
            <Button
              variant="accent"
              size="md"
              onClick={onDownloadAllZip}
              className="w-full rounded-lg font-bold text-xs h-10"
            >
              <Archive className="w-3.5 h-3.5 mr-1.5" />
              Download All as .ZIP Archive
            </Button>
          )}

          {/* Individual File Downloads */}
          <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto w-full text-left">
            {receivedFiles.map((file) => (
              <div
                key={file.meta.index}
                className="flex items-center justify-between p-2.5 rounded-md bg-secondary/40 border border-border text-xs"
              >
                <span className="truncate font-medium text-foreground max-w-[200px]">
                  {file.meta.name}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDownloadFile?.(file.meta.index)}
                  className="h-7 px-2.5 text-xs ml-2 shrink-0 rounded-md font-medium"
                >
                  <Download className="w-3 h-3 mr-1" />
                  Save
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Action Controls */}
      <div className="flex items-center gap-2.5 w-full pt-3 border-t border-border">
        <Button
          variant="secondary"
          size="md"
          onClick={onReset}
          className="flex-1 rounded-lg border-border font-semibold text-xs h-9"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-foreground" />
          Transfer another
        </Button>
        <Button
          variant="outline"
          size="md"
          onClick={onReset}
          className="rounded-lg border-border text-muted-foreground hover:text-foreground h-9 px-3"
          title="Return to home"
        >
          <Home className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
