import type { Metadata } from "next";

import { logger } from "@/lib/logger";
import { catalogService } from "@/modules/catalog";
import type { ProductView } from "@/modules/catalog";
import { toProductCardDataList } from "@/ui/commerce/catalog-adapters";
import { ChapterNav } from "@/ui/experience/chapter-nav";
import { ChapterSection } from "@/ui/experience/chapter-section";
import { EXPERIENCE_CHAPTERS } from "@/ui/experience/chapters";
import { ExperienceClient } from "@/ui/experience/experience-client";
import { Link } from "@/ui/primitives/link";
import { PageContainer } from "@/ui/primitives/page-container";

export const metadata: Metadata = {
  title: "تجربة المنتجات",
  description: "تمور، عسل، زيوت، مكسرات وسمن — قصة كل فئة من جواهر الخير.",
};

/**
 * `dynamic = "force-dynamic"` for the same reason /shop has it: real,
 * changeable catalog data must never be baked into a build-time static
 * page (shop/page.tsx's own comment) — this page's product showcases are
 * real `catalogService` data, never mock/sample products standing in for
 * a "cinematic" page.
 */
export const dynamic = "force-dynamic";

// Purely decorative variation on the one real brand asset available
// (the palm icon) so the five chapters don't look like five identical
// static repeats — brand-to-ui.md §3 still applies: this is NOT a
// different visual identity per category, just a small rotation.
const ICON_ROTATIONS: Record<string, number> = { dates: 0, honey: -8, oils: 6, nuts: -5, ghee: 8 };

/**
 * Phase 10 — the Products Experience hub. Did not exist before this
 * phase (blueprint.md's planned `(experience)/` structure was never
 * built; the homepage's own StoryTeaser section only ever showed a
 * "قريبًا" badge). Built as a fully server-rendered, content-complete page
 * (every headline/message/product/CTA is real markup, not canvas-drawn —
 * this phase's brief §20) with exactly one client-side enhancement layer
 * (`ExperienceClient`) that adds scroll choreography on top, skipped
 * entirely under `prefers-reduced-motion` (see that file's own comment).
 *
 * No real photography/video exists for any of the five categories yet
 * (`_reference/experience/*`, `_reference/products/images/*` are all
 * empty — confirmed, not assumed) — see chapter-visual.tsx's comment for
 * why the "cinematic" visual is built from the brand's own icon geometry
 * plus an honestly-labeled placeholder instead of a fabricated photoreal
 * scene, and docs/design/premium-experience-phase-10.md for the full
 * reasoning and the production-asset list this unblocks once supplied.
 *
 * The catalog fetch is wrapped in try/catch, same reasoning as the
 * homepage fix (page.tsx's own comment): every chapter's headline/
 * message/visual/CTA is real markup independent of the product data, and
 * a catalog outage must degrade to "no product showcase this chapter"
 * (ChapterSection already omits that block when `products` is empty),
 * never take down the whole storytelling page.
 */
export default async function ExperiencePage() {
  let chapterProducts: ProductView[][];
  try {
    chapterProducts = await Promise.all(
      EXPERIENCE_CHAPTERS.map((chapter) => catalogService.listProductsByCategory(chapter.category)),
    );
  } catch (err) {
    logger.warn({ err }, "products experience: catalog fetch failed — showing chapters without product showcases");
    chapterProducts = EXPERIENCE_CHAPTERS.map(() => []);
  }

  return (
    <>
      <ExperienceClient />
      <ChapterNav chapters={EXPERIENCE_CHAPTERS} />

      <section className="bg-surface-dark pt-16 pb-4 text-center sm:pt-24">
        <PageContainer className="flex flex-col items-center gap-4">
          <p className="text-body-sm font-bold tracking-wide text-accent uppercase">تجربة المنتجات</p>
          <h1 className="max-w-3xl text-display font-extrabold text-text-on-dark-strong text-balance">
            من حبة التمر إلى جواهر الخير
          </h1>
          <p className="max-w-xl text-body-lg text-text-on-dark/85">
            خمس فئات، خمس قصص — تمور، عسل، زيوت، مكسرات وسمن. مرر للأسفل لتبدأ.
          </p>
        </PageContainer>
      </section>

      {EXPERIENCE_CHAPTERS.map((chapter, index) => (
        <ChapterSection
          key={chapter.category}
          chapter={chapter}
          iconRotation={ICON_ROTATIONS[chapter.category] ?? 0}
          reverseVisual={index % 2 === 1}
          products={toProductCardDataList(chapterProducts[index]).slice(0, 6)}
          nextChapter={EXPERIENCE_CHAPTERS[index + 1] ?? null}
        />
      ))}

      <section className="bg-surface py-16 text-center">
        <PageContainer className="flex flex-col items-center gap-4">
          <p className="text-h3 font-bold text-text-primary">جواهر الخير — تُمُور وأكثر</p>
          <Link href="/shop" variant="primary" size="lg">
            ابدأ التسوق
          </Link>
        </PageContainer>
      </section>
    </>
  );
}
