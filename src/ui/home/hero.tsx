import { JawaherPalmIcon } from "@/ui/brand/jawaher-mark";
import { JawaherPattern } from "@/ui/brand/jawaher-pattern";
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
 *
 * Phase 10: the palm icon (large, low-opacity, reading-end side) and the
 * ghosted packaging pattern (§ jawaher-pattern.tsx) are added as the
 * composition's brand-forward layer — the first real trace of the
 * official mark anywhere on the homepage, replacing pure color-field
 * emptiness with something unmistakably Jawaher's own.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-surface-dark to-brand-brown-mid">
      <JawaherPattern className="text-text-on-dark" opacity={0.05} />
      <JawaherPalmIcon
        className="pointer-events-none absolute -end-16 top-1/2 hidden h-[32rem] w-[32rem] -translate-y-1/2 text-accent/10 sm:block"
      />
      <PageContainer className="relative flex flex-col items-start gap-6 py-20 sm:py-28">
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
