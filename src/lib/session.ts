import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { customersService } from "@/modules/customers";

/**
 * Server-side session, referenced by a secure httpOnly cookie holding an
 * opaque session id only (technical-architecture.md §7) — never a JWT
 * with embedded claims. A guest gets one the moment it's needed; it's
 * upgraded in place to authenticated on OTP verification, never replaced.
 */
export const SESSION_COOKIE_NAME = "jak_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type ResolvedSession = { token: string; sessionId: string; customerId: string | null; isNew: boolean };

export async function resolveSession(): Promise<ResolvedSession> {
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (existingToken) {
    const session = await customersService.getSession(existingToken);
    if (session) {
      return { token: session.token, sessionId: session.id, customerId: session.customerId, isNew: false };
    }
  }

  const session = await customersService.createGuestSession();
  return { token: session.token, sessionId: session.id, customerId: session.customerId, isNew: true };
}

/** Call on the outgoing response whenever `resolveSession()` returned `isNew: true`. */
export function withSessionCookie<T>(response: NextResponse<T>, token: string): NextResponse<T> {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
