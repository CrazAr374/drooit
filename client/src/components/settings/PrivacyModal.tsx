import React from 'react';
import { X, Lock, EyeOff, Zap, ServerOff } from 'lucide-react';
import { Button } from '../common/Button.js';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const points = [
    {
      icon: <ServerOff className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />,
      title: 'Zero server storage',
      desc: 'Chats, voice memos, and files stream live directly between your devices and never touch a cloud server, disk, or database. When the room closes, everything vanishes.',
    },
    {
      icon: <Zap className="w-4 h-4 text-emerald-500" />,
      title: 'Direct memory-to-memory',
      desc: 'Payloads stream directly from memory to memory at full local Wi-Fi speeds without cloud throttling.',
    },
    {
      icon: <Lock className="w-4 h-4 text-foreground" />,
      title: 'End-to-end encrypted',
      desc: 'Direct P2P WebRTC tunnels. All chats, voice recordings, and file chunks are encrypted between peers. No third party or server can intercept your data.',
    },
    {
      icon: <EyeOff className="w-4 h-4 text-foreground" />,
      title: 'No accounts or tracking',
      desc: 'No sign-up, no emails, no phone numbers, no cookies, and no tracking. Open Drooit and transfer instantly.',
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
                Privacy & Security
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your files stay strictly between your devices
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

        <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-1">
          {points.map((p, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3.5 p-3.5 rounded-lg bg-secondary/40 border border-border"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border shrink-0 shadow-sm">
                {p.icon}
              </div>
              <div>
                <h4 className="font-bold text-xs text-foreground mb-0.5 tracking-tight">{p.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end pt-3.5 border-t border-border">
          <Button variant="primary" size="sm" onClick={onClose} className="rounded-md px-5 h-8 font-semibold text-xs">
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
};
