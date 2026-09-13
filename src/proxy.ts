import { NextResponse, type NextRequest } from "next/server";

import { apiError } from "@/lib/api-response";
import { getOrCreateRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";

/**
 * Foundation-only proxy (Next.js 16's renamed `middleware`): propagates a
 * request id to every request/response so a customer action can be traced
 * end to end (docs/architecture/technical-architecture.md §21). Security
 * headers/CSP live in next.config.ts instead — see the comment there for
 * why (nonce-based CSP here would force whole-site dynamic rendering).
 *
 * Phase 12 — also a defense-in-depth CSRF mitigation, found and closed
 * during the production security audit. `session.ts`'s cookie is
 * `sameSite: "lax"`, which already blocks a cross-site `fetch()`/XHR from
 * ever attaching it (lax cookies are withheld from any request that isn't
 * a top-level navigation), and PATCH/DELETE can't be issued by a plain
 * HTML `<form>` at all — but a cross-site `<form enctype="text/plain">`
 * POST *is* a top-level navigation lax permits, and its body can be an
 * attacker-crafted string that happens to parse as valid JSON even though
 * the browser sends it with `Content-Type: text/plain`. No route in this
 * app ever checked the incoming Content-Type before calling
 * `request.json()` (confirmed by a full grep across `src/app/api/v1`), so
 * that forged body would be accepted exactly like a real same-origin
 * request — every real client call in this codebase sets
 * `Content-Type: application/json` explicitly (also confirmed by grep),
 * so this rejects nothing legitimate. GET/DELETE are excluded
 * deliberately: no route here parses a body for either, and browser
 * `<form>`s can't issue DELETE regardless. A request with no body at all
 * (e.g. `POST /api/v1/checkout`, which takes none) is left alone — there
 * is no forgeable JSON body to gate.
 */
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH"]);

function rejectForgeableContentType(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/") || !STATE_CHANGING_METHODS.has(request.method)) {
    return null;
  }

  const contentLength = request.headers.get("content-length");
  const hasBody = contentLength !== null && contentLength !== "0";
  if (!hasBody) return null;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) return null;

  return apiError("validation", "unsupported_content_type", "نوع الطلب غير مدعوم.");
}

export function proxy(request: NextRequest) {
  const rejected = rejectForgeableContentType(request);
  if (rejected) return rejected;

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
