import type { Money } from "@/domain/money";

/**
 * technical-architecture.md §6 — checkout calls this interface, never a
 * courier SDK directly (ADR-010). Selected by zone, not by a single
 * global provider, so multiple couriers can coexist without checkout
 * branching on courier identity.
 */
export interface ShippingProvider {
  checkServiceability(governorate: string): Promise<{ serviceable: boolean }>;
  getRates(governorate: string): Promise<{ feeAmountMinor: number; currency: Money["currency"]; estimateLabel: string; codSupported: boolean } | null>;
  createShipment(input: {
    orderId: string;
    governorate: string;
    feeAmountMinor: number;
    estimateLabel: string;
  }): Promise<{ shipmentReference: string }>;
  getTracking(shipmentReference: string): Promise<{ status: string } | null>;
}
