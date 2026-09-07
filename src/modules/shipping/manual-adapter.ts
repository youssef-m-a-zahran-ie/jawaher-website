import { randomUUID } from "node:crypto";

import { shippingRepository } from "@/modules/shipping/repository";
import type { ShippingProvider } from "@/modules/shipping/provider";

/**
 * "MVP may use a static/manual shipping implementation" (this phase's
 * brief) — a real, complete adapter backed by the ShippingZone lookup
 * table (technical-architecture.md §6: "zone identifier → fee, estimate,
 * COD-supported flag"), not a stub. No real courier is integrated. Exact
 * fees are seed-script placeholders — see
 * docs/planning/commerce-completeness-audit.md §9.
 */
export class ManualShippingAdapter implements ShippingProvider {
  async checkServiceability(governorate: string) {
    const zone = await shippingRepository.findActiveZoneByGovernorate(governorate);
    return { serviceable: zone != null };
  }

  async getRates(governorate: string) {
    const zone = await shippingRepository.findActiveZoneByGovernorate(governorate);
    if (!zone) return null;
    return {
      feeAmountMinor: zone.feeAmountMinor,
      currency: "EGP" as const,
      estimateLabel: zone.estimateLabel,
      codSupported: zone.codSupported,
    };
  }

  async createShipment(input: { orderId: string; governorate: string; feeAmountMinor: number; estimateLabel: string }) {
    await shippingRepository.createShipment({
      orderId: input.orderId,
      zoneIdentifier: input.governorate,
      methodLabel: "توصيل قياسي",
      feeAmountMinor: input.feeAmountMinor,
      estimateLabel: input.estimateLabel,
    });
    // The manual adapter creates a local record only — no external courier
    // API exists to hand a real reference to.
    return { shipmentReference: `manual-${randomUUID()}` };
  }

  async getTracking() {
    // No external tracking source exists for the manual adapter.
    return null;
  }
}
