import { databaseFile, loadLocalEnv } from "../lib/config";
import { openDatabase } from "../lib/db";

loadLocalEnv();
const db = openDatabase();
const rows = db.prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version").all();
console.log(`Database: ${databaseFile()}`);
console.table(rows);
db.close();
