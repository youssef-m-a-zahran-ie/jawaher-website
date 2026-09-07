import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

import { Link } from "@/ui/primitives/link";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type BreadcrumbProps = {
  items: BreadcrumbItem[];
};

/**
 * The separator chevron is directionally meaningful (it shows hierarchy
 * progression), so — unlike a brand mark, which never flips
 * (design-system.md §1) — it mirrors for RTL via rtl:rotate-180 rather
 * than a fixed LTR-only glyph.
 */
export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="مسار التنقل">
      <ol className="flex flex-wrap items-center gap-1.5 text-body-sm text-text-secondary">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={item.label}>
              <li className="flex items-center gap-1.5">
                {isLast || !item.href ? (
                  <span aria-current={isLast ? "page" : undefined} className="font-bold text-text-primary">
                    {item.label}
                  </span>
                ) : (
                  <Link href={item.href} className="hover:text-text-primary">
                    {item.label}
                  </Link>
                )}
              </li>
              {!isLast && (
                <ChevronRight className="size-3.5 shrink-0 rtl:rotate-180" aria-hidden="true" />
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
