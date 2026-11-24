import React from 'react';
import { X, Sparkles, QrCode, Zap, ShieldCheck } from 'lucide-react';
import { Button } from '../common/Button.js';

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HowItWorksModal: React.FC<HowItWorksModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const steps = [
    {
      icon: <QrCode className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />,
      title: '1. Connect first with PIN or QR',
      desc: 'Create or join an encrypted room instantly with a 6-digit code or optical QR scan. Zero sign-up, zero accounts.',
    },
    {
      icon: <Sparkles className="w-4 h-4 text-yellow-500" />,
      title: '2. End-to-end encrypted chat & voice',
      desc: 'Chat in real time, record voice notes, and tag folder references directly over peer-to-peer WebRTC data channels.',
    },
    {
      icon: <Zap className="w-4 h-4 text-emerald-500" />,
      title: '3. Lossless file & folder sharing',
      desc: 'Drag and drop files or folders anytime. Payloads stream live directly between browser memories with bit-for-bit SHA-256 verification.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg rounded-xl bg-card border border-border shadow-2xl p-6 sm:p-7 flex flex-col gap-5 drooit-card animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-3.5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <img src="/Drooit.png" alt="Drooit" className="h-7 w-7 object-contain" />
            <div>
              <h3 className="font-display font-bold text-base text-foreground tracking-tight">
                How Drooit Works
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fast, private sharing in three simple steps
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {steps.map((s, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3.5 p-3.5 rounded-lg bg-secondary/40 border border-border"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border shrink-0 shadow-sm">
                {s.icon}
              </div>
              <div>
                <h4 className="font-bold text-xs text-foreground mb-0.5 tracking-tight">{s.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-3.5 border-t border-border">
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Direct & 100% Secured</span>
          </div>
          <Button variant="primary" size="sm" onClick={onClose} className="rounded-md px-5 h-8 font-semibold text-xs">
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
};
