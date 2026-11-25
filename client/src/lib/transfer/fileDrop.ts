/**
 * Recursively extracts File objects from a DataTransfer, preserving directory
 * structure via `webkitRelativePath` when folders are dropped.
 */

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (success: (file: File) => void, error?: (err: unknown) => void) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: FileSystemEntryLike[]) => void,
      error?: (err: unknown) => void,
    ) => void;
  };
}

function readEntryFile(entry: FileSystemEntryLike): Promise<File | null> {
  return new Promise((resolve) => {
    if (!entry.file) {
      resolve(null);
      return;
    }
    entry.file(
      (file) => {
        const cleanPath = entry.fullPath.replace(/^\/+/, '');
        if (cleanPath && cleanPath.includes('/') && !file.webkitRelativePath) {
          try {
            Object.defineProperty(file, 'webkitRelativePath', {
              value: cleanPath,
              configurable: true,
            });
          } catch {
            // Ignore if browser prevents defining webkitRelativePath
          }
        }
        resolve(file);
      },
      () => resolve(null),
    );
  });
}

async function readDirectoryEntries(entry: FileSystemEntryLike): Promise<File[]> {
  if (!entry.createReader) return [];
  const reader = entry.createReader();
  const collected: File[] = [];

  const readBatch = (): Promise<FileSystemEntryLike[]> =>
    new Promise((resolve) => {
      reader.readEntries(
        (entries) => resolve(entries),
        () => resolve([]),
      );
    });

  let batch = await readBatch();
  while (batch.length > 0) {
    for (const child of batch) {
      if (child.isFile) {
        const file = await readEntryFile(child);
        if (file) collected.push(file);
      } else if (child.isDirectory) {
        const nested = await readDirectoryEntries(child);
        collected.push(...nested);
      }
    }
    batch = await readBatch();
  }

  return collected;
}

export async function getFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = dataTransfer.items;
  if (items && items.length > 0) {
    const entries: FileSystemEntryLike[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as DataTransferItem & {
        webkitGetAsEntry?: () => FileSystemEntryLike | null;
      };
      if (typeof item.webkitGetAsEntry === 'function') {
        const entry = item.webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
    }

    if (entries.length > 0) {
      const files: File[] = [];
      for (const entry of entries) {
        if (entry.isFile) {
          const file = await readEntryFile(entry);
          if (file) files.push(file);
        } else if (entry.isDirectory) {
          const nested = await readDirectoryEntries(entry);
          files.push(...nested);
        }
      }
      if (files.length > 0) return files;
    }
  }

  return dataTransfer.files ? Array.from(dataTransfer.files) : [];
}
