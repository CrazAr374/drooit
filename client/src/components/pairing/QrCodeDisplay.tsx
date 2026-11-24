import React, { useEffect, useState } from 'react';
import { Copy, Check, Clock } from 'lucide-react';
import { formatCountdown } from '@shared/format.js';
import { Button } from '../common/Button.js';

interface QrCodeDisplayProps {
  qrDataUrl: string;
  inviteUrl: string;
  expiresAt: number | null;
}

export const QrCodeDisplay: React.FC<QrCodeDisplayProps> = ({
  qrDataUrl,
  inviteUrl,
  expiresAt,
}) => {
  const [copied, setCopied] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      setRemainingMs(Math.max(0, expiresAt - Date.now()));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failure
    }
  };

  return (
    <div className="flex flex-col items-center text-center">
      {/* Precision Pairing Badge */}
      <div className="inline-flex items-center gap-2 px-2.5 py-1 mb-3.5 rounded text-[11px] font-mono tracking-wider font-bold text-foreground bg-secondary/80 border border-border">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse shadow-[0_0_6px_#facc15]" />
        <span>EPHEMERAL OPTICAL PAIRING</span>
      </div>

      {/* QR Code Container with Precision Optical Reticle Brackets */}
      <div className="relative p-1 mb-3">
        {/* Signal Yellow Corner Reticles */}
        <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-2 border-l-2 border-yellow-400 rounded-tl-xs pointer-events-none shadow-[0_0_6px_rgba(250,204,21,0.4)]" />
        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-yellow-400 rounded-tr-xs pointer-events-none shadow-[0_0_6px_rgba(250,204,21,0.4)]" />
        <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-yellow-400 rounded-bl-xs pointer-events-none shadow-[0_0_6px_rgba(250,204,21,0.4)]" />
        <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-yellow-400 rounded-br-xs pointer-events-none shadow-[0_0_6px_rgba(250,204,21,0.4)]" />

        <div className="p-3 bg-white rounded-lg shadow-sm border border-border">
          <img
            src={qrDataUrl}
            alt="Scan QR code to connect"
            className="w-48 h-48 sm:w-54 sm:h-54 object-contain rounded-sm"
          />
        </div>
      </div>

      {/* Expiry Timer & Action */}
      <div className="flex items-center gap-2 mt-1">
        {expiresAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-3 py-1 rounded-md border border-border font-mono">
            <Clock className="w-3.5 h-3.5 text-yellow-500 dark:text-yellow-400" />
            <span className="text-[11px] uppercase tracking-wider">Expires:</span>
            <span className="font-bold text-foreground">
              {formatCountdown(remainingMs)}
            </span>
          </div>
        )}

        {/* Copy Direct Link Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          className="text-xs h-7.5 px-3 gap-1.5 border-border rounded-md font-semibold"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500 font-semibold">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Copy link</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
