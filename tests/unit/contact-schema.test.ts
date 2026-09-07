import { describe, expect, it } from "vitest";

import { contactSchema } from "@/app/api/v1/contact/schema";

describe("contactSchema", () => {
  it("accepts a valid submission", () => {
    const result = contactSchema.safeParse({
      name: "سارة",
      contact: "01000000000",
      message: "أريد الاستفسار عن منتجاتكم، شكرًا.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = contactSchema.safeParse({ name: "", contact: "01000000000", message: "رسالة كاملة هنا." });
    expect(result.success).toBe(false);
  });

  it("rejects a too-short message", () => {
    const result = contactSchema.safeParse({ name: "سارة", contact: "01000000000", message: "قصير" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing contact field", () => {
    const result = contactSchema.safeParse({ name: "سارة", message: "رسالة كاملة وواضحة هنا." });
    expect(result.success).toBe(false);
  });

  it("trims whitespace-only fields to empty and rejects them", () => {
    const result = contactSchema.safeParse({ name: "   ", contact: "01000000000", message: "رسالة كاملة هنا." });
    expect(result.success).toBe(false);
  });
});
