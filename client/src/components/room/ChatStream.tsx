import React, { useEffect, useRef, useState } from 'react';
import { Send, Paperclip, Folder, File as FileIcon, X, Download, Mic } from 'lucide-react';
import type { ChatMessage } from '@shared/types.js';
import { VoiceRecorderButton } from './VoiceRecorderButton.js';
import { VoiceMessagePlayer } from './VoiceMessagePlayer.js';
import type { AudioRecordingResult } from '../../lib/audio/recorder.js';
import { formatBytes } from '@shared/format.js';

interface ChatStreamProps {
  messages: ChatMessage[];
  currentPeerName?: string;
  activeFolderRef?: string;
  onClearFolderRef?: () => void;
  onSendMessage: (
    text: string,
    folderRef?: string,
    files?: File[],
    voice?: AudioRecordingResult,
  ) => void;
  onDownloadFile?: (fileName: string, mime?: string) => void;
}

export const ChatStream: React.FC<ChatStreamProps> = ({
  messages,
  currentPeerName = 'You',
  activeFolderRef,
  onClearFolderRef,
  onSendMessage,
  onDownloadFile,
}) => {
  const [inputText, setInputText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [stagedVoice, setStagedVoice] = useState<AudioRecordingResult | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const hasText = Boolean(inputText.trim());
    const hasFiles = attachedFiles.length > 0;
    const hasVoice = Boolean(stagedVoice);

    if (!hasText && !hasFiles && !hasVoice) return;

    onSendMessage(
      inputText.trim(),
      activeFolderRef,
      hasFiles ? attachedFiles : undefined,
      stagedVoice || undefined,
    );
    setInputText('');
    setAttachedFiles([]);
    setStagedVoice(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      setAttachedFiles((prev) => [...prev, ...selected]);
    }
    // Reset file input so the same file can be selected again if removed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachedFile = (idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleVoiceRecorded = (result: AudioRecordingResult) => {
    // If files or text are already present, stage voice alongside them;
    // Otherwise stage voice so user can add text/files or send immediately
    setStagedVoice(result);
  };

  const canSend = Boolean(inputText.trim() || attachedFiles.length > 0 || stagedVoice);

  return (
    <div className="flex flex-col h-full rounded-xl bg-card border border-border drooit-card overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-border bg-secondary/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shadow-[0_0_6px_#facc15]" />
          <h4 className="text-xs font-bold font-display uppercase tracking-wider text-foreground">
            Encrypted Room Chat
          </h4>
        </div>
        {activeFolderRef && (
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-400/10 text-yellow-500 dark:text-yellow-400 border border-yellow-400/30 text-[10px] font-mono">
            <Folder className="w-3 h-3" />
            <span className="truncate max-w-[120px]">{activeFolderRef}</span>
            <button onClick={onClearFolderRef} className="hover:text-foreground">
              <X className="w-2.5 h-2.5 ml-0.5" />
            </button>
          </div>
        )}
      </div>

      {/* Messages Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-muted-foreground">
            <p className="text-xs font-medium">No messages yet in this room.</p>
            <p className="text-[11px] mt-1 text-muted-foreground/80">
              Send a text, attach files, or record a voice note below.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderPeerId === 'me' || msg.senderName === currentPeerName;
            const isSystem = msg.senderPeerId === 'system';

            if (isSystem) {
              return (
                <div key={msg.id} className="text-center py-1">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono text-muted-foreground bg-secondary/70 border border-border/60">
                    {msg.text}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] ${
                  isMe ? 'ml-auto' : 'mr-auto'
                }`}
              >
                {/* Sender badge & timestamp */}
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-muted-foreground font-mono">
                  <span className="font-semibold text-foreground">{isMe ? 'You' : msg.senderName}</span>
                  <span>•</span>
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {/* Message Content Bubble */}
                <div
                  className={`p-3 rounded-xl border text-xs shadow-sm space-y-2 ${
                    isMe
                      ? 'bg-yellow-400/10 border-yellow-400/30 text-foreground rounded-tr-xs'
                      : 'bg-secondary border-border text-foreground rounded-tl-xs'
                  }`}
                >
                  {/* Folder Reference Tag */}
                  {msg.folderRef && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-background/80 text-[10px] font-mono text-yellow-500 dark:text-yellow-400 border border-border">
                      <Folder className="w-3 h-3" />
                      <span>{msg.folderRef}</span>
                    </div>
                  )}

                  {/* Attached Voice Note */}
                  {msg.audioPayloadBase64 && (
                    <VoiceMessagePlayer
                      audioPayloadBase64={msg.audioPayloadBase64}
                      durationSeconds={msg.audioDurationSeconds}
                    />
                  )}

                  {/* Text Message */}
                  {msg.text && (
                    <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                  )}

                  {/* Attached Files in Chat */}
                  {msg.files && msg.files.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {msg.files.map((file) => (
                        <div
                          key={file.index}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-card/90 border border-border shadow-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="p-1.5 rounded-md bg-secondary text-yellow-500 dark:text-yellow-400 shrink-0">
                              <FileIcon className="w-4 h-4" />
                            </span>
                            <div className="truncate">
                              <p className="font-semibold text-[11px] truncate text-foreground">{file.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{formatBytes(file.size)}</p>
                            </div>
                          </div>
                          {onDownloadFile && (
                            <button
                              type="button"
                              onClick={() => onDownloadFile(file.name, file.mime)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-yellow-400 text-black hover:bg-yellow-300 transition-all shrink-0 shadow-xs active:scale-95 cursor-pointer ml-auto"
                              title={`Download ${file.name}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Attachment Previews Bar (Above Input) */}
      {(attachedFiles.length > 0 || stagedVoice) && (
        <div className="px-3 py-2 border-t border-border bg-secondary/40 flex flex-wrap items-center gap-2 max-h-28 overflow-y-auto">
          {/* Staged Voice Preview Chip */}
          {stagedVoice && (
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-yellow-400/15 border border-yellow-400/40 text-foreground text-[11px] shrink-0 font-medium">
              <Mic className="w-3.5 h-3.5 text-yellow-500 animate-pulse" />
              <span>Voice memo ({stagedVoice.durationSeconds.toFixed(1)}s)</span>
              <button
                type="button"
                onClick={() => setStagedVoice(null)}
                className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                title="Discard voice memo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Staged Attached Files Chips */}
          {attachedFiles.map((file, i) => (
            <div
              key={i}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border text-[11px] shrink-0 text-foreground"
            >
              <FileIcon className="w-3.5 h-3.5 text-yellow-500" />
              <span className="truncate max-w-[140px] font-medium">{file.name}</span>
              <span className="text-[10px] text-muted-foreground font-mono">({formatBytes(file.size)})</span>
              <button
                type="button"
                onClick={() => removeAttachedFile(i)}
                className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                title="Remove file"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer Controls & Input */}
      <form onSubmit={handleSend} className="p-2.5 border-t border-border bg-secondary/20 flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Attach File Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Attach files to message"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        {/* Text Input */}
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            attachedFiles.length > 0
              ? 'Add an optional note to attached files...'
              : stagedVoice
              ? 'Add an optional note to voice memo...'
              : activeFolderRef
              ? `Message about ${activeFolderRef}...`
              : 'Type a message...'
          }
          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-yellow-400"
        />

        {/* Voice Note Recorder Button */}
        <VoiceRecorderButton onRecordingComplete={handleVoiceRecorded} />

        {/* Send Button */}
        <button
          type="submit"
          disabled={!canSend}
          className="p-2 rounded-lg bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-40 disabled:hover:bg-yellow-400 font-bold transition-all shrink-0 active:scale-95 shadow-sm cursor-pointer"
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
