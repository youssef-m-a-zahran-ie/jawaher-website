import { Search as SearchIcon } from "lucide-react";
import type { Metadata } from "next";

import { catalogService } from "@/modules/catalog";
import { toProductCardDataList } from "@/ui/commerce/catalog-adapters";
import { ProductGrid } from "@/ui/commerce/product-grid";
import { Button } from "@/ui/primitives/button";
import { EmptyState } from "@/ui/primitives/empty-state";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Link } from "@/ui/primitives/link";
import { PageContainer } from "@/ui/primitives/page-container";

export const metadata: Metadata = { title: "بحث" };

type PageProps = { searchParams: Promise<{ q?: string }> };

/**
 * A dedicated page, not the inline-panel/full-screen-overlay pattern
 * docs/ux/ux-specification.md §8 specifies — that pattern needs
 * autocomplete/typeahead, out of scope here too. Plain GET form (works
 * with zero client JS), unchanged.
 *
 * Phase 9.1 — reconnected to `catalogService.searchProducts()` (was an
 * in-memory `Array.includes()` scan over `MOCK_PRODUCTS`), which runs a
 * case-insensitive Postgres `contains` query against product name and
 * category name — the same two fields the mock version matched, no more,
 * no fewer. No Arabic-specific normalization (ة/ه, أ/إ/ا, diacritics) was
 * added: none was found already implemented or specified anywhere in this
 * codebase to preserve, and this phase's brief explicitly forbids
 * introducing fuzzy search or a search engine — inventing normalization
 * rules would be exactly that. See
 * docs/integration/catalog-inventory-gap-analysis.md's Phase 9.1 addendum.
 *
 * `dynamic = "force-dynamic"` added explicitly (belt-and-suspenders —
 * reading `searchParams` already makes a page dynamic in Next.js by
 * itself, but every other reconnected catalog page in this phase needed
 * this explicitly, confirmed by a real failed build attempt on /shop, so
 * it's stated here too rather than relied on implicitly).
 */
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query ? toProductCardDataList(await catalogService.searchProducts(query)) : [];

  return (
    <PageContainer className="py-10">
      <h1 className="mb-6 text-h1 font-extrabold text-text-primary">البحث</h1>

      <form method="GET" className="mb-10 flex max-w-md items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="q" className="sr-only">
            ابحث عن منتج
          </Label>
          <Input id="q" name="q" type="search" defaultValue={query} placeholder="ابحث عن منتج..." />
        </div>
        <Button type="submit" aria-label="بحث">
          <SearchIcon className="size-4" aria-hidden="true" />
          بحث
        </Button>
      </form>

      {!query && (
        <EmptyState icon={<SearchIcon className="size-10" />} title="ابدأ البحث" description="اكتب اسم منتج أو فئة." />
      )}

      {query && results.length === 0 && (
        <EmptyState
          title={`لا توجد نتائج لـ "${query}"`}
          description="جرّب كلمة مختلفة، أو تصفح المتجر."
          action={
            <Link href="/shop" variant="secondary">
              تصفح المتجر
            </Link>
          }
        />
      )}

      {results.length > 0 && (
        <>
          <p className="mb-6 text-body-sm text-text-secondary">{`${results.length} نتيجة لـ "${query}"`}</p>
          <ProductGrid products={results} />
        </>
      )}
    </PageContainer>
  );
}
