/**
 * Phase 10 — the official Jawaher Al Khair icon (palm-in-diamond,
 * `_reference/brand/guidelines/Jawaher El khier.pdf` pp.2-4/8), implemented
 * as a real SVG for the first time. Before this phase the icon existed
 * nowhere in the digital product — the header/footer rendered the
 * wordmark as plain text with no mark at all, and the favicon was Next.js's
 * default. This is not a new brand identity: it is the existing, approved
 * mark (design-system.md §4's "Icon-based" variant), redrawn as clean
 * vector paths since no SVG source file was ever supplied.
 *
 * The crown's frond fan is generated from a small set of angles rather
 * than hand-traced bezier points, so it stays symmetric and legible at any
 * size (favicon through hero-scale) instead of an eyeballed approximation.
 * Uses `currentColor` throughout so it inherits whichever of the four
 * official logo/background combinations (design-system.md §4) the caller
 * is already using for text color — never a hardcoded fill.
 */

import type { CSSProperties } from "react";

type FrondSpec = { angle: number; length: number; width: number };

const CROWN_X = 50;
const CROWN_Y = 40;

// Seven fronds, symmetric about center, each drooping slightly at the tip
// like the source mark's fan — not a perfect semicircle (a real palm crown
// is denser near vertical, sparser at the outer edges).
const FROND_ANGLES = [-72, -48, -26, 0, 26, 48, 72];

function frondPath({ angle, length, width }: FrondSpec): string {
  const rad = (angle * Math.PI) / 180;
  // Tip: fans outward and slightly upward, then the curve droops it back down a touch.
  const tipX = CROWN_X + Math.sin(rad) * length;
  const tipY = CROWN_Y - Math.cos(rad) * length * 0.82;
  // Control point: further out and higher than the tip, so the stroke
  // bows outward first (the "fan" look) before drooping to the tip.
  const ctrlX = CROWN_X + Math.sin(rad) * length * 0.62;
  const ctrlY = CROWN_Y - Math.cos(rad) * length * 1.08;
  // Droop control point: pulls the last third of the curve down, giving
  // the frond tip a gentle downward bend instead of ending on a straight line.
  const droopX = tipX + Math.sin(rad) * width;
  const droopY = tipY + width * 0.6;

  return `M ${CROWN_X} ${CROWN_Y} Q ${ctrlX} ${ctrlY} ${tipX} ${tipY} Q ${droopX} ${droopY} ${tipX} ${tipY}`;
}

const FRONDS: FrondSpec[] = FROND_ANGLES.map((angle) => ({
  angle,
  length: 30 - Math.abs(angle) * 0.09, // center fronds slightly longer than outer ones
  width: 1.4,
}));

export type JawaherPalmIconProps = { className?: string; style?: CSSProperties };

/** The palm glyph alone — for use beside the wordmark (header, footer, hero), matching the source's horizontal lockup (p.2), which never frames the palm in a diamond. */
export function JawaherPalmIcon({ className, style }: JawaherPalmIconProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} style={style} aria-hidden="true">
      {FRONDS.map((frond) => (
        <path
          key={frond.angle}
          d={frondPath(frond)}
          stroke="currentColor"
          strokeWidth={frond.width}
          strokeLinecap="round"
        />
      ))}
      {/* Small diamond accent where the crown meets the trunk — p.2-4's gem detail. */}
      <rect x={CROWN_X - 3.4} y={CROWN_Y + 2.6} width="6.8" height="6.8" rx="1" transform={`rotate(45 ${CROWN_X} ${CROWN_Y + 6})`} fill="currentColor" />
      {/* Tapered trunk. */}
      <path
        d={`M ${CROWN_X - 2.6} ${CROWN_Y + 10} C ${CROWN_X - 3.4} ${CROWN_Y + 26}, ${CROWN_X - 2.4} ${CROWN_Y + 40}, ${CROWN_X} ${CROWN_Y + 50} C ${CROWN_X + 2.4} ${CROWN_Y + 40}, ${CROWN_X + 3.4} ${CROWN_Y + 26}, ${CROWN_X + 2.6} ${CROWN_Y + 10} Z`}
        fill="currentColor"
      />
    </svg>
  );
}

export type JawaherIconMarkProps = { className?: string };

/** Palm-in-diamond — the standalone "Icon-based" lockup (p.8), for favicon/app-icon/social-share contexts only, per design-system.md §4's placement table. */
export function JawaherIconMark({ className }: JawaherIconMarkProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <path
        d="M50 4 L94 50 L50 96 L6 50 Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {FRONDS.map((frond) => (
        <path
          key={frond.angle}
          d={frondPath({ ...frond, length: frond.length * 0.82 })}
          stroke="currentColor"
          strokeWidth={frond.width * 0.9}
          strokeLinecap="round"
        />
      ))}
      <rect x={CROWN_X - 2.8} y={CROWN_Y + 2.1} width="5.6" height="5.6" rx="0.8" transform={`rotate(45 ${CROWN_X} ${CROWN_Y + 5})`} fill="currentColor" />
      <path
        d={`M ${CROWN_X - 2.1} ${CROWN_Y + 8} C ${CROWN_X - 2.8} ${CROWN_Y + 21}, ${CROWN_X - 2} ${CROWN_Y + 32}, ${CROWN_X} ${CROWN_Y + 40} C ${CROWN_X + 2} ${CROWN_Y + 32}, ${CROWN_X + 2.8} ${CROWN_Y + 21}, ${CROWN_X + 2.1} ${CROWN_Y + 8} Z`}
        fill="currentColor"
      />
    </svg>
  );
}

export type JawaherWordmarkProps = {
  className?: string;
  /** Renders the "تُمُور وأكثر" tagline beneath the wordmark — matches the source's every real lockup (pp.2-7). */
  withTagline?: boolean;
  taglineClassName?: string;
};

/**
 * Icon + real Arabic text set in the site's own Almarai typeface — never an
 * attempt to hand-trace the source deck's custom calligraphic letterforms
 * in SVG (a redesign risk the design-system doc doesn't ask for; §4 only
 * requires the icon and the four approved backgrounds, not the exact
 * logotype curves). This is the "Horizontal (main)" lockup's structure
 * (icon beside/above the wordmark, tagline beneath), rebuilt with a real
 * typeface instead of traced paths.
 */
export function JawaherWordmark({ className, withTagline = false, taglineClassName }: JawaherWordmarkProps) {
  return (
    <span className={className}>
      <span className="flex items-center gap-2">
        <JawaherPalmIcon className="h-[1.4em] w-[1.4em] shrink-0 text-accent" />
        <span className="font-extrabold leading-none">جواهر الخير</span>
      </span>
      {withTagline && (
        <span className={taglineClassName ?? "mt-1 block text-caption font-bold tracking-wide text-accent"}>
          تُمُور وأكثر
        </span>
      )}
    </span>
  );
}
