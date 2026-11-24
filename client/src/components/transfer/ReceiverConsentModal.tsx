import React, { useState } from 'react';
import {
  FileText,
  ShieldCheck,
  CheckCircle,
  XCircle,
  CheckSquare,
  Square,
  Download,
} from 'lucide-react';
import { formatBytes, pluralize } from '@shared/format.js';
import type { SharedFileMeta } from '@shared/protocol.js';
import { Button } from '../common/Button.js';

interface ReceiverConsentModalProps {
  files: SharedFileMeta[];
  peerName: string | null;
  onAccept: (selectedIndexes: number[]) => void;
  onReject: () => void;
}

export const ReceiverConsentModal: React.FC<ReceiverConsentModalProps> = ({
  files,
  peerName,
  onAccept,
  onReject,
}) => {
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(
    new Set(files.map((f) => f.index)),
  );

  const toggleFile = (index: number) => {
    const next = new Set(selectedIndexes);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedIndexes(next);
  };

  const toggleAll = () => {
    if (selectedIndexes.size === files.length) {
      setSelectedIndexes(new Set());
    } else {
      setSelectedIndexes(new Set(files.map((f) => f.index)));
    }
  };

  const totalBytes = files
    .filter((f) => selectedIndexes.has(f.index))
    .reduce((sum, f) => sum + f.size, 0);

  const handleAccept = () => {
    if (selectedIndexes.size === 0) return;
    onAccept(Array.from(selectedIndexes));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg rounded-xl bg-card border border-border shadow-2xl p-6 sm:p-7 flex flex-col gap-5 drooit-card animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-foreground border border-border shrink-0">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold font-display text-foreground tracking-tight">
              Incoming Files
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              <span className="font-semibold text-foreground">{peerName || 'Sender'}</span> wants to send you {pluralize(files.length, 'file')}.
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary border border-border text-xs text-foreground font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>Your approval is required before files are transferred to your browser.</span>
        </div>

        {/* File List */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1 font-medium">
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-1.5 hover:text-foreground font-semibold"
            >
              {selectedIndexes.size === files.length ? (
                <CheckSquare className="w-4 h-4 text-foreground" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span>Select all ({files.length})</span>
            </button>
            <span>Total: {formatBytes(totalBytes)}</span>
          </div>

          <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
            {files.map((file) => {
              const isSelected = selectedIndexes.has(file.index);
              return (
                <div
                  key={file.index}
                  onClick={() => toggleFile(file.index)}
                  className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-card border-primary/50 shadow-sm'
                      : 'bg-secondary/40 border-border opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate min-w-0 pr-2">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-primary shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-foreground" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                    <FileText className="w-3.5 h-3.5 text-foreground shrink-0" />
                    <span className="text-xs font-semibold text-foreground truncate">
                      {file.name}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium shrink-0">
                    {formatBytes(file.size)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReject}
            className="rounded-md text-xs h-9 px-3.5 font-medium"
          >
            <XCircle className="w-3.5 h-3.5 mr-1" />
            Decline
          </Button>

          <Button
            variant="accent"
            size="md"
            disabled={selectedIndexes.size === 0}
            onClick={handleAccept}
            className="rounded-lg font-bold text-xs h-9 px-5"
          >
            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            Accept & Receive ({selectedIndexes.size})
          </Button>
        </div>
      </div>
    </div>
  );
};
