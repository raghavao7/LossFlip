export default function ChatThreadItem({ thread, unread, openChat }) {
  const isUnread = unread[thread._id];

  return (
    <div
      className="item"
      style={{
        border: "1px solid #444",
        padding: 12,
        borderRadius: 6,
        marginBottom: 8,
        cursor: "pointer",
      }}
      onClick={() => openChat(thread)}
    >
      <b>{thread.dealId?.title || "Deal"}</b>

      <div style={{ marginTop: 4, fontSize: 14 }}>
        You ↔ {thread.seller?.name || thread.buyer?.name}
      </div>

      {isUnread && <span className="badge">●</span>}
    </div>
  );
}
