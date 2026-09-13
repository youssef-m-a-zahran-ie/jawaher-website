import { ChapterProductShowcase } from "@/ui/experience/chapter-product-showcase";
import { ChapterVisual } from "@/ui/experience/chapter-visual";
import type { ExperienceChapter } from "@/ui/experience/chapters";
import { Link } from "@/ui/primitives/link";
import { PageContainer } from "@/ui/primitives/page-container";
import { TrackedLink } from "@/ui/primitives/tracked-link";
import type { ProductCardData } from "@/ui/commerce/types";

export type ChapterSectionProps = {
  chapter: ExperienceChapter;
  iconRotation: number;
  reverseVisual: boolean;
  products: ProductCardData[];
  nextChapter: ExperienceChapter | null;
};

/**
 * One full chapter — content-complete on its own (headline, message,
 * visual, real product showcase, CTA, next-chapter link) per
 * ux-specification.md §16's template, so it reads identically whether or
 * not experience-motion.tsx's client enhancer ever mounts (reduced motion,
 * JS disabled, or the enhancer failing to load all render the exact same
 * page — just without the scroll choreography layered on top).
 *
 * `data-experience-chapter`/`data-category` are the only hooks the client
 * motion/analytics controllers need — this component has no "use client"
 * and no animation state of its own.
 */
export function ChapterSection({ chapter, iconRotation, reverseVisual, products, nextChapter }: ChapterSectionProps) {
  return (
    <section
      id={`chapter-${chapter.category}`}
      data-experience-chapter
      data-category={chapter.category}
      className="relative overflow-hidden bg-surface-dark py-20 sm:py-28"
    >
      <PageContainer className="relative flex flex-col items-center gap-8 text-center">
        <p data-role="opening-line" className="max-w-md text-body-sm font-bold tracking-wide text-accent uppercase">
          {chapter.openingLine}
        </p>
        <h2 data-role="headline" className="max-w-2xl text-display font-extrabold text-text-on-dark-strong text-balance">
          {chapter.keyMessage}
        </h2>

        <ChapterVisual categoryName={chapter.name} iconRotation={iconRotation} reverse={reverseVisual} />

        <TrackedLink
          href={`/shop/${chapter.category}`}
          event="product_experience_cta_clicked"
          eventParams={{ category: chapter.category }}
          variant="primary"
          size="lg"
        >
          تسوق {chapter.name}
        </TrackedLink>

        {products.length > 0 && (
          <div className="w-full pt-8">
            <h3 className="mb-6 text-h3 font-bold text-text-on-dark-strong">منتجات {chapter.name}</h3>
            <ChapterProductShowcase products={products} />
          </div>
        )}

        <div className="pt-8">
          {nextChapter ? (
            <Link href={`#chapter-${nextChapter.category}`} className="text-body-sm font-bold text-accent no-underline hover:underline">
              الفصل التالي: {nextChapter.name} ↓
            </Link>
          ) : (
            <Link href="/shop" variant="secondary">
              العودة للتسوق
            </Link>
          )}
        </div>
      </PageContainer>
    </section>
  );
}
