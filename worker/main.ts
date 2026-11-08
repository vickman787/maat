import { openDatabase } from "../lib/db";
import { processQueuedJob, recoverInterruptedJobs } from "../lib/jobs";

const db = openDatabase();
const recovered = recoverInterruptedJobs(db, true);
if (recovered > 0) {
  console.log(`[maat-worker] recovered ${recovered} interrupted job(s)`);
}
console.log("[maat-worker] ready; polling the durable job table");

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

async function loop() {
  while (!stopping) {
    let processed = false;
    try {
      processed = await processQueuedJob(db);
    } catch (error) {
      console.error(
        "[maat-worker] unexpected loop error:",
        error instanceof Error ? error.message.slice(0, 200) : "unknown",
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!processed) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  db.close();
  console.log("[maat-worker] stopped");
}

void loop();
