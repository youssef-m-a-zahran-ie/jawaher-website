import { Link } from "@/ui/primitives/link";
import { cn } from "@/lib/cn";
import { JawaherPattern } from "@/ui/brand/jawaher-pattern";
import type { CategoryCardData } from "@/ui/commerce/types";

export type CategoryTileProps = {
  category: CategoryCardData;
  /** Larger tile for the homepage's business-guided dates emphasis — same card, same system, just bigger (docs/design/design-decisions.md). */
  size?: "md" | "lg";
  className?: string;
};

/**
 * Photography-led per docs/design/design-system.md §8 — but no category
 * photography exists yet (docs/design/asset-manifest.md), so this uses a
 * brand-toned gradient field + a generic representative icon instead of a
 * fake photo (docs/design/brand-to-ui.md §2: never present a generated/
 * stock image as if it were real product photography).
 *
 * Phase 10: the ghosted packaging pattern (jawaher-pattern.tsx) fills the
 * field behind the icon — the same real brand texture used on Jawaher's
 * own packaging, instead of a plain gradient standing in for "no photo yet."
 * A bottom scrim keeps the label legible over it regardless of pattern density.
 */
export function CategoryTile({ category, size = "md", className }: CategoryTileProps) {
  const Icon = category.icon;

  return (
    <Link
      href={`/shop/${category.slug}`}
      className={cn(
        "group relative flex flex-col justify-end overflow-hidden rounded-lg",
        "bg-gradient-to-br from-surface-dark via-brand-brown-mid to-surface-dark",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        size === "lg" ? "aspect-[4/3] sm:aspect-[16/9]" : "aspect-square",
        className,
      )}
    >
      <JawaherPattern className="text-text-on-dark" opacity={0.1} />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-surface-dark/90 to-transparent" />
      <Icon
        className={cn(
          "relative z-10 self-end me-4 mt-4 text-accent/80 transition-transform duration-200 ease-out group-hover:scale-110",
          size === "lg" ? "size-12" : "size-8",
        )}
        aria-hidden="true"
      />
      <div className="relative z-10 p-5">
        <p className={cn("font-extrabold text-text-on-dark-strong", size === "lg" ? "text-h2" : "text-h4")}>
          {category.name}
        </p>
        <p className="mt-1 text-body-sm text-text-on-dark/80">{category.description}</p>
      </div>
    </Link>
  );
}
