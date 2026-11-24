import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface NumericCodeDisplayProps {
  code: string;
}

export const NumericCodeDisplay: React.FC<NumericCodeDisplayProps> = ({ code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  const digits = code.split('');

  return (
    <div className="flex flex-col items-center text-center w-full">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-[11px] font-mono tracking-widest uppercase font-bold text-muted-foreground">
          6-Digit Pairing Key
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
      </div>

      <div
        onClick={handleCopy}
        className="group flex flex-col items-center cursor-pointer select-none"
        title="Click to copy pairing code"
      >
        {/* 6 Hardware Digit Tiles */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2">
          {digits.map((digit, idx) => (
            <React.Fragment key={idx}>
              <div
                className={`flex items-center justify-center w-10 h-13 sm:w-12 sm:h-14 rounded-lg border transition-all duration-150 ${
                  copied
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500 shadow-sm'
                    : 'bg-secondary/70 border-border text-foreground shadow-xs group-hover:border-yellow-400/70 group-hover:bg-secondary'
                }`}
              >
                <span className="font-display font-extrabold text-2xl sm:text-3xl tracking-tight">
                  {digit}
                </span>
              </div>
              {idx === 2 && (
                <div className="w-2.5 h-[2px] bg-yellow-400 mx-1 rounded-full shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Copy Status Pill */}
        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-secondary/80 hover:bg-secondary border border-border text-xs transition-all active:scale-95">
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500 font-bold text-[11px]">Code copied to clipboard</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
              <span className="text-muted-foreground group-hover:text-foreground font-medium text-[11px]">
                Click to copy code
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
