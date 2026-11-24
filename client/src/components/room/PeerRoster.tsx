import React from 'react';
import { Users, Wifi, UserX, LogOut, Laptop, Smartphone, Monitor } from 'lucide-react';
import type { PeerSnapshot } from '@shared/types.js';
import { Button } from '../common/Button.js';

interface PeerRosterProps {
  peers: PeerSnapshot[];
  isHost: boolean;
  onDisconnect: () => void;
  onRemovePeer?: (peerId: string) => void;
}

export const PeerRoster: React.FC<PeerRosterProps> = ({
  peers,
  isHost,
  onDisconnect,
  onRemovePeer,
}) => {
  const getDeviceIcon = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes('ios') || p.includes('android') || p.includes('phone') || p.includes('mobile')) {
      return <Smartphone className="w-3.5 h-3.5" />;
    }
    if (p.includes('mac') || p.includes('laptop')) {
      return <Laptop className="w-3.5 h-3.5" />;
    }
    return <Monitor className="w-3.5 h-3.5" />;
  };

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-card border border-border drooit-card">
      <div className="flex items-center justify-between pb-2 border-b border-border text-xs">
        <div className="flex items-center gap-1.5 font-bold font-display text-foreground">
          <Users className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
          <span>Connected Devices</span>
          <span className="px-1.5 py-0.2 rounded-full bg-secondary text-[11px] font-mono border border-border">
            {peers.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDisconnect}
          title="Disconnect from session"
          className="text-xs h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Leave Room</span>
        </Button>
      </div>

      <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-1">
        {peers.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center">
            Waiting for peers to join this room...
          </p>
        ) : (
          peers.map((peer) => (
            <div
              key={peer.peerId}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-secondary/60 border border-border/80 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="p-1 rounded bg-background border border-border text-muted-foreground shrink-0">
                  {getDeviceIcon(peer.device.platform)}
                </span>
                <div className="truncate">
                  <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                    <span>{peer.device.name}</span>
                    {peer.role === 'sender' && (
                      <span className="px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-yellow-400/20 text-yellow-500 dark:text-yellow-400 border border-yellow-400/30 uppercase">
                        Host
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate font-mono">
                    {peer.device.platform || 'Connected peer'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-mono">
                  <Wifi className="w-3 h-3" />
                  <span>Direct</span>
                </span>

                {isHost && peer.role !== 'sender' && (
                  <button
                    onClick={() => onRemovePeer?.(peer.peerId)}
                    title="Remove peer"
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
