/**
 * Egyptian mobile phone normalization to E.164, per
 * docs/architecture/technical-architecture.md §7 ("normalized to E.164 for
 * storage, while accepting local formats as input"). Egyptian mobile
 * numbers use one of four operator prefixes (010/011/012/015) followed by
 * 8 digits — 11 digits total in local form, 10 after the country code.
 */

const EGYPT_MOBILE_LOCAL = /^0?1[0125]\d{8}$/;
const EGYPT_MOBILE_E164 = /^\+201[0125]\d{8}$/;

/**
 * Accepts "01001234567", "1001234567", "201001234567", "+201001234567"
 * (with optional spaces/dashes) and returns "+201001234567". Throws
 * TypeError on anything that isn't a plausible Egyptian mobile number —
 * never silently truncates or guesses.
 */
export function normalizePhoneToE164(input: string): string {
  const cleaned = input.replace(/[\s\-()]/g, "");

  if (EGYPT_MOBILE_E164.test(cleaned)) {
    return cleaned;
  }

  const withoutCountryCode = cleaned.startsWith("+20")
    ? cleaned.slice(3)
    : cleaned.startsWith("20") && cleaned.length === 12
      ? cleaned.slice(2)
      : cleaned;

  if (EGYPT_MOBILE_LOCAL.test(withoutCountryCode)) {
    const withoutLeadingZero = withoutCountryCode.startsWith("0")
      ? withoutCountryCode.slice(1)
      : withoutCountryCode;
    return `+20${withoutLeadingZero}`;
  }

  throw new TypeError(`"${input}" is not a valid Egyptian mobile number`);
}

export function isValidE164(value: string): boolean {
  return EGYPT_MOBILE_E164.test(value);
}

/** For display/logging — never the full number (technical-architecture.md §21/§27). */
export function maskPhone(e164: string): string {
  return e164.length >= 4 ? `${"*".repeat(e164.length - 4)}${e164.slice(-4)}` : "****";
}
