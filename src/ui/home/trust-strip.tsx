import { MessageCircle, Package, ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";

import { Link } from "@/ui/primitives/link";
import { PageContainer } from "@/ui/primitives/page-container";

type TrustPoint = { icon: ComponentType<{ className?: string }>; label: string; href?: string };

/**
 * "Short factual row... no invented badges" (docs/ux/ux-specification.md
 * §4 row 4). Deliberately excludes anything this project doesn't actually
 * know yet: delivery zones/fees and COD are still open business decisions
 * (docs/requirements/website-functional-requirements.md §25), so neither
 * appears here — only what's true today (five real categories, a working
 * contact channel, and brand-voice quality language with no specific,
 * checkable claim behind it).
 */
const TRUST_POINTS: TrustPoint[] = [
  { icon: Package, label: "خمس فئات من المنتجات الغذائية" },
  { icon: ShieldCheck, label: "جودة تليق باسم جواهر الخير" },
  { icon: MessageCircle, label: "تواصل مباشر مع فريقنا", href: "/contact" },
];

export function TrustStrip() {
  return (
    <section className="bg-surface-secondary">
      <PageContainer className="grid gap-6 py-10 sm:grid-cols-3">
        {TRUST_POINTS.map((point) => {
          const Icon = point.icon;
          const content = (
            <>
              <Icon className="size-5 shrink-0 text-accent" aria-hidden="true" />
              <span className="text-body-sm font-bold text-text-primary">{point.label}</span>
            </>
          );
          return point.href ? (
            <Link key={point.label} href={point.href} className="flex items-center gap-3 no-underline">
              {content}
            </Link>
          ) : (
            <div key={point.label} className="flex items-center gap-3">
              {content}
            </div>
          );
        })}
      </PageContainer>
    </section>
  );
}
