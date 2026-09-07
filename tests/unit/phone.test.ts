import { describe, expect, it } from "vitest";

import { isValidE164, maskPhone, normalizePhoneToE164 } from "@/domain/phone";

describe("normalizePhoneToE164", () => {
  it("normalizes a local number with a leading zero", () => {
    expect(normalizePhoneToE164("01001234567")).toBe("+201001234567");
  });

  it("normalizes a local number without the leading zero", () => {
    expect(normalizePhoneToE164("1001234567")).toBe("+201001234567");
  });

  it("normalizes a number with the country code but no plus", () => {
    expect(normalizePhoneToE164("201001234567")).toBe("+201001234567");
  });

  it("passes through an already-normalized E.164 number", () => {
    expect(normalizePhoneToE164("+201001234567")).toBe("+201001234567");
  });

  it("strips spaces and dashes before normalizing", () => {
    expect(normalizePhoneToE164("010 012-34567")).toBe("+201001234567");
  });

  it("accepts all four Egyptian mobile operator prefixes", () => {
    expect(normalizePhoneToE164("01012345678")).toBe("+201012345678");
    expect(normalizePhoneToE164("01112345678")).toBe("+201112345678");
    expect(normalizePhoneToE164("01212345678")).toBe("+201212345678");
    expect(normalizePhoneToE164("01512345678")).toBe("+201512345678");
  });

  it("rejects a number with an invalid operator prefix", () => {
    expect(() => normalizePhoneToE164("01312345678")).toThrow(TypeError);
  });

  it("rejects a too-short number", () => {
    expect(() => normalizePhoneToE164("0100123")).toThrow(TypeError);
  });

  it("rejects a non-Egyptian-shaped number", () => {
    expect(() => normalizePhoneToE164("+14155552671")).toThrow(TypeError);
  });

  it("rejects garbage input", () => {
    expect(() => normalizePhoneToE164("not-a-phone")).toThrow(TypeError);
  });
});

describe("isValidE164", () => {
  it("accepts a normalized number", () => {
    expect(isValidE164("+201001234567")).toBe(true);
  });

  it("rejects a local-format number", () => {
    expect(isValidE164("01001234567")).toBe(false);
  });
});

describe("maskPhone", () => {
  it("keeps only the last 4 digits visible", () => {
    const input = "+201001234567";
    const masked = maskPhone(input);
    expect(masked).toHaveLength(input.length);
    expect(masked.endsWith("4567")).toBe(true);
    expect(masked.slice(0, -4)).toBe("*".repeat(input.length - 4));
  });

  it("never appears to reveal more than it does for a short input", () => {
    expect(maskPhone("123")).toBe("****");
  });
});
