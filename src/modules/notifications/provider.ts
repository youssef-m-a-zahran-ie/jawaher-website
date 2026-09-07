/**
 * technical-architecture.md §18: every module sends notifications through
 * this one interface — no module imports an SMS/email/WhatsApp SDK
 * directly. Mirrors the Payment/Shipping adapter pattern exactly.
 */
export type NotificationType =
  | "otp_code"
  | "order_confirmed"
  | "payment_confirmed"
  | "payment_failed"
  | "order_status_changed"
  | "order_cancelled";

export interface NotificationProvider {
  notify(type: NotificationType, recipientPhoneE164: string, payload: Record<string, unknown>): Promise<void>;
}
