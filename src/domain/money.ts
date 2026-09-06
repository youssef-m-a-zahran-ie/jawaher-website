/**
 * Money value object — integer minor units, explicit currency.
 *
 * Per docs/architecture/technical-architecture.md §13: monetary values are
 * never floating point. EGP (Egyptian Pound) is the current, confirmed
 * website currency — see docs/design/design-decisions.md for the record of
 * that decision (the brand guideline PDF's Saudi Riyal references are
 * legacy/historical context, not the runtime currency).
 *
 * "Minor unit" for EGP is the piaster (100 piasters = 1 EGP), matching the
 * same integer-minor-unit approach the architecture already specifies for
 * every currency this project might ever need — nothing here is EGP-specific
 * beyond the default.
 */

export type CurrencyCode = "EGP";

const MINOR_UNITS_PER_MAJOR_UNIT: Record<CurrencyCode, number> = {
  EGP: 100,
};

export class Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;

  private constructor(amountMinor: number, currency: CurrencyCode) {
    if (!Number.isInteger(amountMinor)) {
      throw new TypeError(`Money amounts must be integer minor units, got ${amountMinor}`);
    }
    if (amountMinor < 0) {
      throw new RangeError("Money amounts cannot be negative");
    }
    this.amountMinor = amountMinor;
    this.currency = currency;
  }

  /** Construct from an integer count of minor units (e.g. piasters). Never accepts a float. */
  static fromMinor(amountMinor: number, currency: CurrencyCode = "EGP"): Money {
    return new Money(amountMinor, currency);
  }

  /**
   * Construct from a major-unit decimal string (e.g. "124.50"), as you'd
   * read from an invoice or a human-entered price — never from a JS
   * `number`, which would already have lost precision before reaching here.
   */
  static fromDecimalString(amount: string, currency: CurrencyCode = "EGP"): Money {
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      throw new TypeError(`Invalid decimal amount "${amount}" — expected e.g. "124" or "124.50"`);
    }
    const [wholePart, fractionPart = ""] = amount.split(".");
    const minorUnits = MINOR_UNITS_PER_MAJOR_UNIT[currency];
    const fractionDigits = String(minorUnits).length - 1;
    const paddedFraction = fractionPart.padEnd(fractionDigits, "0");
    const amountMinor = Number(wholePart) * minorUnits + Number(paddedFraction);
    return new Money(amountMinor, currency);
  }

  static zero(currency: CurrencyCode = "EGP"): Money {
    return new Money(0, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor - other.amountMinor, this.currency);
  }

  /** Multiply by an integer quantity (e.g. unit price × cart quantity) — never a float multiplier. */
  multiply(quantity: number): Money {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new TypeError("Money can only be multiplied by a non-negative integer quantity");
    }
    return new Money(this.amountMinor * quantity, this.currency);
  }

  isZero(): boolean {
    return this.amountMinor === 0;
  }

  equals(other: Money): boolean {
    return this.amountMinor === other.amountMinor && this.currency === other.currency;
  }

  /** Major-unit decimal string for display/logging, e.g. "124.50". Not locale-formatted — that's a UI concern. */
  toDecimalString(): string {
    const minorUnits = MINOR_UNITS_PER_MAJOR_UNIT[this.currency];
    const fractionDigits = String(minorUnits).length - 1;
    const whole = Math.floor(this.amountMinor / minorUnits);
    const fraction = this.amountMinor % minorUnits;
    return `${whole}.${String(fraction).padStart(fractionDigits, "0")}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new TypeError(
        `Cannot combine Money in different currencies: ${this.currency} vs ${other.currency}`,
      );
    }
  }
}
