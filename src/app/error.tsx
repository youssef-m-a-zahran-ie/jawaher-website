"use client";

import { useEffect } from "react";

import { ErrorState } from "@/ui/primitives/error-state";
import { Link } from "@/ui/primitives/link";
import { PageContainer } from "@/ui/primitives/page-container";

/**
 * Next.js's required error-boundary convention (must be a Client
 * Component — this runs in the browser, so src/lib/logger.ts's pino
 * instance, which is Node-only, cannot be used here; console.error is the
 * standard, Next.js-documented pattern for this specific boundary). Copy
 * follows docs/ux/ux-specification.md §21's error rule: "Arabic,
 * non-technical, polite, includes an internal reference code... never a
 * stack trace or raw HTTP status." `error.digest` is the server-generated
 * correlation id for a server-side error; nothing technical from `error`
 * itself is ever shown to the customer.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer className="py-24">
      <ErrorState
        title="حدث خطأ غير متوقع"
        description="برجاء المحاولة مرة أخرى أو التواصل معنا إذا استمرت المشكلة."
        reference={error.digest}
        action={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center justify-center rounded-md bg-cta-bg px-5 text-body font-bold text-cta-text hover:bg-brand-brown-dark"
            >
              حاول مرة أخرى
            </button>
            <Link href="/" variant="secondary">
              الرئيسية
            </Link>
          </div>
        }
      />
    </PageContainer>
  );
}
