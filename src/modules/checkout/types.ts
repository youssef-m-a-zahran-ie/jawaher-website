export class CheckoutValidationError extends Error {
  constructor(
    readonly reason:
      | "address_missing"
      | "shipping_missing"
      | "cart_empty"
      | "unserviceable_address"
      /** ERP (the inventory authority) could not be reached at order-confirmation time — fails closed rather than committing on stale/absent data. See docs/integration/inventory-integration-audit.md §16. */
      | "availability_check_unavailable",
  ) {
    super(`Checkout validation failed: ${reason}`);
    this.name = "CheckoutValidationError";
  }
}

export type AddressSnapshotInput = {
  recipientName: string;
  phoneE164: string;
  governorate: string;
  city: string;
  area?: string;
  street: string;
  building?: string;
  floor?: string;
  apartment?: string;
  landmark?: string;
  notes?: string;
};
