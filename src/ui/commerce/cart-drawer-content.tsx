"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Money } from "@/domain/money";
import { track } from "@/lib/analytics";
import { formatPrice } from "@/lib/format-price";
import { Button } from "@/ui/primitives/button";
import { EmptyState } from "@/ui/primitives/empty-state";
import { ErrorState } from "@/ui/primitives/error-state";
import { IconButton } from "@/ui/primitives/icon-button";
import { Link } from "@/ui/primitives/link";
import { Skeleton } from "@/ui/primitives/skeleton";
import { useToast } from "@/ui/primitives/toast";
import type { CartLineJson, CartViewJson } from "@/ui/commerce/cart-types";

/**
 * Phase 9.7 — the real cart, replacing the Phase 3 "always empty" shell
 * (`header-actions.tsx`'s own comment: "a future Cart module fills with
 * real state, without pretending an item is actually in it" — this is
 * that module). Calls the existing, unmodified `/api/v1/cart*` routes —
 * no new backend was needed, only a client to drive it.
 *
 * Money crosses the server->client boundary here as a plain
 * `{amountMinor, currency}` JSON object (never a live class instance —
 * the same reason PriceDisplay/quick-add-button.tsx already document),
 * reconstructed via `Money.fromMinor()` before formatting.
 */

const AVAILABILITY_NOTE: Record<CartLineJson["availability"], string | null> = {
  in_stock: null,
  low_stock: "الكمية المتوفرة محدودة",
  out_of_stock: "غير متوفر حاليًا — سيُستثنى من الطلب",
  unknown: "يتعذر تأكيد التوفر الآن — سيتم التحقق عند إتمام الطلب",
};

export function CartDrawerContent({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { show } = useToast();
  const [cart, setCart] = useState<CartViewJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mutatingVariantId, setMutatingVariantId] = useState<string | null>(null);

  // Reset to a fresh "loading" view whenever the drawer transitions to open —
  // done during render (React's documented pattern for reacting to a prop
  // change without an effect) so the effect below never needs to call
  // setState synchronously itself.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setLoading(true);
      setError(false);
    }
  }

  async function loadCart() {
    try {
      const res = await fetch("/api/v1/cart");
      if (!res.ok) throw new Error("failed");
      const body = (await res.json()) as { data: { cart: CartViewJson } | null };
      if (!body.data) throw new Error("failed");
      setCart(body.data.cart);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/v1/cart")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json() as Promise<{ data: { cart: CartViewJson } | null }>;
      })
      .then((body) => {
        if (cancelled) return;
        if (!body.data) throw new Error("failed");
        setCart(body.data.cart);
        setError(false);
        track("view_cart", { value: body.data.cart.subtotal.amountMinor / 100, currency: body.data.cart.subtotal.currency });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function updateQuantity(variantId: string, quantity: number) {
    setMutatingVariantId(variantId);
    try {
      const res = await fetch(`/api/v1/cart/items/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      if (!res.ok) {
        show({ title: "تعذّر تحديث الكمية — حاول مرة أخرى", variant: "danger" });
        return;
      }
      await loadCart();
    } catch {
      show({ title: "تعذّر تحديث الكمية — تحقق من الاتصال", variant: "danger" });
    } finally {
      setMutatingVariantId(null);
    }
  }

  async function removeItem(variantId: string) {
    setMutatingVariantId(variantId);
    try {
      const res = await fetch(`/api/v1/cart/items/${variantId}`, { method: "DELETE" });
      if (!res.ok) {
        show({ title: "تعذّر حذف المنتج — حاول مرة أخرى", variant: "danger" });
        return;
      }
      await loadCart();
    } catch {
      show({ title: "تعذّر حذف المنتج — تحقق من الاتصال", variant: "danger" });
    } finally {
      setMutatingVariantId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="تعذّر تحميل السلة"
        description="حدث خطأ أثناء تحميل محتويات السلة."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setLoading(true);
              setError(false);
              void loadCart();
            }}
          >
            إعادة المحاولة
          </Button>
        }
      />
    );
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <EmptyState
        title="السلة فارغة"
        description="أضف منتجًا لتبدأ."
        action={
          <Link href="/shop" variant="secondary" onClick={onClose}>
            متابعة التسوق
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <ul className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {cart.lines.map((line) => {
          const note = AVAILABILITY_NOTE[line.availability];
          const isMutating = mutatingVariantId === line.variantId;
          return (
            <li key={line.variantId} className="flex flex-col gap-2 border-b border-border pb-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-body font-bold text-text-primary">{line.productName}</p>
                  <p className="text-body-sm text-text-secondary">{line.variantLabel}</p>
                </div>
                <IconButton
                  icon={<Trash2 className="size-4" />}
                  aria-label={`حذف ${line.productName} من السلة`}
                  size="sm"
                  disabled={isMutating}
                  onClick={() => void removeItem(line.variantId)}
                />
              </div>

              {note && <p className="text-caption text-warning">{note}</p>}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IconButton
                    icon={<Minus className="size-3.5" />}
                    aria-label="تقليل الكمية"
                    size="sm"
                    disabled={isMutating}
                    onClick={() => void updateQuantity(line.variantId, line.quantity - 1)}
                  />
                  <span className="w-6 text-center text-body font-bold tabular-nums" aria-live="polite">
                    {line.quantity}
                  </span>
                  <IconButton
                    icon={<Plus className="size-3.5" />}
                    aria-label="زيادة الكمية"
                    size="sm"
                    disabled={isMutating}
                    onClick={() => void updateQuantity(line.variantId, line.quantity + 1)}
                  />
                </div>
                <span className="text-body font-bold text-text-primary tabular-nums">
                  {formatPrice(Money.fromMinor(line.lineTotal.amountMinor, line.lineTotal.currency))}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex items-center justify-between text-body font-bold text-text-primary">
          <span>الإجمالي</span>
          <span className="tabular-nums">{formatPrice(Money.fromMinor(cart.subtotal.amountMinor, cart.subtotal.currency))}</span>
        </div>
        <Link href="/checkout" onClick={onClose}>
          <Button fullWidth>إتمام الشراء</Button>
        </Link>
      </div>
    </div>
  );
}
