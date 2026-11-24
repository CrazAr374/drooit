import React, { useRef, useState } from 'react';
import { UploadCloud, FolderUp, FileUp, Sparkles } from 'lucide-react';
import { Button } from '../common/Button.js';

interface DropzoneProps {
  onFilesSelected: (files: File[]) => void;
  className?: string;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFilesSelected, className = '' }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDropFiles = (e: React.DragEvent) => {
    handleDrop(e);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      onFilesSelected(filesArray);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      onFilesSelected(filesArray);
      e.target.value = '';
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropFiles}
      className={`relative flex flex-col items-center justify-center p-8 sm:p-12 border border-dashed rounded-xl transition-all duration-150 cursor-pointer ${
        isDragOver
          ? 'border-foreground bg-secondary/80 scale-[1.005]'
          : 'border-border bg-card hover:border-muted-foreground/50 hover:bg-secondary/20 drooit-card'
      } ${className}`}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is standard in browsers but non-standard in TS DOM types
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-lg bg-secondary text-foreground border border-border mb-4 transition-transform group-hover:scale-105 shadow-sm">
        <UploadCloud className="h-6 w-6 sm:h-7 sm:w-7 text-foreground" />
      </div>

      <h3 className="text-lg sm:text-xl font-bold font-display tracking-tight text-foreground text-center mb-1">
        Drag & drop files or folders
      </h3>
      <p className="text-xs text-muted-foreground text-center max-w-sm mb-6 font-normal">
        Drop any file or folder — photos, video, audio, code, or archives
      </p>

      <div
        className="flex flex-wrap items-center justify-center gap-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg font-semibold text-xs h-9 px-4 sm:px-5"
        >
          <FileUp className="h-3.5 w-3.5 mr-1.5" />
          Choose Files
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => folderInputRef.current?.click()}
          className="rounded-lg border-border font-semibold text-xs h-9 px-4 sm:px-5"
        >
          <FolderUp className="h-3.5 w-3.5 mr-1.5 text-foreground" />
          Choose Folder
        </Button>
      </div>

      <div className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
        <Sparkles className="h-3.5 w-3.5 text-foreground/60" />
        <span>Supports any file size, 4K media, archives, and full directories</span>
      </div>
    </div>
  );
};
