import type { Metadata } from "next";
import { Suspense } from "react";

import { PageContainer } from "@/ui/primitives/page-container";
import { Skeleton } from "@/ui/primitives/skeleton";
import { TrackLookup } from "./track-lookup";

export const metadata: Metadata = {
  title: "تتبع الطلب",
  alternates: { canonical: "/track" },
  robots: { index: false, follow: false },
};

/**
 * Phase 9.7 — `GET /api/v1/orders/track` existed with zero frontend
 * consumer (only a guest-order-tracking API, never a page); this is that
 * page. `useSearchParams` (for a confirmation-page deep link) requires a
 * Suspense boundary per Next.js App Router.
 *
 * Phase 11 — page-level `robots: {index:false}` added; see checkout/
 * page.tsx's comment on why (previously robots.ts's disallow list alone).
 */
export default function TrackPage() {
  return (
    <PageContainer className="py-10">
      <h1 className="mb-2 text-h1 font-extrabold text-text-primary">تتبع الطلب</h1>
      <p className="mb-6 max-w-md text-body text-text-secondary">
        أدخل رقم الطلب ورقم الهاتف المستخدم عند الطلب لمعرفة حالته.
      </p>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <TrackLookup />
      </Suspense>
    </PageContainer>
  );
}
