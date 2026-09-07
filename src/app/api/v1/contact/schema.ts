import { z } from "zod";

/**
 * Separate from route.ts because Next.js Route Handlers only permit
 * exporting HTTP method functions and a small set of special names — an
 * arbitrary named export like this schema isn't allowed there. Keeping it
 * here also makes it directly unit-testable without spinning up a request.
 */
export const contactSchema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب").max(120),
  contact: z.string().trim().min(3, "رقم الهاتف أو البريد الإلكتروني مطلوب").max(200),
  message: z.string().trim().min(10, "الرسالة قصيرة جدًا").max(2000),
});
