"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Money } from "@/domain/money";
import { track } from "@/lib/analytics";
import { formatPrice } from "@/lib/format-price";
import type { CartViewJson } from "@/ui/commerce/cart-types";
import { EGYPT_GOVERNORATES } from "@/ui/commerce/governorates";
import { Button } from "@/ui/primitives/button";
import { Card } from "@/ui/primitives/card";
import { EmptyState } from "@/ui/primitives/empty-state";
import { ErrorState } from "@/ui/primitives/error-state";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Link } from "@/ui/primitives/link";
import { Radio } from "@/ui/primitives/radio";
import { Select } from "@/ui/primitives/select";
import { Skeleton } from "@/ui/primitives/skeleton";

type ApiErrorBody = { code: string; category: string; message_ar: string; fields?: Record<string, string> };
type ApiEnvelope<T> = { data: T | null; error: ApiErrorBody | null };

type RatesJson = { feeAmountMinor: number; currency: "EGP"; estimateLabel: string; codSupported: boolean };
type OrderSummaryJson = { orderId: string; orderNumber: string; totalAmountMinor: number; currency: "EGP"; paymentStatus: string };

type AddressForm = {
  recipientName: string;
  phoneE164: string;
  governorate: string;
  city: string;
  area: string;
  street: string;
  building: string;
  floor: string;
  apartment: string;
  landmark: string;
  notes: string;
};

const EMPTY_ADDRESS: AddressForm = {
  recipientName: "",
  phoneE164: "",
  governorate: "",
  city: "",
  area: "",
  street: "",
  building: "",
  floor: "",
  apartment: "",
  landmark: "",
  notes: "",
};

/**
 * Phase 9.7 — the checkout page never existed before this phase (only the
 * backend + 4 API routes did). A single progressively-disclosed flow
 * (address -> shipping -> coupon -> payment -> review) rather than a
 * multi-route wizard, so no new routing/step-persistence concept is
 * needed — every step calls an existing, unmodified checkout API route.
 * Payment method is COD-only: ONLINE is shown but disabled, since no
 * gateway is integrated (commerce-completeness-audit.md §10) — never
 * silently hidden, never falsely offered as working.
 */
export function CheckoutFlow() {
  const [phase, setPhase] = useState<"loading" | "empty" | "load_error" | "ready" | "confirmed">("loading");
  const [cart, setCart] = useState<CartViewJson | null>(null);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);

  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  const [addressSaved, setAddressSaved] = useState(false);
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const [rates, setRates] = useState<RatesJson | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);

  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmountMinor: number } | null>(null);
  const [couponApplying, setCouponApplying] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [confirmedOrder, setConfirmedOrder] = useState<OrderSummaryJson | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/cart")
      .then((res) => res.json() as Promise<ApiEnvelope<{ cart: CartViewJson }>>)
      .then((body) => {
        if (cancelled) return null;
        if (!body.data || body.data.cart.lines.length === 0) {
          setPhase("empty");
          return null;
        }
        setCart(body.data.cart);
        return { cart: body.data.cart };
      })
      .then((loaded) => {
        if (cancelled || !loaded) return;
        return fetch("/api/v1/checkout", { method: "POST" })
          .then((res) => res.json() as Promise<ApiEnvelope<{ checkoutSessionId: string }>>)
          .then((sessionBody) => {
            if (cancelled) return;
            if (!sessionBody.data) {
              setPhase("load_error");
              return;
            }
            setCheckoutSessionId(sessionBody.data.checkoutSessionId);
            setPhase("ready");
            track("begin_checkout", {
              value: loaded.cart.subtotal.amountMinor / 100,
              currency: loaded.cart.subtotal.currency,
            });
          });
      })
      .catch(() => {
        if (!cancelled) setPhase("load_error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAddressSubmit(event: FormEvent) {
    event.preventDefault();
    if (!checkoutSessionId) return;
    setAddressSaving(true);
    setAddressError(null);
    try {
      const res = await fetch("/api/v1/checkout/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId, ...address }),
      });
      const body = (await res.json()) as ApiEnvelope<{ checkoutSession: unknown }>;
      if (!res.ok || !body.data) {
        setAddressError(body.error?.message_ar ?? "تعذّر حفظ العنوان.");
        return;
      }
      setAddressSaved(true);
      await loadRates();
    } catch {
      setAddressError("تعذّر حفظ العنوان — تحقق من الاتصال.");
    } finally {
      setAddressSaving(false);
    }
  }

  async function loadRates() {
    if (!checkoutSessionId) return;
    setRatesLoading(true);
    setRatesError(null);
    try {
      const res = await fetch(`/api/v1/checkout/shipping-rates?checkoutSessionId=${checkoutSessionId}`);
      const body = (await res.json()) as ApiEnvelope<{ rates: RatesJson }>;
      if (!res.ok || !body.data) {
        setRatesError(body.error?.message_ar ?? "تعذّر جلب أسعار الشحن.");
        return;
      }
      setRates(body.data.rates);
      track("add_shipping_info", { value: body.data.rates.feeAmountMinor / 100, currency: body.data.rates.currency });
    } catch {
      setRatesError("تعذّر جلب أسعار الشحن — تحقق من الاتصال.");
    } finally {
      setRatesLoading(false);
    }
  }

  async function handleApplyCoupon() {
    if (!checkoutSessionId || !couponInput.trim()) return;
    setCouponApplying(true);
    setCouponError(null);
    try {
      const res = await fetch("/api/v1/checkout/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId, code: couponInput.trim() }),
      });
      const body = (await res.json()) as ApiEnvelope<{ discountAmountMinor: number }>;
      if (!res.ok || !body.data) {
        setCouponError(body.error?.message_ar ?? "تعذّر تطبيق الكود.");
        return;
      }
      setAppliedCoupon({ code: couponInput.trim(), discountAmountMinor: body.data.discountAmountMinor });
      setCouponError(null);
      track("coupon_applied", { value: body.data.discountAmountMinor / 100 });
    } catch {
      setCouponError("تعذّر تطبيق الكود — تحقق من الاتصال.");
    } finally {
      setCouponApplying(false);
    }
  }

  async function handlePlaceOrder() {
    if (!checkoutSessionId) return;
    setPlacing(true);
    setPlaceError(null);
    try {
      const res = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ checkoutSessionId, method: "COD" }),
      });
      const body = (await res.json()) as ApiEnvelope<{ order: OrderSummaryJson }>;
      if (!res.ok || !body.data) {
        setPlaceError(body.error?.message_ar ?? "تعذّر إتمام الطلب.");
        track("checkout_failed", { reason: body.error?.code ?? "unknown" });
        return;
      }
      setConfirmedOrder(body.data.order);
      setPhase("confirmed");
      track("purchase", {
        transaction_id: body.data.order.orderNumber,
        value: body.data.order.totalAmountMinor / 100,
        currency: body.data.order.currency,
      });
    } catch {
      setPlaceError("تعذّر إتمام الطلب — تحقق من الاتصال.");
      track("checkout_failed", { reason: "network_error" });
    } finally {
      setPlacing(false);
    }
  }

  if (phase === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <EmptyState
        title="السلة فارغة"
        description="أضف منتجًا إلى السلة قبل إتمام الشراء."
        action={
          <Link href="/shop" variant="secondary">
            متابعة التسوق
          </Link>
        }
      />
    );
  }

  if (phase === "load_error") {
    return (
      <ErrorState
        title="تعذّر بدء عملية الشراء"
        description="حدث خطأ أثناء تحميل السلة. برجاء المحاولة مرة أخرى."
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            إعادة المحاولة
          </Button>
        }
      />
    );
  }

  if (phase === "confirmed" && confirmedOrder) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-h3 font-extrabold text-text-primary">تم تأكيد طلبك</p>
        <p className="text-body text-text-secondary">
          رقم الطلب: <span className="font-bold text-text-primary">{confirmedOrder.orderNumber}</span>
        </p>
        <p className="text-body-sm text-text-secondary">الدفع عند الاستلام — سيصلك الطلب حسب المدة المتوقعة.</p>
        <p className="text-h4 font-bold text-text-primary">
          {formatPrice(Money.fromMinor(confirmedOrder.totalAmountMinor, confirmedOrder.currency))}
        </p>
        <div className="mt-4 flex gap-3">
          <Link href={`/track?orderNumber=${confirmedOrder.orderNumber}`} variant="secondary">
            تتبع الطلب
          </Link>
          <Link href="/shop" variant="primary">
            متابعة التسوق
          </Link>
        </div>
      </div>
    );
  }

  if (!cart) return null;

  const subtotal = Money.fromMinor(cart.subtotal.amountMinor, cart.subtotal.currency);
  const shippingFee = rates ? Money.fromMinor(rates.feeAmountMinor, rates.currency) : null;
  const discount = appliedCoupon ? Money.fromMinor(appliedCoupon.discountAmountMinor, cart.subtotal.currency) : null;
  const canPlaceOrder = addressSaved && !!rates && !ratesLoading;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-6">
        <Card padding="lg">
          <h2 className="mb-4 text-h4 font-bold text-text-primary">عنوان التوصيل</h2>
          <form className="flex flex-col gap-4" onSubmit={(e) => void handleAddressSubmit(e)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recipientName" required>
                  اسم المستقبل
                </Label>
                <Input
                  id="recipientName"
                  required
                  value={address.recipientName}
                  onChange={(e) => setAddress({ ...address, recipientName: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phoneE164" required>
                  رقم الهاتف
                </Label>
                <Input
                  id="phoneE164"
                  required
                  placeholder="01001234567"
                  value={address.phoneE164}
                  onChange={(e) => setAddress({ ...address, phoneE164: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="governorate" required>
                  المحافظة
                </Label>
                <Select
                  id="governorate"
                  required
                  value={address.governorate}
                  onChange={(e) => setAddress({ ...address, governorate: e.target.value })}
                >
                  <option value="" disabled>
                    اختر المحافظة
                  </option>
                  {EGYPT_GOVERNORATES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="city" required>
                  المدينة
                </Label>
                <Input
                  id="city"
                  required
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="street" required>
                الشارع
              </Label>
              <Input
                id="street"
                required
                value={address.street}
                onChange={(e) => setAddress({ ...address, street: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="building">المبنى</Label>
                <Input
                  id="building"
                  value={address.building}
                  onChange={(e) => setAddress({ ...address, building: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="floor">الطابق</Label>
                <Input
                  id="floor"
                  value={address.floor}
                  onChange={(e) => setAddress({ ...address, floor: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="apartment">الشقة</Label>
                <Input
                  id="apartment"
                  value={address.apartment}
                  onChange={(e) => setAddress({ ...address, apartment: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="landmark">علامة مميزة (اختياري)</Label>
              <Input
                id="landmark"
                value={address.landmark}
                onChange={(e) => setAddress({ ...address, landmark: e.target.value })}
              />
            </div>

            {addressError && (
              <p role="alert" className="text-body-sm text-danger">
                {addressError}
              </p>
            )}

            <Button type="submit" loading={addressSaving} disabled={addressSaving}>
              {addressSaved ? "تحديث العنوان" : "حفظ العنوان"}
            </Button>
          </form>
        </Card>

        {addressSaved && (
          <Card padding="lg">
            <h2 className="mb-4 text-h4 font-bold text-text-primary">الشحن</h2>
            {ratesLoading && <Skeleton className="h-10 w-full" />}
            {ratesError && (
              <div className="flex flex-col gap-3">
                <p role="alert" className="text-body-sm text-danger">
                  {ratesError}
                </p>
                <Button variant="secondary" onClick={() => void loadRates()}>
                  إعادة المحاولة
                </Button>
              </div>
            )}
            {rates && !ratesLoading && (
              <div className="flex items-center justify-between text-body">
                <span className="text-text-secondary">توصيل قياسي — {rates.estimateLabel}</span>
                <span className="font-bold text-text-primary">{formatPrice(Money.fromMinor(rates.feeAmountMinor, rates.currency))}</span>
              </div>
            )}
          </Card>
        )}

        {addressSaved && rates && (
          <Card padding="lg">
            <h2 className="mb-4 text-h4 font-bold text-text-primary">كود الخصم</h2>
            {appliedCoupon ? (
              <p className="text-body-sm text-success">تم تطبيق الكود &quot;{appliedCoupon.code}&quot;.</p>
            ) : (
              <div className="flex gap-3">
                <Input
                  aria-label="كود الخصم"
                  placeholder="أدخل كود الخصم"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                />
                <Button variant="secondary" loading={couponApplying} onClick={() => void handleApplyCoupon()}>
                  تطبيق
                </Button>
              </div>
            )}
            {couponError && (
              <p role="alert" className="mt-2 text-body-sm text-danger">
                {couponError}
              </p>
            )}
          </Card>
        )}

        {addressSaved && rates && (
          <Card padding="lg">
            <h2 className="mb-4 text-h4 font-bold text-text-primary">طريقة الدفع</h2>
            <div className="flex flex-col gap-3">
              <Radio name="payment" checked readOnly label="الدفع عند الاستلام (COD)" />
              <Radio name="payment" disabled label="الدفع الإلكتروني — غير متاح حاليًا" />
            </div>
          </Card>
        )}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card padding="lg">
          <h2 className="mb-4 text-h4 font-bold text-text-primary">ملخص الطلب</h2>
          <ul className="flex flex-col gap-2 border-b border-border pb-4">
            {cart.lines.map((line) => (
              <li key={line.variantId} className="flex justify-between text-body-sm">
                <span className="text-text-secondary">
                  {line.productName} × {line.quantity}
                </span>
                <span className="text-text-primary">{formatPrice(Money.fromMinor(line.lineTotal.amountMinor, line.lineTotal.currency))}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 py-4 text-body-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">المجموع الفرعي</span>
              <span className="text-text-primary">{formatPrice(subtotal)}</span>
            </div>
            {discount && (
              <div className="flex justify-between">
                <span className="text-text-secondary">الخصم</span>
                <span className="text-success">-{formatPrice(discount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-text-secondary">الشحن</span>
              <span className="text-text-primary">{shippingFee ? formatPrice(shippingFee) : "—"}</span>
            </div>
          </div>
          <div className="flex justify-between border-t border-border pt-4 text-body font-bold text-text-primary">
            <span>الإجمالي التقديري</span>
            <span>
              {formatPrice(
                Money.fromMinor(
                  cart.subtotal.amountMinor - (appliedCoupon?.discountAmountMinor ?? 0) + (rates?.feeAmountMinor ?? 0),
                  cart.subtotal.currency,
                ),
              )}
            </span>
          </div>

          {placeError && (
            <p role="alert" className="mt-4 text-body-sm text-danger">
              {placeError}
            </p>
          )}

          <Button
            fullWidth
            className="mt-4"
            loading={placing}
            disabled={!canPlaceOrder || placing}
            onClick={() => void handlePlaceOrder()}
          >
            تأكيد الطلب
          </Button>
          {!canPlaceOrder && <p className="mt-2 text-caption text-text-tertiary">أكمل العنوان والشحن أولًا.</p>}
        </Card>
      </div>
    </div>
  );
}
