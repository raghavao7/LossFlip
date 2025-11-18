import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, setActingUser } from './api';
import './App.css';

const RAJ_ID = '671111111111111111111111';
const NEHA_ID = '671111111111111111111112';

function getOrderStatusInfo(state) {
  switch (state) {
    case 'initiated':
      return { label: 'Awaiting payment', color: '#ffb020' };   // yellow
    case 'paid_held':
      return { label: 'In escrow (held)', color: '#4b9cff' };   // blue
    case 'released':
      return { label: 'Completed', color: '#22c55e' };          // green
    case 'in_dispute':
      return { label: 'In dispute', color: '#f97373' };         // red
    default:
      return { label: state || 'Unknown', color: '#6b7280' };   // grey
  }
}

export default function App() {
  const [who, setWho] = useState('raj');
  const [health, setHealth] = useState(null);
  const [deals, setDeals] = useState([]);
  const [threads, setThreads] = useState([]);
  const [unread, setUnread] = useState({}); // orderId -> true
  const [chatOpen, setChatOpen] = useState(false);
  const [active, setActive] = useState(null);  // { deal, order }
  const socketRef = useRef(null);

  const myId = who === 'raj' ? RAJ_ID : NEHA_ID;

  const refreshDeals = () => api.get('/deals').then(res => setDeals(res.data));
  const refreshThreads = () => api.get('/deals/me/threads').then(res => setThreads(res.data));

  useEffect(() => {
    setActingUser(who);
    api.get('/health').then(res => setHealth(res.data)).catch(() => {});
    refreshDeals();
    refreshThreads();

    const s = io('http://localhost:8080', { extraHeaders: { 'x-user': who } });
    socketRef.current = s;

    // seller notifications for new / updated threads
    s.on('thread:new', (payload) => {
      if (!payload?.orderId) return;
      setUnread(prev => ({ ...prev, [payload.orderId]: true }));
      refreshThreads();
    });

    s.on('thread:updated', (payload) => {
      if (!payload?.orderId) return;
      setUnread(prev => ({ ...prev, [payload.orderId]: true }));
      refreshThreads();
    });

    return () => {
      s.disconnect();
    };
  }, [who]);

  const switchUser = (u) => {
    setWho(u);
  };

  const [form, setForm] = useState({
    title: '',
    category: 'product',
    faceValue: 0,
    dealPrice: 0,
    description: '',
    escrowRequired: true,
    stock: 1,
    paymentMethodsAccepted: 'UPI',
    digitalSecret: ''
  });

  const createDeal = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      faceValue: Number(form.faceValue || 0),
      dealPrice: Number(form.dealPrice || 0),
      stock: Number(form.stock || 1),
      paymentMethodsAccepted: form.paymentMethodsAccepted
        ? form.paymentMethodsAccepted.split(',').map(s => s.trim()).filter(Boolean) : []
    };
    await api.post('/deals', payload);
    setForm({
      title: '',
      category: 'product',
      faceValue: 0,
      dealPrice: 0,
      description: '',
      escrowRequired: true,
      stock: 1,
      paymentMethodsAccepted: 'UPI',
      digitalSecret: ''
    });
    refreshDeals();
  };

  // Grab deal: reuse existing initiated thread for this buyer+deal if present
  const grab = async (deal) => {
    // see if we already have an initiated order for this deal as current buyer
    const existing = threads.find(t =>
      t.dealId === deal._id &&
      t.state === 'initiated' &&
      t.buyer?.id === myId
    );

    if (existing) {
      // just open existing chat, don't create new or change quantity
      const fullDeal = deals.find(d => d._id === deal._id) || deal;
      setActive({ deal: fullDeal, order: existing });
      setUnread(prev => {
        const copy = { ...prev };
        delete copy[existing._id];
        return copy;
      });
      setChatOpen(true);
      return;
    }

    // otherwise create a new thread
    const { data: order } = await api.post(`/deals/${deal._id}/grab`, {});
    const fullDeal = deals.find(d => d._id === deal._id) || deal;
    setActive({ deal: fullDeal, order });
    setChatOpen(true);
    refreshThreads();
  };

  const openThread = (t) => {
    const deal = deals.find(d => d._id === t.dealId) || t.deal || null;
    setActive({ deal, order: t });
    setUnread(prev => {
      const copy = { ...prev };
      delete copy[t._id];
      return copy;
    });
    setChatOpen(true);
  };

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>LossFlip (MVP)</h1>
        <div>
          Acting as:&nbsp;
          <select value={who} onChange={e => switchUser(e.target.value)}>
            <option value="raj">Raj (seller/buyer)</option>
            <option value="neha">Neha (buyer/seller)</option>
          </select>
        </div>
      </div>
      <p className="small">API health: {health ? 'OK' : '…checking'}</p>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h2>Create Deal</h2>
          <form onSubmit={createDeal} className="grid">
            <input
              placeholder="Title"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
            />
            <select
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
            >
              <option value="product">product</option>
              <option value="service">service</option>
              <option value="ticket">ticket</option>
              <option value="giftcard">giftcard</option>
            </select>
            <input
              type="number"
              placeholder="Face value (optional)"
              value={form.faceValue}
              onChange={e => setForm({ ...form, faceValue: e.target.value })}
            />
            <input
              type="number"
              placeholder="Deal price"
              value={form.dealPrice}
              onChange={e => setForm({ ...form, dealPrice: e.target.value })}
            />
            <textarea
              placeholder="Description"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
            <label>
              <input
                type="checkbox"
                checked={form.escrowRequired}
                onChange={e => setForm({ ...form, escrowRequired: e.target.checked })}
              /> Escrow required
            </label>
            <input
              type="number"
              placeholder="Stock"
              value={form.stock}
              onChange={e => setForm({ ...form, stock: e.target.value })}
            />
            <input
              placeholder="Payment methods (e.g., UPI, USDT)"
              value={form.paymentMethodsAccepted}
              onChange={e => setForm({ ...form, paymentMethodsAccepted: e.target.value })}
            />
            <textarea
              placeholder="Digital secret (code/link delivered to buyer)"
              value={form.digitalSecret}
              onChange={e => setForm({ ...form, digitalSecret: e.target.value })}
            />
            <button className="primary" type="submit">Create</button>
          </form>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="card">
            <h2>Latest Deals</h2>
            <ul className="list">
              {deals.map(d => {
                const iAmSeller =
                  (d.seller?.id === RAJ_ID && who === 'raj') ||
                  (d.seller?.id === NEHA_ID && who === 'neha');
                return (
                  <li key={d._id}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <b>{d.title}</b> <span className="badge">{d.category}</span><br />
                        <span>₹{d.dealPrice}</span>
                        {d.faceValue > 0 && (
                          <span> • Face ₹{d.faceValue} • Disc {d.discountPct}%</span>
                        )}
                        <div className="small">by {d.seller?.name} • Stock: {d.stock}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {!iAmSeller && d.stock > 0 && (
                          <button onClick={() => grab(d)} className="primary">Grab</button>
                        )}
                        {d.stock === 0 && (
                          <span
                            className="badge"
                            style={{ backgroundColor: '#6b7280', color: '#0b0b10' }}
                          >
                            Sold out
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="small" style={{ marginTop: 6 }}>{d.description}</div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="card">
            <h2>Chats</h2>
            <ul className="list">
              {threads.map(t => {
                const statusInfo = getOrderStatusInfo(t.state);
                return (
                  <li
                    key={t._id}
                    className="row"
                    style={{ justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <div>
                        <b>{t.deal?.title || 'Deal'}</b>{' '}
                        <span className="badge">{t.deal?.category || '-'}</span>
                        {unread[t._id] && (
                          <span style={{ marginLeft: 8, fontSize: 12, color: '#ff4d4f' }}>●</span>
                        )}
                      </div>
                      <div className="small">
                        {t.seller?.name} ↔ {t.buyer?.name}{' '}
                        • <span
                          className="badge"
                          style={{
                            backgroundColor: statusInfo.color,
                            color: '#0b0b10',
                            marginLeft: 4,
                            marginRight: 4
                          }}
                        >
                          {statusInfo.label}
                        </span>
                        • ₹{t.amount} × {t.quantity} = ₹{t.amount * t.quantity}
                      </div>
                    </div>
                    <button onClick={() => openThread(t)}>Open</button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {chatOpen && active && (
        <ChatModal
          who={who}
          active={active}
          onClose={() => {
            setChatOpen(false);
            setActive(null);
            refreshDeals();
            refreshThreads();
          }}
        />
      )}

      {/* Admin dashboard (demo) */}
      <AdminPanel />
    </div>
  );
}

function ChatModal({ who, active, onClose }) {
  const { deal, order } = active;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState(order.amount);
  const [state, setState] = useState(order.state);
  const [quantity, setQuantity] = useState(order.quantity || 1);
  const [showPayment, setShowPayment] = useState(false);
  const [txnId, setTxnId] = useState('');
  const socketRef = useRef(null);
  const boxRef = useRef(null);
  const statusInfo = getOrderStatusInfo(state);

  const myId = who === 'raj' ? RAJ_ID : NEHA_ID;
    // per-message ticks state: id -> { sent, delivered, seen }
  const [messageStatus, setMessageStatus] = useState({});

  const iAmSeller =
    (deal?.seller?.id === RAJ_ID && who === 'raj') ||
    (deal?.seller?.id === NEHA_ID && who === 'neha');

  // load history + join room + listen
    // load history + join room + listen (including ticks)
  useEffect(() => {
    api.get(`/deals/orders/${order._id}/chat`).then(res => setMessages(res.data || []));

    const s = io('http://localhost:8080', { extraHeaders: { 'x-user': who } });
    socketRef.current = s;

    s.on('connect_error', (e) => console.error('socket connect error', e?.message));

    s.emit('chat:join', { dealId: order.dealId, orderId: order._id });
    s.on('chat:joined', () => {});

    // new message from server
    s.on('chat:new', (m) => {
      if (m.orderId !== order._id) return;

      setMessages(prev => [...prev, m]);

      setMessageStatus(prev => {
        const next = { ...prev };

        if (m.from?.id === myId) {
          // my outgoing message reached server -> ✓ (sent)
          next[m._id] = { ...(next[m._id] || {}), sent: true };
        } else {
          // incoming message: I'm viewing this chat, so it's both delivered and seen for the sender
          s.emit('chat:delivered', { orderId: order._id, messageIds: [m._id] });
          s.emit('chat:seen', { orderId: order._id, messageId: m._id });
        }

        return next;
      });
    });

    // order updates (amount, quantity, state) – keep as is
    s.on('order:updated', (u) => {
      if (u.orderId !== order._id) return;
      if (typeof u.amount === 'number') setProposal(u.amount);
      if (typeof u.quantity === 'number') setQuantity(u.quantity);
      if (u.state) setState(u.state);
    });

    // delivered ack: message has reached the other user
    s.on('chat:delivered', ({ orderId, messageIds } = {}) => {
      if (orderId !== order._id || !Array.isArray(messageIds)) return;
      setMessageStatus(prev => {
        const next = { ...prev };
        messageIds.forEach(id => {
          const curr = next[id] || {};
          next[id] = { ...curr, sent: true, delivered: true };
        });
        return next;
      });
    });

    // seen ack: other user has the chat open and saw the message
    s.on('chat:seen', ({ orderId, messageId } = {}) => {
      if (orderId !== order._id || !messageId) return;
      setMessageStatus(prev => ({
        ...prev,
        [messageId]: {
          ...(prev[messageId] || {}),
          sent: true,
          delivered: true,
          seen: true
        }
      }));
    });

    return () => {
      s.off('chat:new');
      s.off('order:updated');
      s.off('chat:delivered');
      s.off('chat:seen');
      s.disconnect();
    };
  }, [order._id, order.dealId, who, myId]);


  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [messages]);

  const send = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !socketRef.current) return;
    socketRef.current.emit('chat:send', {
      dealId: order.dealId,
      orderId: order._id,
      body
    });
    setText('');
  };

  const propose = async () => {
    const { data } = await api.post(
      `/deals/${order.dealId}/escrow-propose`,
      { amount: Number(proposal), orderId: order._id }
    );
    setProposal(data.amount);
  };

  // Open mock payment modal
  const startPayment = () => {
    const fakeId = 'TXN-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    setTxnId(fakeId);
    setShowPayment(true);
  };

  const confirmPayment = async () => {
    const { data } = await api.post(`/deals/orders/${order._id}/accept`);
    setState(data.state);          // should become 'paid_held'
    setShowPayment(false);
  };

  const cancelPayment = () => {
    setShowPayment(false);
  };

  const release = async () => {
    const { data } = await api.post(`/deals/orders/${order._id}/release`);
    setState(data.state);
  };

  const report = async () => {
    const reason = prompt('Reason? (short)');
    const proof = prompt('Proof URL(s) comma-separated');
    const proofs = (proof || '').split(',').map(s => s.trim()).filter(Boolean);
    const { data } = await api.post(`/deals/orders/${order._id}/report`, { reason, proofs });
    setState(data.state);
  };

  const changeQty = async (delta) => {
    const next = quantity + delta;
    if (next < 1) return;
    const { data } = await api.post(`/deals/orders/${order._id}/quantity`, { quantity: next });
    setQuantity(data.quantity);
  };

  const buyerFee = Math.round(Number(proposal || 0) * Number(quantity || 1) * 0.03);
  const totalBuyerPays = Number(proposal || 0) * Number(quantity || 1) + buyerFee;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>Chat — {deal?.title || 'Deal'}</h3>
            <div className="small">
              <span
                className="badge"
                style={{
                  backgroundColor: statusInfo.color,
                  color: '#0b0b10',
                  marginTop: 4
                }}
              >
                {statusInfo.label}
              </span>
            </div>
          </div>
          <button onClick={onClose}>✕</button>
        </div>

                <div className="chat-box" ref={boxRef}>
          {messages.map(m => {
            const me = myId === m.from?.id;
            const status = messageStatus[m._id] || {};

            let tickText = '';
            let tickClass = 'ticks';

            if (me) {
              if (status.seen) {
                tickText = '✓✓';
                tickClass += ' ticks-seen';
              } else if (status.delivered) {
                tickText = '✓✓';
              } else if (status.sent) {
                tickText = '✓';
              }
            }

            return (
              <div key={m._id} className={`chat-msg ${me ? 'chat-me' : ''}`}>
                <div className="small">
                  {m.from?.name}
                  {me && tickText && (
                    <span className={tickClass} style={{ marginLeft: 6 }}>
                      {tickText}
                    </span>
                  )}
                </div>
                <div>{m.body}</div>
              </div>
            );
          })}
        </div>


        <form onSubmit={send} className="row" style={{ marginTop: 8 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
          />
          <button className="primary">Send</button>
        </form>

        {deal?.escrowRequired && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <b>Escrow</b>
              <span
                className="badge"
                style={{
                  backgroundColor: statusInfo.color,
                  color: '#0b0b10'
                }}
              >
                {statusInfo.label}
              </span>
            </div>

            {/* Quantity controls (buyer side while initiated) */}
            {!iAmSeller && state === 'initiated' && (
              <div className="row" style={{ marginTop: 8, alignItems: 'center' }}>
                <span className="small">Quantity:&nbsp;</span>
                <button type="button" onClick={() => changeQty(-1)}>-</button>
                <span style={{ margin: '0 8px' }}>{quantity}</span>
                <button type="button" onClick={() => changeQty(1)}>+</button>
              </div>
            )}

            {iAmSeller ? (
              <div className="row" style={{ marginTop: 8 }}>
                <input
                  type="number"
                  value={proposal}
                  onChange={e => setProposal(e.target.value)}
                  placeholder="Propose amount (per unit)"
                />
                <button type="button" onClick={propose}>Propose</button>
              </div>
            ) : (
              <div className="grid" style={{ marginTop: 8 }}>
                <div className="small">
                  Amount: ₹{proposal} × {quantity} • Escrow fee (3%): ₹{buyerFee} • <b>Total: ₹{totalBuyerPays}</b>
                </div>
                {state === 'initiated' && (
                  <button
                    className="primary"
                    type="button"
                    onClick={startPayment}
                  >
                    Accept & Pay (Hold)
                  </button>
                )}
                {state === 'paid_held' && (
                  <div className="row">
                    <button className="primary" type="button" onClick={release}>Release Payment</button>
                    <button type="button" onClick={report}>Report Fraud</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Mock payment overlay */}
        {showPayment && (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)' }}>
            <div className="modal" style={{ maxWidth: 420 }}>
              <h3>Mock Payment</h3>
              <p className="small">UPI-style simulation (no real gateway).</p>
              <div className="card" style={{ marginTop: 8 }}>
                <div>Deal: <b>{deal?.title}</b></div>
                <div>Quantity: <b>{quantity}</b></div>
                <div>Amount per unit: <b>₹{proposal}</b></div>
                <div>Escrow fee (3%): <b>₹{buyerFee}</b></div>
                <div style={{ marginTop: 6 }}>
                  Total payable: <b>₹{totalBuyerPays}</b>
                </div>
                <div className="small" style={{ marginTop: 8 }}>
                  Transaction ID (mock): <code>{txnId}</code>
                </div>
              </div>

              <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={cancelPayment}>Cancel</button>
                <button
                  className="primary"
                  type="button"
                  onClick={confirmPayment}
                >
                  Confirm Payment
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function AdminPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);

  const adminHeaders = { 'x-admin-key': 'lossflip-admin' }; // NOTE: keep in sync with backend

  const load = async () => {
    setLoading(true);
    try {
      const [statsRes, ordersRes] = await Promise.all([
        api.get('/admin/stats', { headers: adminHeaders }),
        api.get('/admin/orders', {
          headers: adminHeaders,
          params: { state: 'in_dispute' }   // focus on disputes first
        })
      ]);
      setStats(statsRes.data);
      setOrders(ordersRes.data);
    } catch (err) {
      console.error('Admin load error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const openChat = async (order) => {
    setSelectedOrder(order);
    const res = await api.get(`/admin/orders/${order._id}/chat`, {
      headers: adminHeaders
    });
    setChatMessages(res.data);
  };

  if (!open) {
    return (
      <div className="card" style={{ marginTop: 24 }}>
        <button onClick={() => setOpen(true)}>
          Open admin dashboard (demo)
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Admin dashboard (demo)</h2>
        <button onClick={() => setOpen(false)}>Close</button>
      </div>

      {loading && <p className="small">Loading…</p>}

      {stats && (
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 8,
            marginTop: 8
          }}
        >
          <div className="card small">
            Total deals<br /><b>{stats.totalDeals}</b>
          </div>
          <div className="card small">
            Active deals<br /><b>{stats.activeDeals}</b>
          </div>
          <div className="card small">
            Total orders<br /><b>{stats.totalOrders}</b>
          </div>
          <div className="card small">
            Disputes<br /><b>{stats.disputes}</b>
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 16 }}>Dispute orders</h3>
      <ul className="list">
        {orders.map(o => (
          <li key={o._id}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div>
                  <b>{o.deal?.title || 'Deal'}</b>{' '}
                  <span className="badge">{o.deal?.category || '-'}</span>
                </div>
                <div className="small">
                  {o.seller?.name} ↔ {o.buyer?.name} • State: {o.state}{' '}
                  • ₹{o.amount} × {o.quantity} = ₹{o.amount * o.quantity}
                </div>
              </div>
              <button onClick={() => openChat(o)}>View chat</button>
            </div>
          </li>
        ))}
        {orders.length === 0 && !loading && (
          <li className="small">No disputes right now.</li>
        )}
      </ul>

      {selectedOrder && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Chat for order {selectedOrder._id}</h3>
          <p className="small">
            {selectedOrder.seller?.name} ↔ {selectedOrder.buyer?.name}
          </p>
          <div className="chat-box" style={{ maxHeight: 260 }}>
            {chatMessages.map(m => (
              <div key={m._id} className="chat-msg" style={{ marginBottom: 4 }}>
                <div className="small">{m.from?.name}</div>
                <div>{m.body}</div>
              </div>
            ))}
            {chatMessages.length === 0 && (
              <p className="small">No messages in this chat.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
