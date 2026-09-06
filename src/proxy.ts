import { NextResponse, type NextRequest } from "next/server";

import { getOrCreateRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";

/**
 * Foundation-only proxy (Next.js 16's renamed `middleware`): propagates a
 * request id to every request/response so a customer action can be traced
 * end to end (docs/architecture/technical-architecture.md §21). Security
 * headers/CSP live in next.config.ts instead — see the comment there for
 * why (nonce-based CSP here would force whole-site dynamic rendering).
 */
export function proxy(request: NextRequest) {
  const requestId = getOrCreateRequestId(request);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
