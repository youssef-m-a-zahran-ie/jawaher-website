import { Amphora, Droplets, Milk, Nut, Palmtree } from "lucide-react";
import type { ComponentType } from "react";

/**
 * The five approved first-class categories (docs/requirements/website-functional-requirements.md
 * §2; business context confirmed in Phase 3's brief) — all equally first-class
 * regardless of relative sales mix. `name` matches
 * src/ui/commerce/mock-products.ts's `category` field exactly, so category
 * pages can filter by simple string equality without a second mapping.
 *
 * `slug` implements the "transliterated Latin slug" option
 * docs/requirements/website-functional-requirements.md §25 already
 * recommends but leaves unconfirmed (SEO-003) — plain English category
 * words rather than phonetic transliteration, since "dates" has one
 * unambiguous spelling and "tumoor" doesn't. This is a working default,
 * not a final business decision — see docs/ux/ux-decisions.md's Phase 3
 * section. Swapping to Arabic or transliterated slugs later only touches
 * this file and route folder names, not any component contract.
 */
export type CategorySlug = "dates" | "honey" | "oils" | "nuts" | "ghee";

export type CategoryInfo = {
  slug: CategorySlug;
  /** Arabic display name — matches ProductCardData.category exactly. */
  name: string;
  /** Safe, non-superlative, category-level description — no origin/quality/certification claims. */
  description: string;
  icon: ComponentType<{ className?: string }>;
  /** Business guidance only (Phase 3 brief) — never used to hide or reorder-away any category. */
  featured?: boolean;
};

export const CATEGORIES: CategoryInfo[] = [
  {
    slug: "dates",
    name: "تمور",
    description: "أصناف من التمور المصرية، مصدر تسمية العلامة التجارية وأساس منتجاتها.",
    icon: Palmtree,
    featured: true,
  },
  {
    slug: "honey",
    name: "عسل",
    description: "عسل نحل بأصناف متعددة.",
    icon: Droplets,
  },
  {
    slug: "oils",
    name: "زيوت",
    description: "زيوت طبيعية للاستخدام اليومي.",
    icon: Amphora,
  },
  {
    slug: "nuts",
    name: "مكسرات",
    description: "مكسرات مختارة ومعالجة بعناية.",
    icon: Nut,
  },
  {
    slug: "ghee",
    name: "سمن",
    description: "سمن بلدي وأنواع أخرى من السمن.",
    icon: Milk,
  },
];

export function getCategoryBySlug(slug: string): CategoryInfo | undefined {
  return CATEGORIES.find((category) => category.slug === slug);
}
