"use client";

import { useEffect } from "react";

/**
 * The Products Experience's scroll choreography — GSAP + ScrollTrigger,
 * per blueprint.md §17/ADR-017's already-approved technical direction.
 * Dynamically imported with `ssr: false` from page.tsx and mounted only
 * on this one route, so GSAP's bundle weight never reaches Shop/PDP/
 * Checkout (technical-architecture.md §25's isolation requirement).
 *
 * Real bug found and fixed this phase, via an actual full-page screenshot
 * (not just code review): the first version animated FROM `opacity: 0`,
 * relying entirely on each section's ScrollTrigger firing to ever reach
 * `opacity: 1`. A full-page capture that renders the page's height without
 * performing a real incremental scroll (some headless/automated renderers
 * do this, and it's a real SEO-crawler risk per this phase's brief §20 —
 * "must coexist with... crawlable content") left every chapter past the
 * first permanently invisible — exactly the "hides content behind
 * animation" failure this phase's brief explicitly forbids (§12/§20),
 * and worse than reduced-motion's own handling of the same content, which
 * this file's caller already gets right.
 *
 * Fixed by never hiding content in the first place: every target starts
 * at full opacity; only a small Y-offset/scale is animated away. If this
 * effect never runs at all, or a ScrollTrigger never fires for some
 * reason, the page is still 100% readable — animation only adds a subtle
 * "settle into place" polish on top of content that was already there
 * and already visible.
 *
 * No `pin` is used anywhere: pinning is GSAP's most jank-prone feature and
 * this experience has no beat that requires content to hold in place while
 * something else happens around it.
 */
export function ExperienceMotion() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    import("gsap").then(async ({ gsap }) => {
      if (cancelled) return;
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);

      const isMobile = window.matchMedia("(max-width: 640px)").matches;
      const tweens: ReturnType<typeof gsap.to>[] = [];

      document.querySelectorAll<HTMLElement>("[data-experience-chapter]").forEach((section) => {
        const openingLine = section.querySelector<HTMLElement>('[data-role="opening-line"]');
        const headline = section.querySelector<HTMLElement>('[data-role="headline"]');
        const icon = section.querySelector<HTMLElement>('[data-role="visual-icon"]');
        const card = section.querySelector<HTMLElement>('[data-role="visual-card"]');
        const textTargets = [openingLine, headline].filter((el): el is HTMLElement => el !== null);
        const visualTargets = [icon, card].filter((el): el is HTMLElement => el !== null);
        if (textTargets.length === 0 && visualTargets.length === 0) return;

        // Never opacity: 0 — only a settle-in offset, so a ScrollTrigger
        // that never fires still leaves fully-readable, correctly-placed content.
        gsap.set(textTargets, { y: 20 });
        gsap.set(visualTargets, { y: 12, scale: 0.94, rotate: -4 });

        const duration = isMobile ? 0.5 : 0.8;
        const tween = gsap.to([...textTargets, ...visualTargets], {
          y: 0,
          scale: 1,
          rotate: 0,
          duration,
          ease: "power2.out",
          stagger: 0.08,
          scrollTrigger: { trigger: section, start: "top 80%", toggleActions: "play none none none" },
        });
        tweens.push(tween);
      });

      cleanup = () => {
        tweens.forEach((tween) => tween.kill());
        ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
