import { Amphora, Droplets, Milk, Nut, Palmtree } from "lucide-react";
import type { ComponentType } from "react";

/**
 * The five approved first-class categories (docs/requirements/website-functional-requirements.md
 * §2; business context confirmed in Phase 3's brief).
 *
 * `slug` implements the "transliterated Latin slug" option
 * docs/requirements/website-functional-requirements.md §25 already
 * recommends but leaves unconfirmed (SEO-003) — plain English category
 * words rather than phonetic transliteration, since "dates" has one
 * unambiguous spelling and "tumoor" doesn't. This is a working default,
 * not a final business decision — see docs/ux/ux-decisions.md's Phase 3
 * section. The real `Category.slug` column (the Website database) is
 * expected to use these same five values — this type exists so
 * presentation-only code (this file, chapters.ts) keeps a compile-time
 * check against them, never as a second source of catalog truth (see
 * this file's own header comment below).
 */
export type CategorySlug = "dates" | "honey" | "oils" | "nuts" | "ghee";

export type CategoryPresentation = {
  /** Safe, non-superlative, category-level description — no origin/quality/certification claims. */
  description: string;
  icon: ComponentType<{ className?: string }>;
  /** Business guidance only (Phase 3 brief) — never used to hide or reorder-away any category. */
  featured?: boolean;
};

/**
 * Category Catalog Reconnection — this file is now PRESENTATION-ONLY.
 * `slug` and `name` (the real catalog identity) come from the Website
 * database via `catalogService.listCategories()`/`getCategory()` — never
 * duplicated here. What remains here — icon, marketing description,
 * "featured" flag — has no place in a generic, reusable commerce schema:
 * a future business reusing this foundation replaces only this one file
 * with their own icons/copy, touching no catalog/domain code at all.
 *
 * Keyed loosely (`Record<string, ...>`), not by the closed `CategorySlug`
 * union above, so a category that exists in the real database but has no
 * entry here (e.g. one added later via ERP sync) degrades to
 * `getCategoryPresentation` returning `undefined` — callers fall back to a
 * generic default (see catalog-adapters.ts's `toCategoryCardData`) rather
 * than a type error or a crash. The five keys below happen to match
 * `CategorySlug` today; that's current business reality, not an
 * architectural constraint.
 */
const CATEGORY_PRESENTATION: Record<string, CategoryPresentation> = {
  dates: {
    description: "أصناف من التمور المصرية، مصدر تسمية العلامة التجارية وأساس منتجاتها.",
    icon: Palmtree,
    featured: true,
  },
  honey: {
    description: "عسل نحل بأصناف متعددة.",
    icon: Droplets,
  },
  oils: {
    description: "زيوت طبيعية للاستخدام اليومي.",
    icon: Amphora,
  },
  nuts: {
    description: "مكسرات مختارة ومعالجة بعناية.",
    icon: Nut,
  },
  ghee: {
    description: "سمن بلدي وأنواع أخرى من السمن.",
    icon: Milk,
  },
};

export function getCategoryPresentation(slug: string): CategoryPresentation | undefined {
  return CATEGORY_PRESENTATION[slug];
}
