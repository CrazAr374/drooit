import React from 'react';
import { ShieldCheck, Zap } from 'lucide-react';

export interface ConnectionBadgeProps {
  mode: 'direct' | 'relay' | 'unknown';
  state?: string;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({ mode, state }) => {
  if (mode === 'direct') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-secondary text-foreground border border-border shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <Zap className="w-3.5 h-3.5 text-emerald-500" />
        <span>Direct P2P</span>
      </div>
    );
  }

  if (mode === 'relay') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-secondary text-foreground border border-border shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
        <span>Secured Relay</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-secondary text-muted-foreground border border-border">
      <span className="w-1.5 h-1.5 rounded-full bg-foreground/60 animate-ping" />
      <span>{state === 'signaling' || state === 'connecting' ? 'Connecting...' : 'Ready'}</span>
    </div>
  );
};
