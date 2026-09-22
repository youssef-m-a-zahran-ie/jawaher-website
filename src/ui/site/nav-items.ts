export type NavItem = { label: string; href: string };

/**
 * Primary site navigation. The categories are direct nav items, not
 * nested inside a "Categories" menu — requirements §2's explicit
 * structural call ("no standalone all-categories index page... five
 * categories are direct nav items"). A per-category hover dropdown
 * (docs/ux/ux-specification.md §3) is deferred: it would only ever hold
 * subcategory/type filters, and that attribute data is an open ERP
 * dependency (requirements §25) — nothing exists to put in it yet. See
 * docs/ux/ux-decisions.md's Phase 3 section.
 *
 * Category Catalog Reconnection — was a static `CATEGORIES.map(...)`
 * baked into a module-level constant; now a plain function over whatever
 * real categories the caller already fetched from `catalogService`
 * (`Header`, the one caller today). Kept as a pure function taking data
 * rather than fetching itself, so this file stays free of any catalog/DB
 * dependency — it only knows how to shape a nav list, not where
 * categories come from.
 */
export function buildNavItems(categories: { slug: string; name: string }[]): NavItem[] {
  return [
    { label: "المتجر", href: "/shop" },
    ...categories.map((category) => ({ label: category.name, href: `/shop/${category.slug}` })),
    { label: "تجربة المنتجات", href: "/experience" },
    { label: "من نحن", href: "/about" },
    { label: "تواصل معنا", href: "/contact" },
  ];
}
