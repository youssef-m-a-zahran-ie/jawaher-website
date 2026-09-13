"use client";

import { useEffect } from "react";

import { track } from "@/lib/analytics";

/**
 * Deliberately separate from experience-motion.tsx: tracking which
 * chapters a customer actually views must work identically regardless of
 * `prefers-reduced-motion` or whether the (heavier, GSAP-based) motion
 * enhancer loaded at all — analytics correctness must never depend on
 * animation succeeding. Uses IntersectionObserver directly (no GSAP)
 * against the same `[data-experience-chapter]` sections
 * chapter-section.tsx already renders.
 */
export function ExperienceAnalytics() {
  useEffect(() => {
    track("product_experience_started");

    const sections = document.querySelectorAll<HTMLElement>("[data-experience-chapter]");
    if (sections.length === 0) return;

    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const category = entry.target.getAttribute("data-category");
          if (entry.isIntersecting && category && !seen.has(category)) {
            seen.add(category);
            track("product_experience_chapter_viewed", { category });
          }
        }
      },
      { threshold: 0.4 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return null;
}
