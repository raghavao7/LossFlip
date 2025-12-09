export default function DealCard({ deal, who, refreshDeals, refreshThreads, api }) {
  const grab = async () => {
    await api.grabDeal(deal._id);
    refreshDeals();
    refreshThreads();
  };

  return (
    <div
      className="item"
      style={{
        padding: 16,
        border: "1px solid #444",
        borderRadius: 8,
        marginBottom: 10,
      }}
    >
      <h3>{deal.title}</h3>

      <div style={{ fontSize: 14, marginBottom: 8 }}>
        Category: {deal.category}
      </div>

      <div style={{ fontSize: 14, marginBottom: 8 }}>
        Stock:{" "}
        {deal.stock === 0 ? (
          <span className="badge">Sold Out</span>
        ) : (
          deal.stock
        )}
      </div>

      {deal.stock > 0 && who !== "admin" && (
        <button className="primary" onClick={grab}>
          Grab
        </button>
      )}
    </div>
  );
}
