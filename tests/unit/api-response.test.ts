import { describe, expect, it } from "vitest";
import { z } from "zod";

import { apiError, apiInternalError, apiSuccess, parseOrError } from "@/lib/api-response";

describe("apiSuccess", () => {
  it("wraps data in the { data, error: null } envelope", async () => {
    const response = apiSuccess({ hello: "world" });
    const body = await response.json();
    expect(body).toEqual({ data: { hello: "world" }, error: null });
  });
});

describe("apiError", () => {
  it("maps each category to its documented HTTP status", () => {
    expect(apiError("validation", "x", "y").status).toBe(400);
    expect(apiError("authentication", "x", "y").status).toBe(401);
    expect(apiError("authorization", "x", "y").status).toBe(403);
    expect(apiError("not_found", "x", "y").status).toBe(404);
    expect(apiError("conflict", "x", "y").status).toBe(409);
    expect(apiError("business_rule", "x", "y").status).toBe(422);
    expect(apiError("payment", "x", "y").status).toBe(422);
    expect(apiError("shipping", "x", "y").status).toBe(422);
    expect(apiError("erp_integration", "x", "y").status).toBe(500);
    expect(apiError("internal", "x", "y").status).toBe(500);
  });

  it("carries the Arabic message and field errors through untouched", async () => {
    const response = apiError("validation", "invalid_phone", "رقم الهاتف غير صحيح", {
      phone: "مطلوب",
    });
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.error).toEqual({
      code: "invalid_phone",
      category: "validation",
      message_ar: "رقم الهاتف غير صحيح",
      fields: { phone: "مطلوب" },
    });
  });
});

describe("apiInternalError", () => {
  it("never leaks technical detail — only a reference id and a generic Arabic message", async () => {
    const response = apiInternalError("req-123");
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.category).toBe("internal");
    expect(body.error.fields).toEqual({ reference: "req-123" });
    expect(body.error.message_ar).not.toMatch(/error|Error|stack/);
  });
});

describe("parseOrError", () => {
  const schema = z.object({ phone: z.string().min(1) });

  it("returns typed data on success", () => {
    const result = parseOrError(schema, { phone: "0100000000" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe("0100000000");
    }
  });

  it("returns a validation ApiError with field-level messages on failure", async () => {
    const result = parseOrError(schema, { phone: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error.category).toBe("validation");
      expect(body.error.fields.phone).toBeDefined();
    }
  });
});
