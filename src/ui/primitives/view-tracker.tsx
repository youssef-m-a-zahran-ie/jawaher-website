"use client";

import { useEffect } from "react";

import { track, type AnalyticsEvent, type AnalyticsParams } from "@/lib/analytics";

export type ViewTrackerProps = { event: AnalyticsEvent; params?: AnalyticsParams };

/**
 * Fires one `track()` call on mount — the one small client boundary a
 * server-rendered page needs to report "this page was viewed" without
 * becoming a client component itself (the same reasoning as
 * tracked-link.tsx's own comment, applied to page-load events instead of
 * clicks). Renders nothing. Used by category/search pages for
 * `view_category`/`search` — events declared in `analytics.ts`'s union
 * since Phase 3 but never actually fired until Phase 11.
 */
export function ViewTracker({ event, params }: ViewTrackerProps) {
  useEffect(() => {
    track(event, params);
  }, [event, params]);

  return null;
}
