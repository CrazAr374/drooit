import React, { useState } from 'react';
import {
  X,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Moon,
  Sun,
  Check,
  Zap,
  Lock,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useTransferStore } from '../../store/transferStore.js';
import { Button } from '../common/Button.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { deviceName, setDeviceName, theme, setTheme } = useTransferStore();
  const [localName, setLocalName] = useState(deviceName);
  const [isSaved, setIsSaved] = useState(false);
  const [statusChecking, setStatusChecking] = useState(false);
  const [statusResult, setStatusResult] = useState<'online' | 'standby' | null>(null);

  if (!isOpen) return null;

  const handleSaveName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (localName.trim() && localName.trim() !== deviceName) {
      setDeviceName(localName.trim());
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }
  };

  const handleCheckStatus = async () => {
    setStatusChecking(true);
    setStatusResult(null);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        setStatusResult('online');
      } else {
        setStatusResult('standby');
      }
    } catch {
      setStatusResult('standby');
    } finally {
      setStatusChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-xl bg-card border border-border shadow-2xl p-5 sm:p-6 flex flex-col gap-5 animate-in zoom-in-95 duration-150 drooit-card">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <img src="/Drooit.png" alt="Drooit" className="h-7 w-7 object-contain" />
            <div>
              <h3 className="font-display font-bold text-base text-foreground tracking-tight">
                Settings
              </h3>
              <p className="text-xs text-muted-foreground">
                Device preferences and connection status
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

        {/* Device Name Input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Smartphone className="w-3.5 h-3.5 text-foreground" />
              <span>Device Name</span>
            </span>
            {isSaved && (
              <span className="text-emerald-500 text-xs font-medium flex items-center gap-1">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </label>

          <form onSubmit={handleSaveName} className="relative flex items-center">
            <input
              type="text"
              maxLength={60}
              value={localName}
              onChange={(e) => {
                setLocalName(e.target.value);
                setIsSaved(false);
              }}
              onBlur={() => handleSaveName()}
              className="w-full h-10 pl-3 pr-16 rounded-lg bg-secondary/50 border border-border text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground transition-all font-medium"
              placeholder="e.g. Atharva-PC"
            />
            <div className="absolute right-1.5 flex items-center">
              <Button
                type="submit"
                variant={isSaved ? 'outline' : 'secondary'}
                size="sm"
                className="h-7 px-2.5 text-xs rounded-md"
              >
                {isSaved ? 'Saved' : 'Save'}
              </Button>
            </div>
          </form>
          <p className="text-[11px] text-muted-foreground">
            This name is visible to peers during pairing and transfers.
          </p>
        </div>

        {/* Appearance Control */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground">
            Appearance
          </label>
          <div className="grid grid-cols-2 p-1 rounded-lg bg-secondary/60 border border-border gap-1">
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex items-center justify-center gap-2 h-9 rounded-md text-xs font-medium transition-all ${
                theme === 'dark'
                  ? 'bg-card text-foreground shadow-sm border border-border/80 font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-foreground" />
              <span>Dark Theme</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center justify-center gap-2 h-9 rounded-md text-xs font-medium transition-all ${
                theme === 'light'
                  ? 'bg-card text-foreground shadow-sm border border-border/80 font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-yellow-500" />
              <span>Light Theme</span>
            </button>
          </div>
        </div>

        {/* Security & Transfer Engine Card */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Transfer Guarantees
            </span>
            <Button
              variant="outline"
              size="sm"
              isLoading={statusChecking}
              onClick={handleCheckStatus}
              className="text-xs h-7 px-2.5 rounded-md"
            >
              <RefreshCw className="w-3 h-3 mr-1 text-foreground" />
              Check Status
            </Button>
          </div>

          <div className="flex flex-col gap-2 p-3 rounded-lg bg-secondary/40 border border-border text-xs">
            <div className="flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-foreground shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-foreground">Live Browser Streaming</span>
                <span className="text-[11px] text-muted-foreground">
                  Direct memory stream without third-party cloud transit
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-1 border-t border-border/60">
              <Lock className="w-4 h-4 text-foreground shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-foreground">Ephemeral Privacy</span>
                <span className="text-[11px] text-muted-foreground">
                  All pairing tokens and transfer buffers clear on completion
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-1 border-t border-border/60">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-foreground">Encrypted Channel</span>
                <span className="text-[11px] text-muted-foreground">
                  Authenticated device-to-device direct connection
                </span>
              </div>
            </div>

            {statusResult && (
              <div className="mt-1 pt-2 border-t border-border/60 flex items-center gap-2 text-[11px]">
                {statusResult === 'online' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      Connection online and ready for transfer
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                    <span className="text-yellow-600 dark:text-yellow-400 font-semibold">
                      Ready for direct local device connection
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.clear();
                window.location.reload();
              } catch {}
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset app cache</span>
          </button>

          <Button
            variant="primary"
            size="sm"
            onClick={onClose}
            className="px-5 h-8 font-semibold text-xs rounded-md"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
