"use client";

import { Menu, ShoppingCart } from "lucide-react";
import { useState } from "react";

import { CartDrawerContent } from "@/ui/commerce/cart-drawer-content";
import { Accordion } from "@/ui/primitives/accordion";
import { Drawer } from "@/ui/primitives/drawer";
import { IconButton } from "@/ui/primitives/icon-button";
import { Link } from "@/ui/primitives/link";
import type { NavItem } from "@/ui/site/nav-items";

export type HeaderActionsProps = {
  navItems: NavItem[];
};

/**
 * The header's two genuinely stateful pieces — mobile-nav drawer and cart
 * drawer — kept in one small client island so Header itself can stay a
 * server component (docs/architecture/technical-decisions.md's Phase 2
 * Server/Client boundary convention: search/account are plain links with
 * no state, so they render directly in Header instead of here). Both
 * drawers reuse the Drawer primitive that already slides from the
 * reading-start edge under RTL.
 *
 * Cart drawer now shows the real, server-side cart (Phase 9.7) — see
 * `cart-drawer-content.tsx` for the data-fetching/mutation logic. This
 * component itself stays a thin shell around it (open/close state only).
 */
export function HeaderActions({ navItems }: HeaderActionsProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const shopLink = navItems.find((item) => item.href === "/shop");
  const categoryLinks = navItems.filter((item) => item.href.startsWith("/shop/"));
  const otherLinks = navItems.filter((item) => item !== shopLink && !categoryLinks.includes(item));

  return (
    <div className="flex items-center gap-1">
      <IconButton
        icon={<ShoppingCart className="size-5" />}
        aria-label="السلة"
        onClick={() => setCartOpen(true)}
      />
      <div className="lg:hidden">
        <IconButton
          icon={<Menu className="size-5" />}
          aria-label="فتح قائمة التنقل"
          onClick={() => setNavOpen(true)}
        />
      </div>

      <Drawer open={navOpen} onClose={() => setNavOpen(false)} title="القائمة">
        <nav aria-label="التنقل الرئيسي" className="flex flex-col">
          {shopLink && (
            <Link
              href={shopLink.href}
              onClick={() => setNavOpen(false)}
              className="py-3 text-body font-bold text-text-primary no-underline"
            >
              {shopLink.label}
            </Link>
          )}
          <Accordion
            items={[
              {
                id: "categories",
                title: "الفئات",
                content: (
                  <div className="flex flex-col gap-3">
                    {categoryLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setNavOpen(false)}
                        className="text-body text-text-primary no-underline"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ),
              },
            ]}
          />
          {otherLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setNavOpen(false)}
              className="py-3 text-body font-bold text-text-primary no-underline"
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 border-t border-border pt-3">
            <Link
              href="/account"
              onClick={() => setNavOpen(false)}
              className="inline-block py-3 text-body text-text-secondary no-underline"
            >
              الحساب وتسجيل الدخول
            </Link>
          </div>
        </nav>
      </Drawer>

      <Drawer open={cartOpen} onClose={() => setCartOpen(false)} title="السلة">
        <CartDrawerContent open={cartOpen} onClose={() => setCartOpen(false)} />
      </Drawer>
    </div>
  );
}
