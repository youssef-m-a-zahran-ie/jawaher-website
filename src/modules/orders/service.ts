import { ordersRepository } from "@/modules/orders/repository";

export class OrderNotFoundError extends Error {
  constructor() {
    super("Order not found");
    this.name = "OrderNotFoundError";
  }
}

export class OrderAuthorizationError extends Error {
  constructor() {
    super("Not authorized to view this order");
    this.name = "OrderAuthorizationError";
  }
}

/**
 * "Refunded" is never a stored Order.status — it's derived here from the
 * latest Payment's state (data-ownership.md's Order entity: "the order's
 * customer-facing status reflects [the refund], but the order record
 * itself is never overwritten"). See commerce-completeness-audit.md §14.
 */
function deriveCustomerFacingStatus(order: { status: string }, latestPaymentStatus: string | undefined): string {
  if (order.status === "CANCELLED") return "cancelled";
  if (latestPaymentStatus === "REFUND_COMPLETED") return "refunded";
  if (latestPaymentStatus === "REFUND_INITIATED") return "refund_in_progress";
  return "confirmed";
}

/** Public interface — module-boundaries.md's Orders row (createOrder lives in Checkout; this covers getOrder/getOrderStatus/trackOrder). */
export const ordersService = {
  /** `requestingCustomerId: null` means a guest session — authorized only if the order itself has no customerId (a guest order), per the same ownership rule. */
  async getOrderForCustomer(orderId: string, requestingCustomerId: string | null) {
    const order = await ordersRepository.findById(orderId);
    if (!order) throw new OrderNotFoundError();
    if (order.customerId !== requestingCustomerId) throw new OrderAuthorizationError();

    return { ...order, customerFacingStatus: deriveCustomerFacingStatus(order, order.payments[0]?.status) };
  },

  /** The public tracking endpoint — order number + phone required together (commerce-completeness-audit.md §19). */
  async trackOrder(orderNumber: string, phoneE164: string) {
    const order = await ordersRepository.findByNumberAndPhone(orderNumber, phoneE164);
    if (!order) throw new OrderNotFoundError();
    return { ...order, customerFacingStatus: deriveCustomerFacingStatus(order, order.payments[0]?.status) };
  },

  async listForCustomer(customerId: string) {
    const orders = await ordersRepository.listForCustomer(customerId);
    return orders.map((order) => ({
      ...order,
      customerFacingStatus: deriveCustomerFacingStatus(order, order.payments[0]?.status),
    }));
  },

  async cancelOrder(orderId: string, requestingCustomerId: string | null, reason: string) {
    const order = await ordersRepository.findById(orderId);
    if (!order) throw new OrderNotFoundError();
    if (order.customerId !== requestingCustomerId) throw new OrderAuthorizationError();
    return ordersRepository.cancel(orderId, reason);
  },
};
