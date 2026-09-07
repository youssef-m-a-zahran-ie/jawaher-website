import { PageContainer } from "@/ui/primitives/page-container";
import { TrackedLink } from "@/ui/primitives/tracked-link";

/**
 * Media strategy for Phase 3 (docs/design/asset-manifest.md: no product/
 * hero photography exists yet): rather than an image slot standing empty
 * or holding a placeholder icon at hero scale, the hero is a confident
 * typographic/color-field composition — a deliberate design choice, not a
 * missing asset dressed up. Swapping in real photography later
 * (docs/design/design-system.md §8) only touches this file's background.
 * One headline, one CTA — no carousel, no secondary CTA
 * (docs/ux/ux-specification.md §4 row 1).
 */
export function Hero() {
  return (
    <section className="bg-gradient-to-b from-surface-dark to-brand-brown-mid">
      <PageContainer className="flex flex-col items-start gap-6 py-20 sm:py-28">
        <p className="text-body-sm font-bold tracking-wide text-accent uppercase">علامة مصرية فاخرة</p>
        <h1 className="max-w-2xl text-display font-extrabold text-text-on-dark-strong text-balance">
          جواهر الخير
        </h1>
        <p className="text-h3 font-bold text-accent">تُمُور وأكثر</p>
        <p className="max-w-lg text-body-lg text-text-on-dark/85">
          تمور، عسل، زيوت، مكسرات وسمن — بجودة تليق بالاسم.
        </p>
        <TrackedLink href="/shop" event="hero_cta_clicked" variant="primary" size="lg">
          تسوق الآن
        </TrackedLink>
      </PageContainer>
    </section>
  );
}
