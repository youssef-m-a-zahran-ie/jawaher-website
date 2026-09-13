import type { Metadata } from "next";

import { PageContainer } from "@/ui/primitives/page-container";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "تواصل معنا", alternates: { canonical: "/contact" } };

/**
 * No phone/email/address is shown — none exist in _reference/business/
 * contact/ yet (docs/design/asset-manifest.md). The form is the real,
 * working contact channel until that's supplied; see the API route's
 * comment (src/app/api/v1/contact/route.ts) for exactly what it does today.
 */
export default function ContactPage() {
  return (
    <PageContainer className="py-10">
      <h1 className="text-h1 font-extrabold text-text-primary">تواصل معنا</h1>
      <p className="mt-4 max-w-md text-body text-text-secondary">
        راسلنا وسنرد عليك في أقرب وقت ممكن.
      </p>
      <div className="mt-8">
        <ContactForm />
      </div>
    </PageContainer>
  );
}
