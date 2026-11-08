import { openDatabase } from "../lib/db";
import { deletePrivateFile } from "../lib/storage";

const db = openDatabase();
try {
  const workspaces = db.prepare(`SELECT w.id FROM workspaces w
    LEFT JOIN users u ON u.id = w.owner_user_id
    WHERE w.is_demo = 1 OR u.privy_did LIKE 'did:privy:e2e-%'`).all() as Array<{ id: string }>;
  const files = workspaces.flatMap((workspace) => db.prepare(
    "SELECT storage_key FROM source_files WHERE workspace_id = ?",
  ).all(workspace.id) as Array<{ storage_key: string }>);
  db.transaction(() => {
    for (const workspace of workspaces) db.prepare("DELETE FROM workspaces WHERE id = ?").run(workspace.id);
    db.prepare("DELETE FROM users WHERE privy_did LIKE 'did:privy:e2e-%'").run();
    db.prepare("DELETE FROM demo_sessions").run();
    db.prepare("DELETE FROM rate_limits WHERE key LIKE 'demo:%'").run();
    db.prepare("DELETE FROM ai_cache").run();
  })();
  for (const file of files) deletePrivateFile(file.storage_key);
  console.log(JSON.stringify({ removedDemoOrTestWorkspaces: workspaces.length, removedSourceFiles: files.length }));
} finally {
  db.close();
}
