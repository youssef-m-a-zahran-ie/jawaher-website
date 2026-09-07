/**
 * Clamps a desired quantity into [min, max], rounding to the nearest
 * integer first — the one piece of "how many can I add" logic shared by
 * QuantityControl and, later, the real cart module
 * (docs/architecture/technical-architecture.md §8: quantity is always
 * clamped server-side too — this is the client-side mirror of that rule,
 * not a replacement for it).
 */
export function clampQuantity(value: number, min: number, max: number): number {
  if (max < min) {
    throw new RangeError(`clampQuantity: max (${max}) is less than min (${min})`);
  }
  const rounded = Math.round(value);
  return Math.min(Math.max(rounded, min), max);
}
