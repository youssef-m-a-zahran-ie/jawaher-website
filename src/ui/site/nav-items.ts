import { CATEGORIES } from "@/ui/commerce/categories";

export type NavItem = { label: string; href: string };

/**
 * Primary site navigation. The five categories are direct nav items, not
 * nested inside a "Categories" menu — requirements §2's explicit
 * structural call ("no standalone all-categories index page... five
 * categories are direct nav items"). A per-category hover dropdown
 * (docs/ux/ux-specification.md §3) is deferred: it would only ever hold
 * subcategory/type filters, and that attribute data is an open ERP
 * dependency (requirements §25) — nothing exists to put in it yet. See
 * docs/ux/ux-decisions.md's Phase 3 section.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "المتجر", href: "/shop" },
  ...CATEGORIES.map((category) => ({ label: category.name, href: `/shop/${category.slug}` })),
  { label: "تجربة المنتجات", href: "/experience" },
  { label: "من نحن", href: "/about" },
  { label: "تواصل معنا", href: "/contact" },
];
