import { Search as SearchIcon } from "lucide-react";
import type { Metadata } from "next";

import { MOCK_PRODUCTS } from "@/ui/commerce/mock-products";
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
 * autocomplete/typeahead, which needs real search ranking this phase
 * explicitly doesn't build. This establishes the /search route (this
 * phase's brief) with a plain GET form (works with zero client JS) doing a
 * simple client-independent substring match over mock data — a real UI
 * shape, not a demo of the eventual normalized/ranked search. See
 * docs/ux/ux-decisions.md's Phase 3 section.
 */
export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query
    ? MOCK_PRODUCTS.filter((product) => product.name.includes(query) || product.category.includes(query))
    : [];

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
