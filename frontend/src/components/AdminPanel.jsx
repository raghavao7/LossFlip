import { useEffect, useState } from "react";
import { api } from "../api";

export default function AdminPanel({ onOpenChat }) {
  const [stats, setStats] = useState({});
  const [disputes, setDisputes] = useState([]);

  const load = async () => {
    const s = await api.getAdminStats();
    setStats(s);

    const d = await api.getDisputes();
    setDisputes(d);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="card">
      <h2>Admin Dashboard</h2>

      <div style={{ marginBottom: 20 }}>
        <b>Total Deals:</b> {stats.deals} <br />
        <b>Total Orders:</b> {stats.orders} <br />
        <b>Active Disputes:</b> {stats.disputes}
      </div>

      <h3>Disputes</h3>

      {disputes.map((o) => (
        <div
          key={o._id}
          className="item"
          style={{
            border: "1px solid #444",
            padding: 12,
            borderRadius: 6,
            marginBottom: 10,
          }}
        >
          <b>{o.dealId?.title}</b>
          <div style={{ marginTop: 4 }}>
            Buyer: {o.buyer?.name}  
          </div>
          <div style={{ marginTop: 4 }}>
            Seller: {o.seller?.name}
          </div>

          <button
            className="primary"
            style={{ marginTop: 8 }}
            onClick={() => onOpenChat(o)}
          >
            View Chat
          </button>
        </div>
      ))}
    </div>
  );
}
