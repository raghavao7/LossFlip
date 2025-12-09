export function getOrderStatus(order) {
  if (!order) return "Unknown";

  switch (order.state) {
    case "initiated":
      return "Awaiting Buyer Payment";

    case "paid_held":
      return "In Escrow";

    case "released":
      return "Completed";

    case "in_dispute":
      return "In Dispute";

    default:
      return order.state;
  }
}
