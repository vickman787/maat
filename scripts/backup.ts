import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { databaseFile, uploadDir } from "../lib/config";

async function main() {
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.resolve(process.cwd(), "data", "backups", stamp);
fs.mkdirSync(backupRoot, { recursive: true });

const source = databaseFile();
const target = path.join(backupRoot, "maat.db");
const db = new Database(source, { readonly: true });
await db.backup(target);
db.close();
console.log(`SQLite backup written to ${target}`);

if (fs.existsSync(uploadDir())) {
  const uploadTarget = path.join(backupRoot, "uploads");
  fs.cpSync(uploadDir(), uploadTarget, { recursive: true });
  console.log(`Private uploads copied to ${uploadTarget}`);
}

console.log("Copy the backup directory off the VM before schema-changing deployments.");

}
void main().catch(() => { console.error("Backup failed. Check database and storage access."); process.exitCode = 1; });
