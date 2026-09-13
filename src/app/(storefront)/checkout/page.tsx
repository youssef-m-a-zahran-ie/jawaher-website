import type { Metadata } from "next";

import { PageContainer } from "@/ui/primitives/page-container";
import { CheckoutFlow } from "./checkout-flow";

export const metadata: Metadata = { title: "إتمام الشراء" };

/**
 * Phase 9.7 — this page did not exist before (only the backend + 4 API
 * routes did; see docs/commerce/end-to-end-customer-commerce-readiness.md).
 * A transactional, session-scoped page — disallowed in robots.ts the same
 * way /account already is.
 */
export default function CheckoutPage() {
  return (
    <PageContainer className="py-10">
      <h1 className="mb-6 text-h1 font-extrabold text-text-primary">إتمام الشراء</h1>
      <CheckoutFlow />
    </PageContainer>
  );
}
