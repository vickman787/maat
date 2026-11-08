import { NextResponse } from "next/server";
import { assertSameOrigin, clientIp, handleApiError, hashIp, jsonError } from "@/lib/api";
import { createDemoWorkspace } from "@/lib/demo";
import { processQueuedJob } from "@/lib/jobs";
import { aiConfig } from "@/lib/config";
import { consumeDemoRateLimit } from "@/lib/rate-limit";
import { attachSession } from "@/lib/session";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ipHash = hashIp(clientIp(request));
    const limit = consumeDemoRateLimit(ipHash);
    if (!limit.allowed) {
      return jsonError("Demo creation is rate-limited. Try again in a little while.", 429);
    }
    const demo = createDemoWorkspace(getDb(), ipHash);
    if (!aiConfig().configured) {
      await processQueuedJob(getDb(), demo.jobId);
    }
    const response = NextResponse.json({ ok: true, batchId: demo.batchId });
    return attachSession(response, {
      kind: "demo",
      workspaceId: demo.workspaceId,
      demoSessionId: demo.demoSessionId,
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

