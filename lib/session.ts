import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { Session } from "./types";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  sessionExpirySeconds,
  signSession,
  verifySessionToken,
} from "./session-token";

export async function readSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export function attachSession(response: NextResponse, session: Session): NextResponse {
  response.cookies.set(SESSION_COOKIE, signSession(session, sessionExpirySeconds(session)), {
    ...sessionCookieOptions(sessionExpirySeconds(session)),
  });
  return response;
}

export function clearSession(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return response;
}
