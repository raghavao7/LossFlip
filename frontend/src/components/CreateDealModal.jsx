import { useState } from "react";

export default function CreateDealModal({ onClose, api }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("product");
  const [stock, setStock] = useState(1);

  const create = async (e) => {
    e.preventDefault();
    await api.createDeal({ title, category, stock });
    onClose();
  };

  return (
    <div className="modal">
      <div className="card" style={{ width: 350 }}>
        <h3>
          Create Deal
          <button
            style={{ float: "right" }}
            onClick={onClose}
            className="primary"
          >
            X
          </button>
        </h3>

        <form onSubmit={create}>
          <input
            placeholder="Deal title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%", marginBottom: 10 }}
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ width: "100%", marginBottom: 10 }}
          >
            <option value="product">Product</option>
            <option value="service">Service</option>
            <option value="ticket">Ticket</option>
            <option value="giftcard">Gift Card</option>
          </select>

          <input
            type="number"
            value={stock}
            min={1}
            onChange={(e) => setStock(e.target.value)}
            style={{ width: "100%", marginBottom: 10 }}
          />

          <button className="primary" style={{ width: "100%" }}>
            Create
          </button>
        </form>
      </div>
    </div>
  );
}
