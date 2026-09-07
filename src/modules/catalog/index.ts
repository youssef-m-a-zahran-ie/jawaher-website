export { catalogService } from "@/modules/catalog/service";
export type { ProductView, VariantView } from "@/modules/catalog/service";
export {
  deriveAvailability,
  getAvailableQuantity,
  reserveInventoryForItems,
  releaseReservationsForCheckoutSession,
  consumeReservationsForCheckoutSession,
  expireStaleReservations,
  InsufficientInventoryError,
  LOW_STOCK_THRESHOLD,
  RESERVATION_TTL_MS,
} from "@/modules/catalog/inventory";
export type { AvailabilityState } from "@/modules/catalog/inventory";
