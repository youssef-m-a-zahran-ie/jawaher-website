import { JawaherPattern } from "@/ui/brand/jawaher-pattern";
import { Link } from "@/ui/primitives/link";
import { PageContainer } from "@/ui/primitives/page-container";

/**
 * Merged brand-story + Products Experience teaser — one section, not two
 * (docs/ux/ux-specification.md §4 row 6: a separate block for each would
 * repeat the same message on one page). Copy stays generic/category-level
 * (no invented history, sourcing claims, or certifications — this phase's
 * brief).
 *
 * Phase 10: the Products Experience is real now (src/app/(storefront)/
 * experience/page.tsx) — this section links to it directly instead of the
 * old "قريبًا" badge.
 */
export function StoryTeaser() {
  return (
    <section className="relative overflow-hidden bg-surface-dark">
      <JawaherPattern className="text-text-on-dark" opacity={0.05} />
      <PageContainer className="relative flex flex-col items-start gap-4 py-16">
        <h2 className="text-h1 font-extrabold text-text-on-dark-strong text-balance">
          من حبة التمر إلى جواهر الخير
        </h2>
        <p className="max-w-2xl text-body-lg text-text-on-dark/85">
          كل فئة من منتجاتنا — التمور، العسل، الزيوت، المكسرات والسمن — لها قصتها الخاصة، من المادة الخام
          إلى التغليف الذي يصل إليك. تجربة سردية تروي هذه القصة لكل فئة.
        </p>
        <Link href="/experience" variant="primary" className="mt-2">
          اكتشف تجربة المنتجات
        </Link>
      </PageContainer>
    </section>
  );
}
