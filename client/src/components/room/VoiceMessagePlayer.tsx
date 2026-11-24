import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';

interface VoiceMessagePlayerProps {
  audioPayloadBase64?: string;
  audioUrl?: string;
  durationSeconds?: number;
  mime?: string;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  audioPayloadBase64,
  audioUrl,
  durationSeconds = 0,
  mime = 'audio/webm',
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let src = audioUrl || '';
    if (!src && audioPayloadBase64) {
      try {
        const byteCharacters = atob(audioPayloadBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mime });
        src = URL.createObjectURL(blob);
        blobUrlRef.current = src;
      } catch {
        // base64 decode failure fallback
        src = `data:${mime};base64,${audioPayloadBase64}`;
      }
    }

    const audio = new Audio(src);
    audioRef.current = audio;

    audio.ontimeupdate = () => {
      if (audio.duration && audio.duration > 0) {
        setCurrentTime(audio.currentTime);
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    audio.onended = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };

    return () => {
      audio.pause();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      audioRef.current = null;
    };
  }, [audioPayloadBase64, audioUrl, mime]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = speed;
      void audioRef.current.play().then(() => setIsPlaying(true));
    }
  };

  const handleSpeedToggle = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const formatTime = (seconds: number) => {
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, '0')}`;
  };

  // 18 pseudo-random static heights for waveform aesthetics
  const WAVEFORM_HEIGHTS = [40, 65, 85, 30, 95, 60, 45, 90, 75, 50, 80, 100, 35, 70, 85, 55, 65, 40];

  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg bg-secondary/80 border border-border max-w-[280px] sm:max-w-[320px]">
      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        type="button"
        className="h-8 w-8 rounded-full bg-yellow-400 text-black flex items-center justify-center hover:bg-yellow-300 transition-transform active:scale-95 shrink-0 shadow-sm"
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black ml-0.5" />}
      </button>

      {/* Waveform & Timer */}
      <div className="flex-1 flex flex-col justify-center min-w-0">
        {/* Interactive Waveform Bars */}
        <div
          onClick={(e) => {
            if (!audioRef.current || !audioRef.current.duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const ratio = Math.max(0, Math.min(1, clickX / rect.width));
            audioRef.current.currentTime = ratio * audioRef.current.duration;
          }}
          className="flex items-center gap-[3px] h-6 cursor-pointer py-1"
        >
          {WAVEFORM_HEIGHTS.map((height, i) => {
            const barProgress = (i / WAVEFORM_HEIGHTS.length) * 100;
            const isActive = barProgress <= progress;
            return (
              <span
                key={i}
                style={{ height: `${height}%` }}
                className={`w-[3px] rounded-full transition-colors duration-100 ${
                  isActive ? 'bg-yellow-400' : 'bg-muted-foreground/30'
                }`}
              />
            );
          })}
        </div>

        {/* Timers */}
        <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
          <span>{formatTime(currentTime > 0 ? currentTime : durationSeconds)}</span>
          <span className="flex items-center gap-1">
            <Volume2 className="w-2.5 h-2.5" />
            <span>Voice Memo</span>
          </span>
        </div>
      </div>

      {/* Speed Multiplier Button */}
      <button
        onClick={handleSpeedToggle}
        type="button"
        className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted text-foreground transition-colors shrink-0"
      >
        {speed}x
      </button>
    </div>
  );
};
