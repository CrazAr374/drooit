import React, { useState } from 'react';
import { Folder, FolderOpen, FolderUp, FileText, Download, Plus, MessageSquare } from 'lucide-react';
import type { SharedFileMeta } from '@shared/protocol.js';
import { formatBytes } from '@shared/format.js';
import { Button } from '../common/Button.js';
import { getFilesFromDataTransfer } from '../../lib/transfer/fileDrop.js';

interface FolderExplorerProps {
  files: SharedFileMeta[];
  onAddFiles?: (files: File[]) => void;
  onDownloadFile?: (identifier: string | number) => void;
  onDownloadAll?: () => void;
  onSelectFolderForChat?: (folderPath: string) => void;
}

export const FolderExplorer: React.FC<FolderExplorerProps> = ({
  files,
  onAddFiles,
  onDownloadFile,
  onDownloadAll,
  onSelectFolderForChat,
}) => {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const folderInputRef = React.useRef<HTMLInputElement>(null);

  // Group files by top-level or relative folder
  const folders: Record<string, SharedFileMeta[]> = {};
  const rootFiles: SharedFileMeta[] = [];

  for (const file of files) {
    const parts = file.relativePath.split('/');
    if (parts.length > 1) {
      const folderName = parts.slice(0, -1).join('/');
      if (!folders[folderName]) folders[folderName] = [];
      folders[folderName].push(file);
    } else {
      rootFiles.push(file);
    }
  }

  const toggleFolder = (folderName: string) => {
    setOpenFolders((prev) => ({ ...prev, [folderName]: !prev[folderName] }));
  };

  const handleFilesAdded = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles?.(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!onAddFiles) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!onAddFiles) return;
    const dropped = await getFilesFromDataTransfer(e.dataTransfer);
    if (dropped.length > 0) {
      onAddFiles(dropped);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col h-full rounded-xl bg-card border transition-colors drooit-card overflow-hidden ${
        isDragOver ? 'border-yellow-400 bg-yellow-400/5' : 'border-border'
      }`}
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-border bg-secondary/40 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
          <h4 className="text-xs font-bold font-display uppercase tracking-wider text-foreground">
            Shared Files & Folders ({files.length})
          </h4>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {onDownloadAll && files.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadAll}
              className="text-[11px] h-7 px-2.5 gap-1 rounded-md"
            >
              <Download className="w-3 h-3 text-yellow-500" />
              <span>Download ZIP</span>
            </Button>
          )}

          {onAddFiles && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFilesAdded}
              />
              <input
                ref={folderInputRef}
                type="file"
                // @ts-expect-error webkitdirectory is standard in browsers but non-standard in TS DOM types
                webkitdirectory=""
                directory=""
                multiple
                className="hidden"
                onChange={handleFilesAdded}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] h-7 px-2.5 gap-1 rounded-md"
              >
                <Plus className="w-3 h-3 text-foreground" />
                <span>Add Files</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => folderInputRef.current?.click()}
                className="text-[11px] h-7 px-2.5 gap-1 rounded-md"
              >
                <FolderUp className="w-3 h-3 text-yellow-500 dark:text-yellow-400" />
                <span>Add Folder</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Explorer Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-muted-foreground">
            <p className="text-xs font-medium">No files in room.</p>
            <p className="text-[11px] mt-1 text-muted-foreground/80">
              Drag & drop or use Add Files / Add Folder above — no file size or count limits.
            </p>
          </div>
        ) : (
          <>
            {/* Folder Groups */}
            {Object.entries(folders).map(([folderName, folderFiles]) => {
              const isOpen = openFolders[folderName] ?? true;
              const folderBytes = folderFiles.reduce((acc, f) => acc + f.size, 0);

              return (
                <div key={folderName} className="rounded-lg border border-border bg-secondary/30 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-secondary/60 text-xs">
                    <button
                      onClick={() => toggleFolder(folderName)}
                      className="flex items-center gap-2 font-semibold text-foreground hover:text-yellow-500 transition-colors"
                    >
                      {isOpen ? (
                        <FolderOpen className="w-4 h-4 text-yellow-400" />
                      ) : (
                        <Folder className="w-4 h-4 text-yellow-400" />
                      )}
                      <span>{folderName}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        ({folderFiles.length} files • {formatBytes(folderBytes)})
                      </span>
                    </button>

                    {onSelectFolderForChat && (
                      <button
                        onClick={() => onSelectFolderForChat(folderName)}
                        title="Chat about this folder"
                        className="p-1 rounded text-muted-foreground hover:text-yellow-500 hover:bg-secondary transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {isOpen && (
                    <div className="p-2 space-y-1 bg-background/50 border-t border-border/50">
                      {folderFiles.map((file) => (
                        <div
                          key={`${file.index}-${file.relativePath}`}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-secondary/70 transition-colors text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate font-medium text-foreground">{file.name}</span>
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                              {formatBytes(file.size)}
                            </span>
                          </div>
                          {onDownloadFile && (
                            <button
                              onClick={() => onDownloadFile(file.name)}
                              className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                              title="Download file"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Root Files */}
            {rootFiles.map((file) => (
              <div
                key={`${file.index}-${file.name}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/60 transition-colors text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText className="w-4 h-4 text-yellow-500 shrink-0" />
                  <span className="truncate font-medium text-foreground">{file.name}</span>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {formatBytes(file.size)}
                  </span>
                </div>
                {onDownloadFile && (
                  <button
                    onClick={() => onDownloadFile(file.name)}
                    className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                    title="Download file"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
