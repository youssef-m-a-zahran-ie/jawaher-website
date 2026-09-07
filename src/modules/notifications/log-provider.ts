import { logger } from "@/lib/logger";
import { maskPhone } from "@/domain/phone";
import type { NotificationProvider, NotificationType } from "@/modules/notifications/provider";

/**
 * The only NotificationProvider implementation this phase — no real SMS/
 * email/WhatsApp provider is integrated (this phase's explicit brief).
 * Logs the notification via the structured logger (never the raw phone
 * number — masked, per technical-architecture.md §21/§27) so it's
 * genuinely observable in development rather than silently discarded.
 *
 * The OTP code itself is deliberately NEVER passed to the logger, in any
 * environment — technical-architecture.md §21 lists it as a "must never
 * appear in logs, under any circumstance" field, with no dev-mode
 * exception carved out. The dev-testability problem this creates (how do
 * you complete the OTP flow with no real SMS provider?) is solved instead
 * in src/modules/customers/service.ts, which returns the code directly to
 * the API layer outside production — a response body is not a log.
 */
export class LogNotificationProvider implements NotificationProvider {
  async notify(type: NotificationType, recipientPhoneE164: string): Promise<void> {
    const maskedRecipient = maskPhone(recipientPhoneE164);
    logger.info({ type, recipient: maskedRecipient }, "notification sent (log-only provider, no real channel)");
  }
}
