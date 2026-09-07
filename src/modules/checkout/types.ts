export class CheckoutValidationError extends Error {
  constructor(readonly reason: "address_missing" | "shipping_missing" | "cart_empty" | "unserviceable_address") {
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
