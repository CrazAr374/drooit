import React, { useEffect, useRef, useState } from 'react';
import { Mic, Send, Trash2, AlertCircle } from 'lucide-react';
import { AudioRecorder, type AudioRecordingResult } from '../../lib/audio/recorder.js';
import { Button } from '../common/Button.js';

interface VoiceRecorderButtonProps {
  onRecordingComplete: (result: AudioRecordingResult) => void;
  disabled?: boolean;
}

export const VoiceRecorderButton: React.FC<VoiceRecorderButtonProps> = ({
  onRecordingComplete,
  disabled = false,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.cancel();
    };
  }, []);

  const handleStart = async () => {
    setError(null);
    if (!AudioRecorder.isSupported()) {
      setError('Microphone access is not supported in this browser.');
      return;
    }

    try {
      const recorder = new AudioRecorder();
      recorderRef.current = recorder;
      await recorder.start();
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev >= 120) {
            void handleSend();
            return 120;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      setError('Microphone permission denied.');
    }
  };

  const handleCancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setIsRecording(false);
    setDuration(0);
  };

  const handleSend = async () => {
    if (!recorderRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const result = await recorderRef.current.stop();
      setIsRecording(false);
      setDuration(0);
      recorderRef.current = null;
      onRecordingComplete(result);
    } catch (err) {
      handleCancel();
      setError('Failed to record audio.');
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remaining = sec % 60;
    return `${mins}:${remaining.toString().padStart(2, '0')}`;
  };

  if (isRecording) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-yellow-500/40 shadow-lg animate-in fade-in">
        {/* Pulsing Signal Yellow recording status */}
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping" />
        <span className="font-mono text-xs font-bold text-yellow-400">
          REC {formatSeconds(duration)}
        </span>

        {/* Audio Visualizer Pulse */}
        <div className="flex items-center gap-0.5 mx-2 h-4">
          <span className="w-0.5 h-3 bg-yellow-400 animate-pulse" />
          <span className="w-0.5 h-4 bg-yellow-400 animate-pulse delay-75" />
          <span className="w-0.5 h-2 bg-yellow-400 animate-pulse delay-150" />
          <span className="w-0.5 h-4 bg-yellow-400 animate-pulse delay-100" />
          <span className="w-0.5 h-2.5 bg-yellow-400 animate-pulse" />
        </div>

        {/* Cancel Button */}
        <button
          onClick={handleCancel}
          type="button"
          title="Cancel recording"
          className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* Send Button */}
        <button
          onClick={handleSend}
          type="button"
          title="Send voice memo"
          className="p-1 rounded-md bg-yellow-400 text-black hover:bg-yellow-300 font-bold transition-transform active:scale-95 shadow-sm"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-center">
      <Button
        variant="ghost"
        size="sm"
        type="button"
        disabled={disabled}
        onClick={handleStart}
        title="Record voice note"
        className="h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary"
      >
        <Mic className="w-4 h-4" />
      </Button>
      {error && (
        <div className="absolute bottom-full mb-1 right-0 p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-[11px] whitespace-nowrap flex items-center gap-1 z-30">
          <AlertCircle className="w-3 h-3" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
