import { NextResponse } from "next/server";
import { assertSameOrigin, clientIp, handleApiError, hashIp, jsonError } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth";
import { resetDemoWorkspace } from "@/lib/demo";
import { processQueuedJob } from "@/lib/jobs";
import { aiConfig } from "@/lib/config";
import { attachSession } from "@/lib/session";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ctx = await requireAuthContext();
    if (ctx.session.kind !== "demo" || !ctx.workspace?.isDemo) {
      return jsonError("Only a demo workspace can be reset here.", 403);
    }
    const demo = resetDemoWorkspace(getDb(), ctx.workspace.id, hashIp(clientIp(request)));
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

