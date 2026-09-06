import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * The one response envelope every Website API route uses, per
 * docs/architecture/technical-architecture.md §11/§22. `error` is always
 * null on success. Never invent a per-endpoint response shape.
 */
export type ApiSuccess<T> = { data: T; error: null };
export type ApiError = { data: null; error: ApiErrorBody };
export type ApiErrorBody = {
  code: string;
  category: ApiErrorCategory;
  message_ar: string;
  fields?: Record<string, string>;
};

export type ApiErrorCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "not_found"
  | "conflict"
  | "business_rule"
  | "payment"
  | "shipping"
  | "erp_integration"
  | "internal";

/** HTTP status per error category — technical-architecture.md §22's table. */
const STATUS_BY_CATEGORY: Record<ApiErrorCategory, number> = {
  validation: 400,
  authentication: 401,
  authorization: 403,
  not_found: 404,
  conflict: 409,
  business_rule: 422,
  payment: 422,
  shipping: 422,
  erp_integration: 500,
  internal: 500,
};

export function apiSuccess<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data, error: null }, init);
}

export function apiError(
  category: ApiErrorCategory,
  code: string,
  messageAr: string,
  fields?: Record<string, string>,
): NextResponse<ApiError> {
  const body: ApiErrorBody = { code, category, message_ar: messageAr, fields };
  return NextResponse.json({ data: null, error: body }, { status: STATUS_BY_CATEGORY[category] });
}

/**
 * Generic, non-technical fallback for anything unexpected — never leaks a
 * stack trace or raw exception message to the customer (technical-architecture.md §22).
 * The `reference` should also be attached to the corresponding log line so
 * support can correlate a customer's report back to the real error.
 */
export function apiInternalError(reference: string): NextResponse<ApiError> {
  return apiError(
    "internal",
    "internal_error",
    "حدث خطأ غير متوقع من جانبنا. برجاء المحاولة مرة أخرى أو التواصل معنا.",
    { reference },
  );
}

/**
 * Parses a value against a zod schema and returns a `validation`-category
 * ApiError (field-level Arabic-ready messages) on failure, or the typed data
 * on success. Route handlers should never call `schema.parse` directly.
 */
export function parseOrError<T extends z.ZodType>(
  schema: T,
  value: unknown,
): { success: true; data: z.infer<T> } | { success: false; response: NextResponse<ApiError> } {
  const result = schema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".") || "root";
    if (!fields[path]) {
      fields[path] = issue.message;
    }
  }

  return {
    success: false,
    response: apiError("validation", "invalid_request", "تحقق من البيانات المدخلة", fields),
  };
}
