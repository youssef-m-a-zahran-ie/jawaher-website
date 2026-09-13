"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

import { ExperienceAnalytics } from "@/ui/experience/experience-analytics";

// `ssr: false` + dynamic import is how GSAP/ScrollTrigger's weight stays
// off every other route's bundle (technical-architecture.md §25) — this
// file is the ONLY place in the app that imports experience-motion.tsx.
const ExperienceMotion = dynamic(
  () => import("@/ui/experience/experience-motion").then((mod) => mod.ExperienceMotion),
  { ssr: false },
);

function subscribeToReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function readMotionAllowed() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The one client boundary on an otherwise fully server-rendered page
 * (page.tsx below). Splits two concerns that must NOT share a fate:
 * analytics (must always run) and motion (must never run under
 * `prefers-reduced-motion: reduce` — this phase's brief §10).
 * `useSyncExternalStore` (not an effect + setState) is React's own
 * documented way to read a browser API's current value safely across
 * SSR/hydration — the server snapshot (`getServerSnapshot`) is `false`,
 * so the animation enhancer never even attempts to mount before hydration.
 */
export function ExperienceClient() {
  const motionAllowed = useSyncExternalStore(subscribeToReducedMotion, readMotionAllowed, () => false);

  return (
    <>
      <ExperienceAnalytics />
      {motionAllowed && <ExperienceMotion />}
    </>
  );
}
