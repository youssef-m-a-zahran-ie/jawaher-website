import { Search, UserRound } from "lucide-react";

import { cn } from "@/lib/cn";
import { JawaherPalmIcon } from "@/ui/brand/jawaher-mark";
import { PageContainer } from "@/ui/primitives/page-container";
import { Link } from "@/ui/primitives/link";
import { HeaderActions } from "@/ui/site/header-actions";
import { NAV_ITEMS } from "@/ui/site/nav-items";

/** Matches IconButton's ghost/md visual language on an <a> — IconButton itself renders a <button>, which can't nest inside this Link's <a> (ProductCard's comment explains the same constraint). */
const iconLinkClass = cn(
  "inline-flex size-11 items-center justify-center rounded-md text-text-primary no-underline",
  "transition-colors duration-150 ease-out hover:bg-surface-secondary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
);

const desktopNavLinkClass =
  "text-body-sm font-bold text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary";

/**
 * The real site shell header — desktop nav is plain server-rendered links
 * (docs/ux/ux-specification.md §3's hover-dropdown is deferred, see
 * NAV_ITEMS' comment); cart/mobile-nav state lives in the HeaderActions
 * client island only. Sticky, per §3 — the "compresses past ~80px" detail
 * is optional ("may compress") and left for a later polish pass.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-surface">
      <PageContainer className="flex h-16 items-center justify-between gap-4 sm:h-20">
        <Link href="/" variant="text" className="flex shrink-0 items-center gap-2 text-h4 font-extrabold text-text-primary no-underline">
          <JawaherPalmIcon className="h-8 w-8 text-accent" />
          <span>جواهر الخير</span>
        </Link>

        <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-6 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} variant="text" className={desktopNavLinkClass}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <Link href="/search" aria-label="بحث" className={iconLinkClass}>
            <Search className="size-5" aria-hidden="true" />
          </Link>
          <Link href="/account" aria-label="الحساب" className={cn(iconLinkClass, "hidden sm:inline-flex")}>
            <UserRound className="size-5" aria-hidden="true" />
          </Link>
          <HeaderActions navItems={NAV_ITEMS} />
        </div>
      </PageContainer>
    </header>
  );
}
