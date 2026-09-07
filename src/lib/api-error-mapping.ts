import { randomUUID } from "node:crypto";

import { apiError, apiInternalError, type ApiError } from "@/lib/api-response";
import { IdempotencyConflictError, IdempotencyScopeMismatchError } from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import { CartItemUnavailableError } from "@/modules/cart";
import { InsufficientInventoryError } from "@/modules/catalog";
import { CheckoutValidationError, CouponRejectedError } from "@/modules/checkout";
import { OrderAuthorizationError, OrderNotFoundError } from "@/modules/orders";
import { OtpInvalidError, OtpRateLimitedError } from "@/modules/customers";
import { OnlinePaymentNotConfiguredError } from "@/modules/payments";
import type { NextResponse } from "next/server";

/**
 * The one place a caught domain error becomes an API response — every
 * route handler funnels here instead of repeating category/status/message
 * mapping inline (technical-architecture.md §22's one consistent shape).
 * Anything not recognized becomes a logged, referenced `internal` error —
 * never a leaked stack trace.
 */
export function mapDomainErrorToApiResponse(error: unknown): NextResponse<ApiError> {
  if (error instanceof CartItemUnavailableError) {
    const messages: Record<typeof error.reason, string> = {
      not_found: "المنتج غير موجود.",
      out_of_stock: "هذا المنتج غير متوفر حاليًا.",
      insufficient_stock: "الكمية المتوفرة أقل من المطلوبة.",
    };
    return apiError("business_rule", `cart_item_${error.reason}`, messages[error.reason]);
  }

  if (error instanceof InsufficientInventoryError) {
    return apiError("business_rule", "insufficient_inventory", "أحد المنتجات لم يعد متوفرًا بالكمية المطلوبة، برجاء تحديث السلة.");
  }

  if (error instanceof CouponRejectedError) {
    const messages: Record<typeof error.reason, string> = {
      not_found: "كود الخصم غير صحيح.",
      inactive: "كود الخصم غير مفعّل.",
      not_yet_active: "كود الخصم غير متاح بعد.",
      expired: "انتهت صلاحية هذا الكود.",
      usage_limit_reached: "تم استخدام هذا الكود بالكامل.",
      per_customer_limit_reached: "لقد استخدمت هذا الكود من قبل.",
      minimum_order_not_met: "الحد الأدنى للطلب غير مستوفى لهذا الكود.",
    };
    return apiError("business_rule", `coupon_${error.reason}`, messages[error.reason]);
  }

  if (error instanceof CheckoutValidationError) {
    const messages: Record<typeof error.reason, string> = {
      address_missing: "برجاء إدخال عنوان التوصيل أولًا.",
      shipping_missing: "برجاء اختيار طريقة الشحن أولًا.",
      cart_empty: "السلة فارغة.",
      unserviceable_address: "التوصيل غير متاح لهذا العنوان حاليًا.",
    };
    return apiError("business_rule", error.reason, messages[error.reason]);
  }

  if (error instanceof OrderNotFoundError || error instanceof OrderAuthorizationError) {
    // Never reveal that an order exists but belongs to someone else — technical-architecture.md §22's authorization row.
    return apiError("not_found", "order_not_found", "لم يتم العثور على الطلب.");
  }

  if (error instanceof OtpRateLimitedError) {
    return apiError("business_rule", "otp_rate_limited", "عدد المحاولات كبير، برجاء المحاولة لاحقًا.");
  }

  if (error instanceof OtpInvalidError) {
    const messages: Record<typeof error.reason, string> = {
      not_found: "لم يتم إرسال رمز تحقق لهذا الرقم.",
      expired: "انتهت صلاحية الرمز، برجاء طلب رمز جديد.",
      already_used: "تم استخدام هذا الرمز بالفعل.",
      too_many_attempts: "عدد المحاولات كبير، برجاء طلب رمز جديد.",
      wrong_code: "الرمز المُدخل غير صحيح.",
    };
    return apiError("authentication", `otp_${error.reason}`, messages[error.reason]);
  }

  if (error instanceof OnlinePaymentNotConfiguredError) {
    return apiError("payment", "online_payment_unavailable", "الدفع الإلكتروني غير متاح حاليًا — برجاء اختيار الدفع عند الاستلام.");
  }

  if (error instanceof IdempotencyConflictError || error instanceof IdempotencyScopeMismatchError) {
    return apiError("conflict", "request_in_progress", "هذا الطلب قيد المعالجة بالفعل.");
  }

  const reference = randomUUID();
  logger.error({ err: error, reference }, "unhandled error in API route");
  return apiInternalError(reference);
}
