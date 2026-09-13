"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Money } from "@/domain/money";
import { track } from "@/lib/analytics";
import { formatPrice } from "@/lib/format-price";
import { Badge, type BadgeVariant } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import { Card } from "@/ui/primitives/card";
import { ErrorState } from "@/ui/primitives/error-state";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Modal } from "@/ui/primitives/modal";

type ApiErrorBody = { code: string; category: string; message_ar: string };

type OrderItemJson = { productNameSnapshot: string; variantLabelSnapshot: string; quantity: number; lineTotalAmountMinor: number };

type TrackedOrderJson = {
  orderNumber: string;
  customerFacingStatus: string;
  totalAmountMinor: number;
  currency: "EGP";
  shippingRecipientName: string;
  shippingGovernorate: string;
  shippingCity: string;
  shippingStreet: string;
  shippingMethodLabel: string;
  shippingEstimateLabel: string | null;
  createdAt: string;
  items: OrderItemJson[];
};

const STATUS_LABEL: Record<string, { label: string; variant: BadgeVariant }> = {
  confirmed: { label: "تم تأكيد الطلب", variant: "accent" },
  being_prepared: { label: "قيد التجهيز", variant: "accent" },
  out_for_delivery: { label: "في الطريق إليك", variant: "warning" },
  delivered: { label: "تم التوصيل", variant: "success" },
  returned: { label: "مرتجع", variant: "neutral" },
  cancelled: { label: "ملغي", variant: "danger" },
  refund_in_progress: { label: "جارٍ استرداد المبلغ", variant: "warning" },
  refunded: { label: "تم استرداد المبلغ", variant: "neutral" },
};

/**
 * Cancellation is only offered before the order has entered a
 * hard-to-reverse fulfillment stage — matching `ErpOrderRejectedError`'s
 * own real-world rejection cases (payment already allocated, already out
 * for delivery). The server is the real authority either way: ERP can
 * still reject a cancellation this button allows attempting.
 */
const CANCELLABLE_STATUSES = new Set(["confirmed", "being_prepared"]);

/**
 * Phase 9.7 — `GET /api/v1/orders/track` already existed (rate-limited,
 * anti-enumeration: order number + phone required together) but had zero
 * frontend consumer. This is that consumer. Cancellation
 * (`POST /api/v1/orders/track/cancel`) is new this phase too —
 * `ordersService.cancelOrder` existed with no API route calling it at all;
 * see that route's own comment for why this uses the phone-verified path
 * instead.
 */
export function TrackLookup() {
  const searchParams = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(searchParams.get("orderNumber") ?? "");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<TrackedOrderJson | null>(null);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function runLookup(orderNumberValue: string, phoneValue: string) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ orderNumber: orderNumberValue, phone: phoneValue });
      const res = await fetch(`/api/v1/orders/track?${params.toString()}`);
      const body = (await res.json()) as { data: { order: TrackedOrderJson } | null; error: ApiErrorBody | null };
      if (!res.ok || !body.data) {
        setError(body.error?.message_ar ?? "تعذّر العثور على الطلب.");
        setOrder(null);
        return;
      }
      setOrder(body.data.order);
    } catch {
      setError("تعذّر البحث — تحقق من الاتصال.");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await runLookup(orderNumber.trim(), phone.trim());
  }

  async function handleConfirmCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch("/api/v1/orders/track/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: orderNumber.trim(), phone: phone.trim() }),
      });
      const body = (await res.json()) as { data: unknown; error: ApiErrorBody | null };
      if (!res.ok || body.error) {
        setCancelError(body.error?.message_ar ?? "تعذّر إلغاء الطلب.");
        return;
      }
      setCancelModalOpen(false);
      track("order_cancelled", { order_number: orderNumber.trim() });
      await runLookup(orderNumber.trim(), phone.trim());
    } catch {
      setCancelError("تعذّر إلغاء الطلب — تحقق من الاتصال.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card padding="lg">
        <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="orderNumber" required>
                رقم الطلب
              </Label>
              <Input
                id="orderNumber"
                required
                placeholder="JAK-000123"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone" required>
                رقم الهاتف المستخدم في الطلب
              </Label>
              <Input
                id="phone"
                required
                placeholder="01001234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" loading={loading} disabled={loading}>
            بحث
          </Button>
        </form>
      </Card>

      {error && <ErrorState title="لم يتم العثور على الطلب" description={error} />}

      {order && (
        <Card padding="lg">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-h4 font-bold text-text-primary">طلب {order.orderNumber}</h2>
            {STATUS_LABEL[order.customerFacingStatus] && (
              <Badge variant={STATUS_LABEL[order.customerFacingStatus].variant}>
                {STATUS_LABEL[order.customerFacingStatus].label}
              </Badge>
            )}
          </div>

          <ul className="flex flex-col gap-2 border-b border-border pb-4">
            {order.items.map((item, i) => (
              <li key={i} className="flex justify-between text-body-sm">
                <span className="text-text-secondary">
                  {item.productNameSnapshot} ({item.variantLabelSnapshot}) × {item.quantity}
                </span>
                <span className="text-text-primary">{formatPrice(Money.fromMinor(item.lineTotalAmountMinor, order.currency))}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1 py-4 text-body-sm text-text-secondary">
            <p>
              التوصيل إلى: {order.shippingRecipientName} — {order.shippingStreet}، {order.shippingCity}، {order.shippingGovernorate}
            </p>
            <p>
              {order.shippingMethodLabel}
              {order.shippingEstimateLabel ? ` — ${order.shippingEstimateLabel}` : ""}
            </p>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4 text-body font-bold text-text-primary">
            <span>الإجمالي</span>
            <span>{formatPrice(Money.fromMinor(order.totalAmountMinor, order.currency))}</span>
          </div>

          {CANCELLABLE_STATUSES.has(order.customerFacingStatus) && (
            <div className="mt-4 border-t border-border pt-4">
              <Button variant="danger" onClick={() => setCancelModalOpen(true)}>
                إلغاء الطلب
              </Button>
            </div>
          )}
        </Card>
      )}

      <Modal open={cancelModalOpen} onClose={() => setCancelModalOpen(false)} title="إلغاء الطلب">
        <div className="flex flex-col gap-4">
          <p className="text-body text-text-secondary">
            هل أنت متأكد من إلغاء طلب {order?.orderNumber}؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          {cancelError && (
            <p role="alert" className="text-body-sm text-danger">
              {cancelError}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="danger" loading={cancelling} disabled={cancelling} onClick={() => void handleConfirmCancel()}>
              تأكيد الإلغاء
            </Button>
            <Button variant="secondary" disabled={cancelling} onClick={() => setCancelModalOpen(false)}>
              تراجع
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
