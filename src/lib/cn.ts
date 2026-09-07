import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines conditional class names and resolves conflicting Tailwind
 * utilities (e.g. a caller's `className="p-6"` correctly overriding a
 * component's own `p-4`) — every primitive in src/ui/primitives and
 * src/ui/commerce uses this instead of manual string concatenation.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
