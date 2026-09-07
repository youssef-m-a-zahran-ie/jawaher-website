import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumb } from "@/ui/primitives/breadcrumb";
import { EmptyState } from "@/ui/primitives/empty-state";
import { Link } from "@/ui/primitives/link";
import { PageContainer } from "@/ui/primitives/page-container";

const POLICIES: Record<string, string> = {
  shipping: "سياسة الشحن",
  returns: "سياسة الإرجاع",
  payment: "سياسة الدفع",
  privacy: "سياسة الخصوصية",
  terms: "الشروط والأحكام",
};

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return Object.keys(POLICIES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const title = POLICIES[slug];
  return title ? { title } : {};
}

/**
 * "One shared Policy page template for five content slugs, not five
 * bespoke designs" (requirements §2). No policy text exists in
 * _reference/policies/ yet (docs/design/asset-manifest.md) — legal/policy
 * content is a business decision, never invented (this phase's brief), so
 * each page honestly shows its content as pending rather than fabricated
 * legal text.
 */
export default async function PolicyPage({ params }: PageProps) {
  const { slug } = await params;
  const title = POLICIES[slug];
  if (!title) notFound();

  return (
    <PageContainer className="py-10">
      <Breadcrumb items={[{ label: "الرئيسية", href: "/" }, { label: title }]} />
      <h1 className="mb-8 mt-4 text-h1 font-extrabold text-text-primary">{title}</h1>
      <div className="max-w-2xl rounded-lg border border-border">
        <EmptyState
          title="المحتوى قيد الإعداد"
          description="سيتم نشر هذا المحتوى بعد اعتماده من فريق العمل. لأي استفسار الآن، تواصل معنا مباشرة."
          action={
            <Link href="/contact" variant="secondary">
              تواصل معنا
            </Link>
          }
        />
      </div>
    </PageContainer>
  );
}
