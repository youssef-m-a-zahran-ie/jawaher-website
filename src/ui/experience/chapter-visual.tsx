import { cn } from "@/lib/cn";
import { JawaherPalmIcon } from "@/ui/brand/jawaher-mark";
import { JawaherPattern } from "@/ui/brand/jawaher-pattern";
import { ImagePlaceholder } from "@/ui/primitives/image-placeholder";

export type ChapterVisualProps = {
  categoryName: string;
  /** A per-chapter rotation on the palm icon (deg) — one of two small variations between chapters' visual, so all five still read as one system (brand-to-ui.md §3: "no different visual identity per category"), just not identical static repeats. */
  iconRotation: number;
  /** The other variation: alternates which side the icon sits on, so five back-to-back chapters (identical otherwise, given no real photography exists — see this file's own comment) don't read as one static composition repeated five times. */
  reverse: boolean;
};

/**
 * The Products Experience's "scene" for a chapter, given a real constraint:
 * `_reference/experience/<category>/` and `_reference/products/images/` are
 * both empty (brand-to-ui.md §2) — no real photography or video exists for
 * any of the five categories, dates included. The design-system's own
 * non-negotiable rule (design-system.md's binding constraint, top of file)
 * forbids exactly the alternative: a cheap-looking illustrated palm/bee/CGI
 * scene standing in for real photography. Building one anyway would violate
 * that rule and risk exactly the "cartoon food website" this whole phase's
 * brief explicitly rejects.
 *
 * The responsible choice: use the one real, official visual asset that
 * DOES exist — the brand's own icon geometry — as the cinematic subject
 * itself (scroll-animated by experience-motion.tsx, not a static image),
 * and be completely honest that the product photo slot is a placeholder.
 * `data-role` attributes are GSAP's animation targets — this component has
 * zero animation logic of its own, so it renders identically (fully
 * content-complete) whether or not the client motion enhancer ever mounts.
 */
export function ChapterVisual({ categoryName, iconRotation, reverse }: ChapterVisualProps) {
  return (
    <div className={cn("relative flex flex-col items-center gap-8 sm:justify-center", reverse ? "sm:flex-row-reverse" : "sm:flex-row")}>
      <div
        data-role="visual-icon"
        className="relative flex h-56 w-56 shrink-0 items-center justify-center sm:h-72 sm:w-72"
      >
        <JawaherPattern className="text-accent" opacity={0.12} />
        <JawaherPalmIcon
          className="h-40 w-40 text-accent sm:h-52 sm:w-52"
          style={{ transform: `rotate(${iconRotation}deg)` }}
        />
      </div>

      <div data-role="visual-card" className="w-full max-w-xs sm:max-w-sm">
        <ImagePlaceholder
          variant="feature"
          label={`صورة منتج ${categoryName} — قادمة قريبًا`}
          caption="صورة المنتج الحقيقية قادمة قريبًا"
        />
      </div>
    </div>
  );
}
