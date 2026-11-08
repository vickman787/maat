import { NextResponse } from "next/server";
import { assertSameOrigin, handleApiError } from "@/lib/api";
import { clearSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return clearSession(NextResponse.json({ ok: true }));
  } catch (error) {
    return handleApiError(error);
  }
}
