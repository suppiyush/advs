// File Storage component (§45), IFileStore: local-disk implementation. Files live outside any
// static folder and are only served through the access-checked download route (NFR-006).
// Swapping to S3 or similar later means re-implementing these three functions.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const uploadRoot = path.resolve(serverRoot, env.uploadDir);

const EXTENSIONS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Resolves a stored relative path, refusing anything that escapes the upload folder. */
function resolveStoragePath(storagePath) {
  const full = path.resolve(uploadRoot, storagePath);
  if (!full.startsWith(uploadRoot + path.sep)) throw new Error('Invalid storage path.');
  return full;
}

/** Saves the bytes and returns the storage path (relative to the upload folder). */
export async function saveFile(buffer, { applicationId, mimeType }) {
  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${EXTENSIONS[mimeType] ?? 'bin'}`;
  const storagePath = path.posix.join(String(applicationId), name);
  const full = resolveStoragePath(storagePath);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, buffer, { flag: 'wx' });
  return storagePath;
}

export function openFile(storagePath) {
  return fs.createReadStream(resolveStoragePath(storagePath));
}

export async function removeFile(storagePath) {
  await fsp.rm(resolveStoragePath(storagePath), { force: true });
}

/**
 * Detects the real file type from its first bytes. The browser-supplied MIME type is only a
 * hint, so FR-015 format validation relies on this instead.
 */
export function sniffMimeType(buffer) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  return null;
}
