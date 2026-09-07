"use client";

import type { MouseEvent } from "react";

import { track, type AnalyticsEvent, type AnalyticsParams } from "@/lib/analytics";
import { Link, type LinkProps } from "@/ui/primitives/link";

export type TrackedLinkProps = LinkProps & {
  event: AnalyticsEvent;
  eventParams?: AnalyticsParams;
};

/**
 * A <Link> that also fires an analytics event on click — the one small
 * client boundary needed to wire docs/ux/ux-specification.md §24's event
 * mapping onto an otherwise server-rendered page (e.g. the homepage hero
 * CTA), without making the whole page/section a client component just for
 * one click handler (docs/architecture/technical-decisions.md's Phase 2
 * Server/Client convention).
 */
export function TrackedLink({ event, eventParams, onClick, ...props }: TrackedLinkProps) {
  function handleClick(clickEvent: MouseEvent<HTMLAnchorElement>) {
    track(event, eventParams);
    onClick?.(clickEvent);
  }

  return <Link {...props} onClick={handleClick} />;
}
