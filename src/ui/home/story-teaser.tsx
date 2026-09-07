import { Sparkles } from "lucide-react";

import { Badge } from "@/ui/primitives/badge";
import { PageContainer } from "@/ui/primitives/page-container";

/**
 * Merged brand-story + Products Experience teaser — one section, not two
 * (docs/ux/ux-specification.md §4 row 6: a separate block for each would
 * repeat the same message on one page). Copy stays generic/category-level
 * (no invented history, sourcing claims, or certifications — this phase's
 * brief). The Products Experience itself doesn't exist yet, so its entry
 * point is a "قريبًا" badge rather than a link to a route that would 404 —
 * it communicates the experience is coming without pretending it's ready
 * (this phase's brief).
 */
export function StoryTeaser() {
  return (
    <section className="bg-surface-dark">
      <PageContainer className="flex flex-col items-start gap-4 py-16">
        <h2 className="text-h1 font-extrabold text-text-on-dark-strong text-balance">
          من حبة التمر إلى جواهر الخير
        </h2>
        <p className="max-w-2xl text-body-lg text-text-on-dark/85">
          كل فئة من منتجاتنا — التمور، العسل، الزيوت، المكسرات والسمن — لها قصتها الخاصة، من المادة الخام
          إلى التغليف الذي يصل إليك. نعمل على تجربة سردية تفاعلية تروي هذه القصة لكل فئة.
        </p>
        <div className="mt-2 inline-flex items-center gap-2">
          <Sparkles className="size-4 text-accent" aria-hidden="true" />
          <Badge variant="accent">تجربة المنتجات الكاملة — قريبًا</Badge>
        </div>
      </PageContainer>
    </section>
  );
}
