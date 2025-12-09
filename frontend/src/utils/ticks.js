export function getTickStatus(msg, statusMap, myId) {
  const s = statusMap[msg._id] || {};

  // Only show ticks for messages I sent
  if (msg.from?.id !== myId) return "";

  if (s.seen) return "seen";
  if (s.delivered) return "delivered";
  return "sent";
}

export function renderTickSymbol(type) {
  switch (type) {
    case "seen":
      return <span style={{ color: "#4fa3ff" }}>✓✓</span>;
    case "delivered":
      return <span>✓✓</span>;
    case "sent":
      return <span>✓</span>;
    default:
      return null;
  }
}
