import { SITE_URL } from "@/lib/site-url";

/**
 * JSON-LD builders — Phase 3's SEO foundation
 * (docs/planning/feature-completeness-audit.md). Every field here is either
 * a structural fact (a URL this app actually serves) or already-approved
 * brand content (the business name) — never a fabricated rating, review,
 * price, address, or phone number. `Product` JSON-LD is deliberately NOT
 * built here yet: every product on the site is still labeled mock data
 * (src/ui/commerce/mock-products.ts), and unlike an on-page "(اسم تجريبي)"
 * label, a crawler reading JSON-LD has no way to know a price is a
 * placeholder — see docs/design/design-decisions.md's Phase 3 section.
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
