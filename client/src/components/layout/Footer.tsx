import React from 'react';
import { ShieldCheck, Zap, Lock } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-border/80 bg-card/50 py-6 sm:py-8 mt-auto">
      <div className="container px-4 sm:px-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 sm:gap-6 font-medium">
            <div className="flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-foreground/80" />
              <span>Peer-to-peer web sharing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-foreground/80" />
              <span>No sign-up or accounts required</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Bit-for-bit verified transfer</span>
            </div>
          </div>

          <div className="flex items-center gap-2 font-medium">
            <img src="/Drooit.png" alt="Drooit" className="h-4 w-4 object-contain" />
            <span className="font-display font-bold text-foreground">drooit</span>
            <span>•</span>
            <span>Send anything. Anywhere.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
