import { PageContainer } from "@/ui/primitives/page-container";
import { Skeleton } from "@/ui/primitives/skeleton";

/** Generic fallback for routes without their own loading.tsx (e.g. Shop's skeleton grid at src/app/(storefront)/shop/loading.tsx is more specific). Header/Footer stay mounted — only this page's content area is replaced while loading. */
export default function RootLoading() {
  return (
    <PageContainer className="py-10">
      <Skeleton className="mb-4 h-4 w-40" />
      <Skeleton className="mb-6 h-9 w-64" />
      <Skeleton className="h-40 w-full max-w-2xl" />
    </PageContainer>
  );
}
