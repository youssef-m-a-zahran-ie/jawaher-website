import { PageContainer } from "@/ui/primitives/page-container";
import { Skeleton } from "@/ui/primitives/skeleton";

/**
 * Skeletons shaped like the real product card (image block + 2 text lines
 * + price line) rather than a generic spinner — docs/ux/ux-specification.md
 * §5/§21: "never a generic spinner that causes layout jump."
 */
export default function ShopLoading() {
  return (
    <PageContainer className="py-10">
      <Skeleton className="mb-4 h-4 w-40" />
      <Skeleton className="mb-6 mt-4 h-9 w-32" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-3">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
