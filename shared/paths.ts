/**
 * Filename and path sanitisation for files arriving from an untrusted peer.
 * Received files are never executed and never written outside a directory the
 * user explicitly grants, but we still neutralise traversal and platform tricks.
 */

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
// Characters that are illegal in Windows filenames and confusing everywhere else.
const UNSAFE_CHARS = /[<>:"|?*\\/]/g;

const MAX_NAME_LENGTH = 180;
const MAX_PATH_LENGTH = 512;
const MAX_PATH_SEGMENTS = 16;

export function sanitizeFilename(input: string, fallback = 'file'): string {
  // Never keep directory components: a filename is a single path segment.
  const basename =
    (input || '')
      .normalize('NFC')
      .replace(/\\/g, '/')
      .split('/')
      .filter((segment) => segment.length > 0)
      .pop() ?? '';
  let name = basename.replace(CONTROL_CHARS, '').replace(UNSAFE_CHARS, '_');
  // Collapse whitespace runs, then strip characters Windows forbids at the edges.
  name = name.replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '');
  if (name.length > MAX_NAME_LENGTH) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : '';
    name = name.slice(0, MAX_NAME_LENGTH - ext.length) + ext;
  }
  if (!name || name === '.' || name === '..') return fallback;
  if (WINDOWS_RESERVED.test(name)) return `_${name}`;
  return name;
}

/**
 * Normalises a peer-supplied relative path into safe, forward-slash segments.
 * Traversal (`..`), absolute paths, drive letters and empty segments are dropped.
 */
export function sanitizeRelativePath(input: string, fallbackName?: string): string {
  const fallback = sanitizeFilename(fallbackName ?? 'file');
  if (typeof input !== 'string' || input.length === 0) return fallback;

  const segments = input
    .normalize('NFC')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.replace(CONTROL_CHARS, '').trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    // Strip a Windows drive prefix such as "C:".
    .map((segment) => segment.replace(/^[a-zA-Z]:/, ''))
    .filter((segment) => segment.length > 0)
    .map((segment) => sanitizeFilename(segment, 'item'));

  if (segments.length === 0) return fallback;

  const limited = segments.slice(-MAX_PATH_SEGMENTS);
  // Keep the filename intact; trim the deepest parent directories if the path is too long.
  let path = limited.join('/');
  while (path.length > MAX_PATH_LENGTH && limited.length > 1) {
    limited.shift();
    path = limited.join('/');
  }
  return path.slice(-MAX_PATH_LENGTH) || fallback;
}

export function pathSegments(relativePath: string): string[] {
  return relativePath.split('/').filter(Boolean);
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}
