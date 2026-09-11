import { SITE_URL } from "@/lib/site-url";

/**
 * JSON-LD builders — Phase 3's SEO foundation
 * (docs/planning/feature-completeness-audit.md). Every field here is either
 * a structural fact (a URL this app actually serves) or already-approved
 * brand content (the business name) — never a fabricated rating, review,
 * price, address, or phone number. `Product` JSON-LD is deliberately NOT
 * built here yet. Phase 9.1 reconnected the storefront to the real,
 * database-backed catalog (mock-products.ts is no longer its data
 * source), but every seeded product name still carries a literal
 * "(اسم تجريبي)" suffix, so the underlying reason is unchanged: unlike an
 * on-page label, a crawler reading JSON-LD has no way to know a price is
 * a placeholder. Add this once real (non-suffixed) catalog content
 * exists — see docs/design/design-decisions.md's Phase 3 section and
 * docs/integration/catalog-inventory-gap-analysis.md's Phase 9.1 addendum.
 */

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "جواهر الخير",
    url: SITE_URL,
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "جواهر الخير",
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(items: { label: string; href?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: `${SITE_URL}${item.href}` } : {}),
    })),
  };
}
