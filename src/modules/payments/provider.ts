/**
 * technical-architecture.md §5 / ADR-009 — Checkout calls the Payments
 * service, which calls this interface, implemented by one adapter per
 * gateway (plus COD, a genuinely first-class adapter, not a special
 * case). No gateway is named here.
 */
export type PaymentAdapterResult = {
  status: "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "AWAITING_COD_COLLECTION";
  providerReference?: string;
  failureReason?: string;
};

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: { orderId: string; amountMinor: number; currency: string; idempotencyKey: string }): Promise<PaymentAdapterResult>;
  capture?(providerReference: string): Promise<PaymentAdapterResult>;
  confirm(providerReference: string, payload: unknown): Promise<PaymentAdapterResult>;
  fail(providerReference: string, reason: string): Promise<PaymentAdapterResult>;
  refund(providerReference: string, amountMinor: number): Promise<PaymentAdapterResult>;
  queryStatus(providerReference: string): Promise<PaymentAdapterResult>;
}
