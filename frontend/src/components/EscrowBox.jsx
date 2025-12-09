export default function EscrowBox({ order }) {
  return (
    <div
      className="item"
      style={{
        border: "1px solid #555",
        padding: 10,
        marginTop: 10,
        borderRadius: 6,
      }}
    >
      <b>Order Status:</b> {order.state}
    </div>
  );
}
