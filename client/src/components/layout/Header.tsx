import React from 'react';
import { Moon, Sun, Settings, HelpCircle, Shield } from 'lucide-react';
import { useTransferStore } from '../../store/transferStore.js';
import { Button } from '../common/Button.js';

interface HeaderProps {
  onOpenHowItWorks: () => void;
  onOpenPrivacy: () => void;
  onOpenSettings: () => void;
  onNavigateHome: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenHowItWorks,
  onOpenPrivacy,
  onOpenSettings,
  onNavigateHome,
}) => {
  const { theme, toggleTheme, deviceName } = useTransferStore();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="container flex h-14 items-center justify-between px-4 sm:px-6 max-w-5xl mx-auto">
        {/* Brand Logo */}
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-2 text-left transition-opacity hover:opacity-85 focus:outline-none"
        >
          <img
            src="/Drooit.png"
            alt="Drooit logo"
            className="h-8 w-8 object-contain"
          />
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-lg font-extrabold tracking-tight text-foreground flex items-center">
              drooit<span className="text-yellow-400 font-black text-xl leading-none">.</span>
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-1.5 py-0.5 rounded bg-secondary border border-border">
              P2P
            </span>
          </div>
        </button>

        {/* Right Navigation */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenHowItWorks}
            className="hidden sm:inline-flex text-xs font-medium text-muted-foreground hover:text-foreground h-8 px-3 rounded-lg"
          >
            <HelpCircle className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            How it works
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenPrivacy}
            className="hidden sm:inline-flex text-xs font-medium text-muted-foreground hover:text-foreground h-8 px-3 rounded-lg"
          >
            <Shield className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            Privacy
          </Button>

          <div className="h-4 w-[1px] bg-border mx-1 hidden sm:block" />

          {/* Device name pill */}
          <div className="hidden md:flex items-center px-2.5 py-1 rounded-md bg-secondary border border-border text-xs text-muted-foreground max-w-[160px] truncate font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 shrink-0 animate-pulse" />
            <span className="truncate text-foreground">{deviceName}</span>
          </div>

          {/* Theme Toggle */}
          <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground border-border"
          >
            {theme === 'dark' ? (
              <Sun className="h-3.5 w-3.5 text-foreground" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-foreground" />
            )}
          </Button>

          {/* Settings Modal */}
          <Button
            variant="outline"
            size="icon"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground border-border"
          >
            <Settings className="h-3.5 w-3.5 text-foreground" />
          </Button>
        </div>
      </div>
    </header>
  );
};
