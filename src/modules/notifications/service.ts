import { LogNotificationProvider } from "@/modules/notifications/log-provider";
import type { NotificationProvider, NotificationType } from "@/modules/notifications/provider";

const provider: NotificationProvider = new LogNotificationProvider();

/** Public interface — module-boundaries.md's Notifications row: `notify(type, recipient, payload)`. */
export const notificationsService = {
  notify(type: NotificationType, recipientPhoneE164: string, payload: Record<string, unknown> = {}) {
    return provider.notify(type, recipientPhoneE164, payload);
  },
};
