import React from 'react';
import {
  UploadCloud,
  DownloadCloud,
  ArrowRight,
  Shield,
  Zap,
  HardDrive,
  Cpu,
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
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          <span>Direct Peer-to-Peer • Zero Cloud Storage</span>
        </div>

        <h1 className="font-display text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground leading-[1.1]">
          Share files across devices.{' '}
          <span className="text-muted-foreground block font-bold">
            Instantly and privately.
          </span>
        </h1>

        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-lg font-normal">
          No accounts. No cloud uploads. Direct browser-to-browser transfers over your local network with end-to-end encryption.
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
        {/* Send Files Card */}
        <div
          onClick={onNavigateSend}
          className="group relative flex flex-col justify-between p-7 rounded-xl bg-card border border-border drooit-card drooit-card-hover cursor-pointer transition-all duration-150 text-left"
        >
          <div>
            <div className="flex items-center justify-between w-full mb-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-foreground border border-border shadow-sm">
                <UploadCloud className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-2 py-0.5 rounded bg-secondary border border-border">
                01 / OUTGOING
              </span>
            </div>

            <h2 className="font-display text-xl font-bold text-foreground mb-1.5 tracking-tight">
              Send files
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed mb-5">
              Drop photos, high-res video, audio, or entire directory folders. Generates an instant optical QR code or a 6-digit numeric PIN.
            </p>

            <div className="flex flex-wrap gap-1.5 mb-6">
              {['Photos', '4K Video', 'Documents', 'Folders', 'Archives'].map((tag) => (
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
            <span>Select Files to Send</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1.5 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>

        {/* Receive Files Card */}
        <div
          onClick={onNavigateReceive}
          className="group relative flex flex-col justify-between p-7 rounded-xl bg-card border border-border drooit-card drooit-card-hover cursor-pointer transition-all duration-150 text-left"
        >
          <div>
            <div className="flex items-center justify-between w-full mb-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-foreground border border-border shadow-sm">
                <DownloadCloud className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-2 py-0.5 rounded bg-secondary border border-border">
                02 / INCOMING
              </span>
            </div>

            <h2 className="font-display text-xl font-bold text-foreground mb-1.5 tracking-tight">
              Receive files
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed mb-5">
              Scan an optical QR code with your phone camera or enter a 6-digit PIN to stream files straight to your device.
            </p>

            <div className="flex flex-wrap gap-1.5 mb-6">
              {['Camera Scan', '6-Digit PIN', 'Direct Save', 'ZIP Export', 'Verified'].map((tag) => (
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
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded border border-border">
              0 B Cloud
            </span>
          </div>
          <h3 className="font-bold text-sm text-foreground mb-1 tracking-tight">
            Direct Peer-to-Peer
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Transfers stream directly between browser memories across local Wi-Fi or WebRTC data channels with zero third-party cloud storage.
          </p>
        </div>

        <div className="flex flex-col p-5 rounded-xl bg-card border border-border drooit-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-foreground border border-border">
              <HardDrive className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded border border-border">
              100% Lossless
            </span>
          </div>
          <h3 className="font-bold text-sm text-foreground mb-1 tracking-tight">
            Bit-for-Bit Fidelity
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Zero re-encoding or compression. Large archives, 4K footage, and RAW images transfer in exact bit-for-bit quality with SHA-256 verification.
          </p>
        </div>

        <div className="flex flex-col p-5 rounded-xl bg-card border border-border drooit-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-foreground border border-border">
              <Cpu className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded border border-border">
              Cross-Platform
            </span>
          </div>
          <h3 className="font-bold text-sm text-foreground mb-1 tracking-tight">
            Zero Install Required
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Runs natively inside modern web browsers across iOS, Android, macOS, Windows, and Linux without native apps or drivers.
          </p>
        </div>
      </div>

      {/* Clean Privacy Assurance Bar */}
      <div className="w-full max-w-3xl flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border text-xs text-muted-foreground">
        <div className="flex items-center gap-2.5">
          <Shield className="w-4 h-4 text-foreground shrink-0" />
          <span>Drooit does not retain files or track users. Sessions are strictly ephemeral and vanish when closed.</span>
        </div>
      </div>
    </div>
  );
};
