export default function Header({ who, setWho, setAdminView }) {
  return (
    <div className="row" style={{ marginBottom: 20, alignItems: "center" }}>
      <h1 style={{ flex: 1 }}>LossFlip</h1>

      <select
        value={who}
        onChange={(e) => setWho(e.target.value)}
        style={{ padding: 8, marginRight: 12 }}
      >
        <option value="raj">Raj (Seller)</option>
        <option value="neha">Neha (Buyer)</option>
        <option value="admin">Admin</option>
      </select>

      <button
        className="primary"
        onClick={() => setAdminView((p) => !p)}
      >
        {who === "admin" ? "Admin Panel" : "User Mode"}
      </button>
    </div>
  );
}
