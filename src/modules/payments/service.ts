import type { Prisma, PrismaClient } from "@prisma/client";

import { CodPaymentAdapter } from "@/modules/payments/cod-adapter";
import { paymentsRepository } from "@/modules/payments/repository";
import type { PaymentProvider } from "@/modules/payments/provider";

type Db = PrismaClient | Prisma.TransactionClient;

export class OnlinePaymentNotConfiguredError extends Error {
  constructor() {
    super("No online payment provider is configured — the gateway is an open business decision (commerce-completeness-audit.md §10)");
    this.name = "OnlinePaymentNotConfiguredError";
  }
}

function getAdapterForMethod(method: "COD" | "ONLINE"): PaymentProvider {
  if (method === "COD") return new CodPaymentAdapter();
  throw new OnlinePaymentNotConfiguredError();
}

/** Public interface — module-boundaries.md's Payments row (createPayment/confirmPayment/refund/getPaymentStatus). */
export const paymentsService = {
  /**
   * Must be called with the same transaction client the enclosing Order
   * creation uses (technical-architecture.md §9's "one order, one payment
   * attempt in sequence" rule + this phase's idempotency requirement).
   * A retried call with the same idempotencyKey returns the existing
   * payment record rather than creating a second one
   * (technical-architecture.md §5).
   */
  async createPayment(
    tx: Db,
    params: { orderId: string; method: "COD" | "ONLINE"; amountMinor: number; currency: string; idempotencyKey: string },
  ) {
    const existing = await paymentsRepository.findByIdempotencyKey(params.idempotencyKey, tx);
    if (existing) return existing;

    const adapter = getAdapterForMethod(params.method);
    const result = await adapter.createPayment({
      orderId: params.orderId,
      amountMinor: params.amountMinor,
      currency: params.currency,
      idempotencyKey: params.idempotencyKey,
    });

    return paymentsRepository.createPayment(
      {
        order: { connect: { id: params.orderId } },
        method: params.method,
        status: result.status,
        amountMinor: params.amountMinor,
        currency: params.currency,
        providerName: adapter.name,
        providerReference: result.providerReference,
        idempotencyKey: params.idempotencyKey,
      },
      tx,
    );
  },

  async getLatestForOrder(orderId: string) {
    return paymentsRepository.findLatestForOrder(orderId);
  },

  /** Not exercised by any real flow this phase (no delivery-confirmation event source exists yet) — see commerce-completeness-audit.md §15. */
  async captureCod(paymentId: string, providerReference: string) {
    const adapter = new CodPaymentAdapter();
    const result = await adapter.capture(providerReference);
    return paymentsRepository.updateStatus(paymentId, { status: result.status, capturedAt: new Date() });
  },
};
