import { randomUUID } from "node:crypto";

import type { PaymentAdapterResult, PaymentProvider } from "@/modules/payments/provider";

/**
 * COD is a real, complete adapter — not a "no real payment provider"
 * special case (technical-architecture.md §5's explicit guidance). It
 * immediately returns AWAITING_COD_COLLECTION rather than a generic
 * "pending", so refund/reconciliation logic never has to special-case COD.
 * `capture()` is the seam a future delivery-confirmation event would call
 * — nothing invokes it yet (commerce-completeness-audit.md §15).
 */
export class CodPaymentAdapter implements PaymentProvider {
  readonly name = "cod";

  async createPayment(): Promise<PaymentAdapterResult> {
    return { status: "AWAITING_COD_COLLECTION", providerReference: `cod-${randomUUID()}` };
  }

  async capture(providerReference: string): Promise<PaymentAdapterResult> {
    return { status: "CAPTURED", providerReference };
  }

  async confirm(providerReference: string): Promise<PaymentAdapterResult> {
    return { status: "AWAITING_COD_COLLECTION", providerReference };
  }

  async fail(providerReference: string, failureReason: string): Promise<PaymentAdapterResult> {
    return { status: "FAILED", providerReference, failureReason };
  }

  async refund(providerReference: string): Promise<PaymentAdapterResult> {
    // COD has no provider ledger to reverse — a refund is an operational
    // (cash) process, tracked at the Payment-record level only.
    return { status: "CAPTURED", providerReference };
  }

  async queryStatus(providerReference: string): Promise<PaymentAdapterResult> {
    return { status: "AWAITING_COD_COLLECTION", providerReference };
  }
}
