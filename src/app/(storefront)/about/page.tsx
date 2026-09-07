import type { Metadata } from "next";

import { CATEGORIES } from "@/ui/commerce/categories";
import { EmptyState } from "@/ui/primitives/empty-state";
import { Link } from "@/ui/primitives/link";
import { PageContainer } from "@/ui/primitives/page-container";

export const metadata: Metadata = { title: "من نحن" };

/**
 * "Content supplied by business, not invented" (requirements §2). What's
 * safely real here: the brand name/tagline (approved brand content) and
 * the five-category product range (a structural fact, not a claim). The
 * detailed brand narrative doesn't exist in _reference/business/company/
 * yet (docs/design/asset-manifest.md) — rather than fabricate one, that
 * section is honestly marked pending, per this phase's brief ("if content
 * is not available: use clearly identifiable content placeholders").
 */
export default function AboutPage() {
  return (
    <PageContainer className="py-10">
      <h1 className="text-h1 font-extrabold text-text-primary">من نحن</h1>
      <p className="mt-4 max-w-2xl text-body-lg text-text-secondary">
        جواهر الخير — تُمُور وأكثر. علامة مصرية تقدّم التمور والعسل والزيوت والمكسرات والسمن.
      </p>

      <div className="mt-10 max-w-2xl">
        <h2 className="mb-4 text-h3 font-extrabold text-text-primary">ماذا نقدّم</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CATEGORIES.map((category) => (
            <li key={category.slug} className="rounded-md border border-border bg-surface-secondary px-4 py-3">
              <span className="text-body-sm font-bold text-text-primary">{category.name}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-12 max-w-2xl rounded-lg border border-border">
        <EmptyState
          title="قصة العلامة التجارية الكاملة قيد الإعداد"
          description="نعمل على إضافة قصة العلامة التجارية الكاملة. لأي استفسار الآن، تواصل معنا مباشرة."
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
