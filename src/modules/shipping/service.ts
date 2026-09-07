import { ManualShippingAdapter } from "@/modules/shipping/manual-adapter";
import type { ShippingProvider } from "@/modules/shipping/provider";

const provider: ShippingProvider = new ManualShippingAdapter();

/** Public interface — module-boundaries.md's Shipping row (checkServiceability/getRates/createShipment/getTracking). */
export const shippingService = {
  checkServiceability: (governorate: string) => provider.checkServiceability(governorate),
  getRates: (governorate: string) => provider.getRates(governorate),
  createShipment: (input: Parameters<ShippingProvider["createShipment"]>[0]) => provider.createShipment(input),
  getTracking: (shipmentReference: string) => provider.getTracking(shipmentReference),
};
