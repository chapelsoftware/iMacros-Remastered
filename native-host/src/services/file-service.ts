/**
 * File Service for iMacros Native Host
 * Handles file system operations with charset encoding support
 */
import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';

/**
 * Supported character encodings matching original iMacros
 */
export type Charset =
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be'
  | 'cp1250' // Central European
  | 'cp1251' // Cyrillic
  | 'cp1252' // Western European (Windows default)
  | 'cp1253' // Greek
  | 'cp1254' // Turkish
  | 'cp1255' // Hebrew
  | 'cp1256' // Arabic
  | 'cp1257' // Baltic
  | 'cp1258' // Vietnamese
  | 'iso-8859-1'
  | 'ascii';

/**
 * BOM (Byte Order Mark) signatures for encoding detection
 */
const BOM_SIGNATURES = {
  'utf-8': Buffer.from([0xef, 0xbb, 0xbf]),
  'utf-16be': Buffer.from([0xfe, 0xff]),
  'utf-16le': Buffer.from([0xff, 0xfe]),
};

/**
 * Directory entry returned by readdir
 */
export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  mtime: Date;
}

/**
 * Options for reading files
 */
export interface ReadFileOptions {
  encoding?: Charset;
  detectEncoding?: boolean;
}

/**
 * Options for writing files
 */
export interface WriteFileOptions {
  encoding?: Charset;
  writeBom?: boolean;
  append?: boolean;
}

/**
 * Options for reading directories
 */
export interface ReaddirOptions {
  recursive?: boolean;
  includeFiles?: boolean;
  includeDirectories?: boolean;
  filter?: RegExp | string;
}

/**
 * Result of reading a file with encoding info
 */
export interface ReadFileResult {
  content: string;
  detectedEncoding: Charset | null;
  byteLength: number;
}

/**
 * Detect the character encoding of a buffer by examining BOM and content
 */
export function detectEncoding(buffer: Buffer): Charset | null {
  // Check for BOM signatures
  if (buffer.length >= 3) {
    if (
      buffer[0] === 0xef &&
      buffer[1] === 0xbb &&
      buffer[2] === 0xbf
    ) {
      return 'utf-8';
    }
  }

  if (buffer.length >= 2) {
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return 'utf-16be';
    }
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return 'utf-16le';
    }
  }

  // No BOM found - try to detect encoding from content
  // Check for UTF-16 patterns (alternating null bytes)
  if (buffer.length >= 4) {
    const hasNullOddPositions = buffer[1] === 0 && buffer[3] === 0;
    const hasNullEvenPositions = buffer[0] === 0 && buffer[2] === 0;

    if (hasNullOddPositions && !hasNullEvenPositions) {
      return 'utf-16le';
    }
    if (hasNullEvenPositions && !hasNullOddPositions) {
      return 'utf-16be';
    }
  }

  // Check if valid UTF-8
  if (isValidUtf8(buffer)) {
    return 'utf-8';
  }

  // Default to Windows Western European codepage
  return 'cp1252';
}

/**
 * Check if a buffer contains valid UTF-8 sequences
 */
function isValidUtf8(buffer: Buffer): boolean {
  let i = 0;
  while (i < buffer.length) {
    const byte = buffer[i];

    if (byte < 0x80) {
      // ASCII character
      i++;
    } else if ((byte & 0xe0) === 0xc0) {
      // 2-byte sequence
      if (i + 1 >= buffer.length || (buffer[i + 1] & 0xc0) !== 0x80) {
        return false;
      }
      i += 2;
    } else if ((byte & 0xf0) === 0xe0) {
      // 3-byte sequence
      if (
        i + 2 >= buffer.length ||
        (buffer[i + 1] & 0xc0) !== 0x80 ||
        (buffer[i + 2] & 0xc0) !== 0x80
      ) {
        return false;
      }
      i += 3;
    } else if ((byte & 0xf8) === 0xf0) {
      // 4-byte sequence
      if (
        i + 3 >= buffer.length ||
        (buffer[i + 1] & 0xc0) !== 0x80 ||
        (buffer[i + 2] & 0xc0) !== 0x80 ||
        (buffer[i + 3] & 0xc0) !== 0x80
      ) {
        return false;
      }
      i += 4;
    } else {
      return false;
    }
  }
  return true;
}

/**
 * Get the BOM bytes for an encoding
 */
function getBom(encoding: Charset): Buffer | null {
  switch (encoding) {
    case 'utf-8':
      return BOM_SIGNATURES['utf-8'];
    case 'utf-16le':
      return BOM_SIGNATURES['utf-16le'];
    case 'utf-16be':
      return BOM_SIGNATURES['utf-16be'];
    default:
      return null;
  }
}

/**
 * Strip BOM from buffer if present
 */
function stripBom(buffer: Buffer, encoding: Charset): Buffer {
  if (encoding === 'utf-8' && buffer.length >= 3) {
    if (
      buffer[0] === 0xef &&
      buffer[1] === 0xbb &&
      buffer[2] === 0xbf
    ) {
      return buffer.slice(3);
    }
  }

  if ((encoding === 'utf-16le' || encoding === 'utf-16be') && buffer.length >= 2) {
    if (
      (buffer[0] === 0xff && buffer[1] === 0xfe) ||
      (buffer[0] === 0xfe && buffer[1] === 0xff)
    ) {
      return buffer.slice(2);
    }
  }

  return buffer;
}

/**
 * Read a file with charset detection/conversion
 */
export async function readFile(
  filePath: string,
  options: ReadFileOptions = {}
): Promise<ReadFileResult> {
  const { encoding, detectEncoding: shouldDetect = true } = options;

  const buffer = await fs.promises.readFile(filePath);

  let detectedEncoding: Charset | null = null;
  let finalEncoding: Charset;

  if (encoding) {
    finalEncoding = encoding;
  } else if (shouldDetect) {
    detectedEncoding = detectEncoding(buffer);
    finalEncoding = detectedEncoding || 'utf-8';
  } else {
    finalEncoding = 'utf-8';
  }

  // Strip BOM before decoding
  const dataBuffer = stripBom(buffer, finalEncoding);

  // Decode the content
  const content = iconv.decode(dataBuffer, finalEncoding);

  return {
    content,
    detectedEncoding,
    byteLength: buffer.length,
  };
}

/**
 * Synchronous version of readFile
 */
export function readFileSync(
  filePath: string,
  options: ReadFileOptions = {}
): ReadFileResult {
  const { encoding, detectEncoding: shouldDetect = true } = options;

  const buffer = fs.readFileSync(filePath);

  let detectedEncoding: Charset | null = null;
  let finalEncoding: Charset;

  if (encoding) {
    finalEncoding = encoding;
  } else if (shouldDetect) {
    detectedEncoding = detectEncoding(buffer);
    finalEncoding = detectedEncoding || 'utf-8';
  } else {
    finalEncoding = 'utf-8';
  }

  const dataBuffer = stripBom(buffer, finalEncoding);
  const content = iconv.decode(dataBuffer, finalEncoding);

  return {
    content,
    detectedEncoding,
    byteLength: buffer.length,
  };
}

/**
 * Write a file with charset encoding
 */
export async function writeFile(
  filePath: string,
  content: string,
  options: WriteFileOptions = {}
): Promise<void> {
  const { encoding = 'utf-8', writeBom = false, append = false } = options;

  // Encode the content
  const encodedContent = iconv.encode(content, encoding);

  // Prepare buffer with optional BOM
  let buffer: Buffer;
  if (writeBom && !append) {
    const bom = getBom(encoding);
    if (bom) {
      buffer = Buffer.concat([bom, encodedContent]);
    } else {
      buffer = encodedContent;
    }
  } else {
    buffer = encodedContent;
  }

  // Write the file
  if (append) {
    await fs.promises.appendFile(filePath, buffer);
  } else {
    await fs.promises.writeFile(filePath, buffer);
  }
}

/**
 * Synchronous version of writeFile
 */
export function writeFileSync(
  filePath: string,
  content: string,
  options: WriteFileOptions = {}
): void {
  const { encoding = 'utf-8', writeBom = false, append = false } = options;

  const encodedContent = iconv.encode(content, encoding);

  let buffer: Buffer;
  if (writeBom && !append) {
    const bom = getBom(encoding);
    if (bom) {
      buffer = Buffer.concat([bom, encodedContent]);
    } else {
      buffer = encodedContent;
    }
  } else {
    buffer = encodedContent;
  }

  if (append) {
    fs.appendFileSync(filePath, buffer);
  } else {
    fs.writeFileSync(filePath, buffer);
  }
}

/**
 * Read directory contents with optional recursion
 */
export async function readdir(
  dirPath: string,
  options: ReaddirOptions = {}
): Promise<DirEntry[]> {
  const {
    recursive = false,
    includeFiles = true,
    includeDirectories = true,
    filter,
  } = options;

  const entries: DirEntry[] = [];

  async function processDirectory(currentPath: string): Promise<void> {
    const items = await fs.promises.readdir(currentPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(currentPath, item.name);

      // Apply filter if provided
      if (filter) {
        const filterRegex = filter instanceof RegExp ? filter : new RegExp(filter);
        if (!filterRegex.test(item.name)) {
          // Still recurse into directories even if they don't match
          if (recursive && item.isDirectory()) {
            await processDirectory(fullPath);
          }
          continue;
        }
      }

      const stats = await fs.promises.stat(fullPath);
      const entry: DirEntry = {
        name: item.name,
        path: fullPath,
        isDirectory: item.isDirectory(),
        isFile: item.isFile(),
        size: stats.size,
        mtime: stats.mtime,
      };

      if (item.isDirectory()) {
        if (includeDirectories) {
          entries.push(entry);
        }
        if (recursive) {
          await processDirectory(fullPath);
        }
      } else if (item.isFile() && includeFiles) {
        entries.push(entry);
      }
    }
  }

  await processDirectory(dirPath);
  return entries;
}

/**
 * Synchronous version of readdir
 */
export function readdirSync(
  dirPath: string,
  options: ReaddirOptions = {}
): DirEntry[] {
  const {
    recursive = false,
    includeFiles = true,
    includeDirectories = true,
    filter,
  } = options;

  const entries: DirEntry[] = [];

  function processDirectory(currentPath: string): void {
    const items = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(currentPath, item.name);

      if (filter) {
        const filterRegex = filter instanceof RegExp ? filter : new RegExp(filter);
        if (!filterRegex.test(item.name)) {
          if (recursive && item.isDirectory()) {
            processDirectory(fullPath);
          }
          continue;
        }
      }

      const stats = fs.statSync(fullPath);
      const entry: DirEntry = {
        name: item.name,
        path: fullPath,
        isDirectory: item.isDirectory(),
        isFile: item.isFile(),
        size: stats.size,
        mtime: stats.mtime,
      };

      if (item.isDirectory()) {
        if (includeDirectories) {
          entries.push(entry);
        }
        if (recursive) {
          processDirectory(fullPath);
        }
      } else if (item.isFile() && includeFiles) {
        entries.push(entry);
      }
    }
  }

  processDirectory(dirPath);
  return entries;
}

/**
 * Delete a file or directory
 */
export async function unlink(targetPath: string): Promise<void> {
  const stats = await fs.promises.stat(targetPath);

  if (stats.isDirectory()) {
    // Non-recursive: directory must be empty (matches original iMacros file.remove(false))
    await fs.promises.rmdir(targetPath);
  } else {
    await fs.promises.unlink(targetPath);
  }
}

/**
 * Synchronous version of unlink
 */
export function unlinkSync(targetPath: string): void {
  const stats = fs.statSync(targetPath);

  if (stats.isDirectory()) {
    // Non-recursive: directory must be empty (matches original iMacros file.remove(false))
    fs.rmdirSync(targetPath);
  } else {
    fs.unlinkSync(targetPath);
  }
}

/**
 * Create a directory (with recursive option)
 */
export async function mkdir(
  dirPath: string,
  recursive: boolean = true
): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive });
}

/**
 * Synchronous version of mkdir
 */
export function mkdirSync(
  dirPath: string,
  recursive: boolean = true
): void {
  fs.mkdirSync(dirPath, { recursive });
}

/**
 * Check if a path exists
 */
export async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronous version of exists
 */
export function existsSync(targetPath: string): boolean {
  return fs.existsSync(targetPath);
}

/**
 * Get file/directory stats
 */
export async function stat(targetPath: string): Promise<fs.Stats> {
  return fs.promises.stat(targetPath);
}

/**
 * Synchronous version of stat
 */
export function statSync(targetPath: string): fs.Stats {
  return fs.statSync(targetPath);
}

/**
 * FileService class providing all file operations
 */
export class FileService {
  // Static methods for convenience
  static readFile = readFile;
  static readFileSync = readFileSync;
  static writeFile = writeFile;
  static writeFileSync = writeFileSync;
  static readdir = readdir;
  static readdirSync = readdirSync;
  static unlink = unlink;
  static unlinkSync = unlinkSync;
  static mkdir = mkdir;
  static mkdirSync = mkdirSync;
  static exists = exists;
  static existsSync = existsSync;
  static stat = stat;
  static statSync = statSync;
  static detectEncoding = detectEncoding;
}

export default FileService;
