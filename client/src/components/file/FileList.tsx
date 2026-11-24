import React, { useEffect, useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  Folder,
  X,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import { formatBytes, pluralize } from '@shared/format.js';
import { Button } from '../common/Button.js';

interface FileListProps {
  files: File[];
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
  onContinue: () => void;
}

function getFileIcon(file: File) {
  const type = file.type;
  const name = file.name.toLowerCase();

  if (type.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-foreground/80" />;
  if (type.startsWith('video/')) return <Film className="h-4 w-4 text-foreground/80" />;
  if (type.startsWith('audio/')) return <Music className="h-4 w-4 text-foreground/80" />;
  if (
    name.endsWith('.zip') ||
    name.endsWith('.tar') ||
    name.endsWith('.gz') ||
    name.endsWith('.7z') ||
    name.endsWith('.rar')
  ) {
    return <Archive className="h-4 w-4 text-foreground/80" />;
  }
  if (file.webkitRelativePath && file.webkitRelativePath.includes('/')) {
    return <Folder className="h-4 w-4 text-foreground/80" />;
  }
  return <FileText className="h-4 w-4 text-foreground/80" />;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  onRemoveFile,
  onClearFiles,
  onContinue,
}) => {
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});

  useEffect(() => {
    const urls: Record<number, string> = {};
    files.forEach((file, index) => {
      if (file.type.startsWith('image/') && file.size < 25 * 1024 * 1024) {
        try {
          urls[index] = URL.createObjectURL(file);
        } catch {
          // Ignore preview generation failures
        }
      }
    });
    setThumbnails(urls);

    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs text-foreground tracking-tight">
            {pluralize(files.length, 'file')} selected
          </span>
          <span className="text-xs font-semibold text-foreground bg-secondary px-2.5 py-0.5 rounded-md border border-border">
            {formatBytes(totalBytes)}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFiles}
          className="text-muted-foreground hover:text-destructive h-7 px-2 text-xs rounded-md"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear all
        </Button>
      </div>

      {/* File Items Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[340px] overflow-y-auto pr-1">
        {files.map((file, idx) => {
          const thumbnail = thumbnails[idx];

          return (
            <div
              key={`${file.name}-${idx}-${file.size}`}
              className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border hover:border-muted-foreground/40 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                {thumbnail ? (
                  <img
                    src={thumbnail}
                    alt={file.name}
                    className="h-9 w-9 rounded-md object-cover border border-border shrink-0 shadow-sm"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-md bg-card flex items-center justify-center shrink-0 border border-border">
                    {getFileIcon(file)}
                  </div>
                )}

                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-foreground truncate max-w-[180px] sm:max-w-[150px]">
                    {file.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-medium">{formatBytes(file.size)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRemoveFile(idx)}
                className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Remove file"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Bottom Action Bar */}
      <div className="pt-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground font-medium">
          Files stay local until receiver confirms transfer
        </div>
        <Button
          type="button"
          variant="accent"
          size="md"
          onClick={onContinue}
          className="w-full sm:w-auto rounded-lg font-bold text-xs h-10 px-6"
        >
          <span>Continue to Pairing</span>
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </div>
    </div>
  );
};
