import React from 'react';
import {
  MessageSquare,
  Radio,
  ArrowRight,
  Shield,
  Zap,
  HardDrive,
  Lock,
} from 'lucide-react';
import { Button } from '../components/common/Button.js';

interface HomePageProps {
  onNavigateSend: () => void;
  onNavigateReceive: () => void;
  onOpenHowItWorks: () => void;
  onOpenPrivacy: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onNavigateSend,
  onNavigateReceive,
  onOpenHowItWorks,
  onOpenPrivacy,
}) => {
  return (
    <div className="flex flex-col items-center w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-12 gap-10 sm:gap-14">
      {/* Hero Header */}
      <div className="flex flex-col items-center text-center gap-3.5 max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium bg-secondary text-foreground border border-border shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse shadow-[0_0_8px_#facc15]" />
          <span>Direct Peer-to-Peer • End-to-End Encrypted</span>
        </div>

        <h1 className="font-display text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground leading-[1.1]">
          Connect first.{' '}
          <span className="text-muted-foreground block font-bold">
            Chat encrypted & share files.
          </span>
        </h1>

        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-lg font-normal">
          Direct browser-to-browser P2P rooms with end-to-end encryption. Real-time chat, voice memos, and direct high-speed file streaming. Zero accounts. Zero cloud storage.
        </p>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onOpenHowItWorks}
            className="text-xs font-semibold text-foreground hover:underline transition-colors"
          >
            How it works
          </button>
          <span className="text-muted-foreground/40 text-xs">•</span>
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline transition-colors"
          >
            Privacy & Security
          </button>
        </div>
      </div>

      {/* Two Core Action Cards — Tactile Precision Console */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-3xl">
        {/* Create Encrypted Room Card */}
        <div
          onClick={onNavigateSend}
          className="group relative flex flex-col justify-between p-7 rounded-xl bg-card border border-border drooit-card drooit-card-hover cursor-pointer transition-all duration-150 text-left"
        >
          <div>
            <div className="flex items-center justify-between w-full mb-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-foreground border border-border shadow-sm">
                <MessageSquare className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-2 py-0.5 rounded bg-secondary border border-border">
                01 / HOST ROOM
              </span>
            </div>

            <h2 className="font-display text-xl font-bold text-foreground mb-1.5 tracking-tight">
              Create Encrypted Room
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed mb-5">
              Start an encrypted P2P space instantly. Connect first with a 6-digit PIN or optical QR code, then chat, send voice notes, and drop files together in real time.
            </p>

            <div className="flex flex-wrap gap-1.5 mb-6">
              {['E2E Encrypted Chat', 'Voice Memos', 'Folder Sharing', 'Lossless Files', 'Zero Accounts'].map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded border border-border/80"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <Button
            variant="accent"
            size="md"
            className="w-full font-bold text-xs h-10 rounded-lg group-hover:opacity-95"
          >
            <span>Create Room & Connect</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1.5 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>

        {/* Join Encrypted Room Card */}
        <div
          onClick={onNavigateReceive}
          className="group relative flex flex-col justify-between p-7 rounded-xl bg-card border border-border drooit-card drooit-card-hover cursor-pointer transition-all duration-150 text-left"
        >
          <div>
            <div className="flex items-center justify-between w-full mb-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-foreground border border-border shadow-sm">
                <Radio className="h-5 w-5 text-foreground" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-2 py-0.5 rounded bg-secondary border border-border">
                02 / JOIN ROOM
              </span>
            </div>

            <h2 className="font-display text-xl font-bold text-foreground mb-1.5 tracking-tight">
              Join Existing Room
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed mb-5">
              Scan an optical QR code with your phone camera or enter a 6-digit PIN to connect directly to an active space. Chat instantly and receive files straight to your downloads.
            </p>

            <div className="flex flex-wrap gap-1.5 mb-6">
              {['6-Digit PIN', 'Camera Scan', 'Instant Connect', 'Direct P2P', 'End-to-End Encrypted'].map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded border border-border/80"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <Button
            variant="secondary"
            size="md"
            className="w-full font-semibold text-xs h-10 rounded-lg border-border group-hover:bg-secondary/70"
          >
            <span>Enter PIN or Scan QR</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1.5 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </div>

      {/* Engineering Specifications — Real Technical Substance, No AI Fluff */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
        <div className="flex flex-col p-5 rounded-xl bg-card border border-border drooit-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-foreground border border-border">
              <Lock className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded border border-border">
              Encrypted
            </span>
          </div>
          <h3 className="font-bold text-sm text-foreground mb-1 tracking-tight">
            End-to-End Encrypted Chat
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Text chat, voice notes, and file attachments stream directly over WebRTC DataChannels. Keys stay strictly on your devices — no server ever sees your messages.
          </p>
        </div>

        <div className="flex flex-col p-5 rounded-xl bg-card border border-border drooit-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-foreground border border-border">
              <HardDrive className="w-4 h-4 text-emerald-500" />
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded border border-border">
              100% Lossless
            </span>
          </div>
          <h3 className="font-bold text-sm text-foreground mb-1 tracking-tight">
            Direct File & Folder Streaming
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Zero cloud uploads and zero compression. Large archives, 4K video, and folders stream bit-for-bit with SHA-256 verification and OPFS disk memory protection.
          </p>
        </div>

        <div className="flex flex-col p-5 rounded-xl bg-card border border-border drooit-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-foreground border border-border">
              <Zap className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded border border-border">
              Connect First
            </span>
          </div>
          <h3 className="font-bold text-sm text-foreground mb-1 tracking-tight">
            Connect First, Share Anything
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            No need to pick files beforehand. Open a room, connect your devices instantly, and freely exchange chats, voice notes, and files back and forth in real time.
          </p>
        </div>
      </div>

      {/* Clean Privacy Assurance Bar */}
      <div className="w-full max-w-3xl flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border text-xs text-muted-foreground">
        <div className="flex items-center gap-2.5">
          <Shield className="w-4 h-4 text-foreground shrink-0" />
          <span>Drooit does not retain chats, voice notes, or files. Connections are strictly ephemeral and vanish when closed.</span>
        </div>
      </div>
    </div>
  );
};
