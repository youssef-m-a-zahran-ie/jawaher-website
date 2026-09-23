export { catalogService } from "@/modules/catalog/service";
export type { CategoryView, ProductView, VariantView } from "@/modules/catalog/service";
export {
  deriveAvailability,
  getAvailableQuantity,
  getAvailableQuantitiesForVariants,
  reserveInventoryForItems,
  resolveErpReservationGateQuantity,
  releaseReservationsForCheckoutSession,
  consumeReservationsForCheckoutSession,
  expireStaleReservations,
  fetchErpAvailability,
  InsufficientInventoryError,
  LOW_STOCK_THRESHOLD,
  RESERVATION_TTL_MS,
} from "@/modules/catalog/inventory";
export type { AvailabilityState, ErpVariantForAvailability } from "@/modules/catalog/inventory";
