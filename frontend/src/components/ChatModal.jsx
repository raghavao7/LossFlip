import { useEffect, useRef, useState } from "react";
import { api } from "../api";

export default function ChatModal({ who, active, onClose, socket }) {
  const { deal, order } = active;

  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [typingName, setTypingName] = useState(null);
  const [messageStatus, setMessageStatus] = useState({});

  const boxRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const myId = who;

  // ------------------------------
  // Scroll to bottom
  // ------------------------------
  const scrollBottom = () => {
    setTimeout(() => {
      if (boxRef.current) {
        boxRef.current.scrollTop = boxRef.current.scrollHeight;
      }
    }, 50);
  };

  // ------------------------------
  // Load chat history
  // ------------------------------
  const loadHistory = async () => {
    const list = await api.getChat(order._id);
    setMessages(list);

    // Immediately mark delivered & seen
    socket.emit("chat:delivered", {
      orderId: order._id,
      messageIds: list.map((m) => m._id),
    });

    socket.emit("chat:seen", {
      orderId: order._id,
      messageIds: list.map((m) => m._id),
    });

    // Build initial tick map
    const init = {};
    list.forEach((msg) => {
      init[msg._id] = {
        delivered: !!msg.deliveredAt,
        seen: !!msg.seenAt,
      };
    });
    setMessageStatus(init);

    scrollBottom();
  };

  // ------------------------------
  // ON MOUNT — join room + history
  // ------------------------------
  useEffect(() => {
    if (!socket) return;

    socket.emit("chat:join", {
      dealId: deal._id,
      orderId: order._id,
    });

    loadHistory();

    // LISTENERS
    socket.on("chat:new", (msg) => {
      if (msg.orderId !== order._id) return;

      setMessages((p) => [...p, msg]);

      setMessageStatus((p) => ({
        ...p,
        [msg._id]: { delivered: false, seen: false },
      }));

      // Auto mark delivered
      socket.emit("chat:delivered", {
        orderId: order._id,
        messageIds: [msg._id],
      });

      scrollBottom();
    });

    socket.on("chat:delivered", ({ messageIds }) => {
      setMessageStatus((prev) => {
        const c = { ...prev };
        messageIds?.forEach((id) => {
          if (c[id]) c[id].delivered = true;
        });
        return c;
      });
    });

    socket.on("chat:seen", ({ messageIds }) => {
      setMessageStatus((prev) => {
        const c = { ...prev };
        messageIds?.forEach((id) => {
          if (c[id]) c[id].seen = true;
        });
        return c;
      });
    });

    socket.on("typing", (t) => {
      if (t.orderId !== order._id) return;
      if (t.from?.id === myId) return;

      if (!t.isTyping) {
        setTypingName(null);
        return;
      }

      setTypingName(t.from?.name || "User");

      if (typingTimeoutRef.current)
        clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(
        () => setTypingName(null),
        2000
      );
    });

    return () => {
      socket.off("chat:new");
      socket.off("chat:delivered");
      socket.off("chat:seen");
      socket.off("typing");
      if (typingTimeoutRef.current)
        clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  // ------------------------------
  // SEND MESSAGE
  // ------------------------------
  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    socket.emit("chat:send", {
      dealId: deal._id,
      orderId: order._id,
      body: text,
    });

    setText("");
  };

  // ------------------------------
  // USER TYPING
  // ------------------------------
  const handleTyping = (e) => {
    setText(e.target.value);

    socket.emit("typing", {
      orderId: order._id,
      isTyping: e.target.value.length > 0,
      from: { id: myId, name: myId },
    });
  };

  // ------------------------------
  // TICK RENDER
  // ------------------------------
  const renderTicks = (msg) => {
    const st = messageStatus[msg._id] || {};
    if (msg.from.id !== myId) return null;

    if (st.seen) return <span style={{ color: "#4fa3ff" }}>✓✓</span>;
    if (st.delivered) return <span>✓✓</span>;
    return <span>✓</span>;
  };

  return (
    <div className="modal">
      <div className="card" style={{ width: "450px" }}>
        <h3>
          Chat — {deal.title}
          <button
            style={{ float: "right" }}
            onClick={onClose}
            className="primary"
          >
            X
          </button>
        </h3>

        <div
          className="chat-box"
          ref={boxRef}
          style={{
            height: 320,
            overflowY: "auto",
            border: "1px solid #555",
            padding: 10,
            borderRadius: 6,
            marginBottom: 10,
          }}
        >
          {messages.map((msg) => (
            <div
              key={msg._id}
              style={{
                marginBottom: 12,
                textAlign: msg.from.id === myId ? "right" : "left",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  padding: "6px 10px",
                  borderRadius: 6,
                  background:
                    msg.from.id === myId ? "#333" : "#444",
                }}
              >
                {msg.body}
              </div>
              <div style={{ fontSize: 12, marginTop: 3 }}>
                {renderTicks(msg)}
              </div>
            </div>
          ))}
        </div>

        {typingName && (
          <div className="small" style={{ marginBottom: 8 }}>
            {typingName} is typing…
          </div>
        )}

        <form onSubmit={send} className="row">
          <input
            value={text}
            onChange={handleTyping}
            placeholder="Type a message…"
            style={{ flex: 1, marginRight: 6 }}
          />
          <button className="primary">Send</button>
        </form>
      </div>
    </div>
  );
}
