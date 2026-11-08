import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { uploadDir } from "./config";

export function storagePath(storageKey: string): string {
  const root = path.resolve(uploadDir());
  const resolved = path.resolve(root, storageKey);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Unsafe storage path.");
  }
  return resolved;
}

export function savePrivateFile(storageKey: string, bytes: Buffer): string {
  const target = storagePath(storageKey);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { mode: 0o600 });
  try {
    fs.chmodSync(target, 0o600);
  } catch {
    // chmod is best-effort on Windows; deployment target is Linux.
  }
  return target;
}

export function readPrivateFile(storageKey: string): Buffer {
  return fs.readFileSync(storagePath(storageKey));
}

export function deletePrivateFile(storageKey: string): void {
  try {
    fs.unlinkSync(storagePath(storageKey));
  } catch {
    // Missing file is already effectively deleted.
  }
}

export function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function safeDisplayFilename(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/"));
  return base.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 200) || "upload.csv";
}

export function newStorageKey(workspaceId: string, batchId: string): string {
  return path.posix.join(workspaceId, batchId, `${crypto.randomUUID()}.csv`);
}
