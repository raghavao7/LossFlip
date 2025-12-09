import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from './api';
import './App.css';

// Legacy demo IDs (not used in UI anymore but safe to keep)
const RAJ_ID = '671111111111111111111111';
const NEHA_ID = '671111111111111111111112';

function getOrderStatusInfo(state) {
  switch (state) {
    case 'initiated':
      return { label: 'Awaiting payment', color: '#ffb020' }; // yellow
    case 'paid_held':
      return { label: 'In escrow (held)', color: '#4b9cff' }; // blue
    case 'released':
      return { label: 'Completed', color: '#22c55e' }; // green
    case 'in_dispute':
      return { label: 'In dispute', color: '#f97373' }; // red
    default:
      return { label: state || 'Unknown', color: '#6b7280' }; // grey
  }
}

/* =======================
   AUTH SCREEN (LOGIN / REGISTER)
   ======================= */

function AuthScreen({
  authMode,
  setAuthMode,
  authForm,
  setAuthForm,
  authError,
  setAuthError,
  setAuthUser
}) {
  const handleSubmit = async () => {
    try {
      setAuthError('');
      if (
        !authForm.email ||
        !authForm.password ||
        (authMode === 'register' && !authForm.name)
      ) {
        setAuthError('Fill all required fields');
        return;
      }
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const res = await api.post(endpoint, authForm);
      setAuthUser(res.data);
    } catch (err) {
      const msg =
        err.response?.data?.error || err.message || 'Failed to authenticate';
      setAuthError(msg);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 480 }}>
      <h1>LossFlip</h1>
      <p className="small">Login or create an account to start using the app.</p>

      <div className="card" style={{ marginTop: 16 }}>
        <div
          className="row"
          style={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <b>{authMode === 'login' ? 'Login' : 'Register'}</b>
          <button
            type="button"
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'register' : 'login');
              setAuthError('');
            }}
          >
            Switch to {authMode === 'login' ? 'Register' : 'Login'}
          </button>
        </div>

        {authError && (
          <p className="small" style={{ color: '#f97373', marginTop: 8 }}>
            {authError}
          </p>
        )}

        <div className="grid" style={{ marginTop: 8 }}>
          {authMode === 'register' && (
            <input
              placeholder="Name"
              value={authForm.name}
              onChange={e =>
                setAuthForm({ ...authForm, name: e.target.value })
              }
            />
          )}
          <input
            placeholder="Email"
            value={authForm.email}
            onChange={e =>
              setAuthForm({ ...authForm, email: e.target.value })
            }
          />
          <input
            placeholder="Password"
            type="password"
            value={authForm.password}
            onChange={e =>
              setAuthForm({ ...authForm, password: e.target.value })
            }
          />

          <button className="primary" type="button" onClick={handleSubmit}>
            {authMode === 'login' ? 'Login' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =======================
   MAIN APP
   ======================= */

export default function App() {
  const [health, setHealth] = useState(null);
  const [deals, setDeals] = useState([]);
  const [threads, setThreads] = useState([]);
  const [unread, setUnread] = useState({}); // orderId -> true
  const [chatOpen, setChatOpen] = useState(false);
  const [active, setActive] = useState(null); // { deal, order }
  const socketRef = useRef(null);
  const audioRef = useRef(null);

  // Auth state
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: ''
  });

  // REAL user ID (fallback to demo IDs only if needed in future)
  const myId = authUser?._id;

  // Notification sound
  const playPing = () => {
    if (!audioRef.current) return;
    try {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } catch (_) {}
  };

  // Location filter (per user)
  const [locationCity, setLocationCity] = useState(() => {
    return localStorage.getItem('lossflip_city') || '';
  });

  // Shared deal from URL like ?deal=abcdef
  const [sharedDealId] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('deal');
    } catch {
      return null;
    }
  });

  // Deals fetch (optionally filtered by city)
  const refreshDeals = cityOverride => {
    const city = cityOverride !== undefined ? cityOverride : locationCity;
    const params = city ? { city } : {};
    return api.get('/deals', { params }).then(res => setDeals(res.data));
  };

  const refreshThreads = () =>
    api.get('/deals/me/threads').then(res => {
      const data = res.data;
      const list = Array.isArray(data)
        ? data
        : data?.orders || data?.threads || [];
      setThreads(list);
    });

  // First, try auth/me to know if logged in
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/auth/me');
        if (!cancelled) setAuthUser(res.data);
      } catch {
        // not logged in
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Once logged in, load health/deals/threads + connect socket for thread notifications
  useEffect(() => {
    if (!authUser) return;

    api
      .get('/health')
      .then(res => setHealth(res.data))
      .catch(() => {});

    refreshDeals();
    refreshThreads();

    const extraHeaders = {
      'x-user-id': authUser._id,
      'x-user-name': authUser.name
    };

    const s = io('http://localhost:8080', { extraHeaders });
    socketRef.current = s;

    s.on('thread:new', payload => {
      if (!payload?.orderId) return;
      setUnread(prev => ({ ...prev, [payload.orderId]: true }));
      refreshThreads();
      playPing();
    });

    s.on('thread:updated', payload => {
      if (!payload?.orderId) return;
      setUnread(prev => ({ ...prev, [payload.orderId]: true }));
      refreshThreads();
      playPing();
    });

    s.on('connect_error', e => {
      console.error('socket connect error', e?.message);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [authUser, locationCity]);

  const [form, setForm] = useState({
    title: '',
    category: 'product',
    faceValue: 0,
    dealPrice: 0,
    description: '',
    escrowRequired: true,
    stock: 1,
    paymentMethodsAccepted: 'UPI',
    digitalSecret: '',
    city: '',
    pincode: ''
  });

  const createDeal = async e => {
    e.preventDefault();
    const payload = {
      ...form,
      faceValue: Number(form.faceValue || 0),
      dealPrice: Number(form.dealPrice || 0),
      stock: Number(form.stock || 1),
      paymentMethodsAccepted: form.paymentMethodsAccepted
        ? form.paymentMethodsAccepted
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : [],
      city: form.city,
      pincode: form.pincode
    };
    try {
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
        digitalSecret: '',
        city: '',
        pincode: ''
      });
      refreshDeals();
    } catch (err) {
      console.error('create deal failed', err.response?.data || err.message);
    }
  };

  // Grab deal: reuse initiated thread if present
  const grab = async deal => {
    const existing = threads.find(
      t =>
        t.dealId === deal._id &&
        t.state === 'initiated' &&
        t.buyer?.id === myId
    );

    if (existing) {
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

    try {
      const { data: order } = await api.post(`/deals/${deal._id}/grab`, {});
      const fullDeal = deals.find(d => d._id === deal._id) || deal;
      setActive({ deal: fullDeal, order });
      setChatOpen(true);
      refreshThreads();
    } catch (err) {
      console.error('grab failed', err.response?.data || err.message);
    }
  };

  const openThread = t => {
    const deal = deals.find(d => d._id === t.dealId) || t.deal || null;
    setActive({ deal, order: t });
    setUnread(prev => {
      const copy = { ...prev };
      delete copy[t._id];
      return copy;
    });
    setChatOpen(true);
  };

  // 1) While checking auth
  if (authLoading) {
    return (
      <div className="container">
        <p>Loading...</p>
      </div>
    );
  }

  // 2) Not logged in → only auth screen
  if (!authUser) {
    return (
      <AuthScreen
        authMode={authMode}
        setAuthMode={setAuthMode}
        authForm={authForm}
        setAuthForm={setAuthForm}
        authError={authError}
        setAuthError={setAuthError}
        setAuthUser={setAuthUser}
      />
    );
  }

  // 3) Logged in → full app
  return (
    <div className="container">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>LossFlip</h1>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <div className="small">
            Logged in as <b>{authUser.name}</b> ({authUser.email})
          </div>
          <button
            type="button"
            onClick={async () => {
              await api.post('/auth/logout');
              setAuthUser(null);
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <p className="small">API health: {health ? 'OK' : '…checking'}</p>

      {/* notification sound */}
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      {/* LOCATION SELECTOR */}
      <div
        className="card"
        style={{
          marginTop: 12,
          marginBottom: 12,
          display: 'flex',
          justifyContent: 'flex-end'
        }}
      >
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="small">Location:</span>
          <select
            value={locationCity}
            onChange={async e => {
              const city = e.target.value;
              setLocationCity(city);
              if (city) {
                localStorage.setItem('lossflip_city', city);
              } else {
                localStorage.removeItem('lossflip_city');
              }
              await refreshDeals(city);
            }}
          >
            <option value="">All</option>
            <option value="Hyderabad">Hyderabad</option>
            <option value="Delhi">Delhi</option>
            <option value="Bangalore">Bangalore</option>
            <option value="Chennai">Chennai</option>
            <option value="Mumbai">Mumbai</option>
          </select>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* CREATE DEAL */}
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
              onChange={e =>
                setForm({ ...form, faceValue: e.target.value })
              }
            />
            <input
              type="number"
              placeholder="Deal price"
              value={form.dealPrice}
              onChange={e =>
                setForm({ ...form, dealPrice: e.target.value })
              }
            />
            <textarea
              placeholder="Description"
              value={form.description}
              onChange={e =>
                setForm({ ...form, description: e.target.value })
              }
            />
            <label>
              <input
                type="checkbox"
                checked={form.escrowRequired}
                onChange={e =>
                  setForm({ ...form, escrowRequired: e.target.checked })
                }
              />{' '}
              Escrow required
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
              onChange={e =>
                setForm({
                  ...form,
                  paymentMethodsAccepted: e.target.value
                })
              }
            />
            <input
              placeholder="City (e.g., Hyderabad)"
              value={form.city}
              onChange={e => setForm({ ...form, city: e.target.value })}
            />
            <input
              placeholder="Pincode (optional)"
              value={form.pincode}
              onChange={e => setForm({ ...form, pincode: e.target.value })}
            />
            <textarea
              placeholder="Digital secret (code/link delivered to buyer)"
              value={form.digitalSecret}
              onChange={e =>
                setForm({ ...form, digitalSecret: e.target.value })
              }
            />
            <button className="primary" type="submit">
              Create
            </button>
          </form>
        </div>

        {/* DEALS + CHATS */}
        <div className="grid" style={{ gap: 16 }}>
          {/* Latest Deals */}
          <div className="card">
            <h2>Latest Deals</h2>
            <ul className="list">
              {deals.map(d => {
                const iAmSeller =
                  myId &&
                  d.seller?.id &&
                  String(d.seller.id) === String(myId);

                return (
                  <li
                    key={d._id}
                    className={sharedDealId === d._id ? 'shared-deal' : ''}
                  >
                    <div
                      className="row"
                      style={{ justifyContent: 'space-between' }}
                    >
                      <div>
                        <b>{d.title}</b>{' '}
                        <span className="badge">{d.category}</span>
                        {sharedDealId === d._id && (
                          <span
                            className="badge"
                            style={{
                              marginLeft: 6,
                              backgroundColor: '#4b9cff',
                              color: '#0b0b10'
                            }}
                          >
                            Shared deal
                          </span>
                        )}
                        <br />
                        <span>₹{d.dealPrice}</span>
                        {d.faceValue > 0 && (
                          <span>
                            {' '}
                            • Face ₹{d.faceValue} • Disc {d.discountPct}%
                          </span>
                        )}
                        <div className="small">
                          by {d.seller?.name} • Stock: {d.stock}
                          {d.location?.city && (
                            <>
                              {' '}
                              • {d.location.city}
                              {d.location?.pincode &&
                                ` (${d.location.pincode})`}
                            </>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8
                        }}
                      >
                        {/* buyer side */}
                        {!iAmSeller && d.stock > 0 && (
                          <button
                            onClick={() => grab(d)}
                            className="primary"
                          >
                            Grab
                          </button>
                        )}

                        {/* seller quick restock */}
                        {iAmSeller && (
                          <button
                            type="button"
                            onClick={async () => {
                              const raw = window.prompt(
                                'Add how many units to stock?',
                                '1'
                              );
                              if (!raw) return;
                              const amount = Number(raw);
                              if (!Number.isFinite(amount) || amount <= 0) {
                                alert('Enter a positive number');
                                return;
                              }
                              try {
                                await api.post(`/deals/${d._id}/restock`, {
                                  amount
                                });
                                await refreshDeals();
                              } catch (err) {
                                console.error(
                                  'restock failed',
                                  err.response?.data || err.message
                                );
                                alert('Failed to restock');
                              }
                            }}
                          >
                            Restock
                          </button>
                        )}

                        {/* shareable link */}
                        <button
                          type="button"
                          onClick={async () => {
                            const url = `${window.location.origin}?deal=${d._id}`;
                            try {
                              await navigator.clipboard.writeText(url);
                              alert('Deal link copied to clipboard');
                            } catch {
                              alert(url);
                            }
                          }}
                        >
                          Share
                        </button>

                        {/* sold out */}
                        {d.stock === 0 && (
                          <span
                            className="badge"
                            style={{
                              backgroundColor: '#6b7280',
                              color: '#0b0b10'
                            }}
                          >
                            Sold out
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="small" style={{ marginTop: 6 }}>
                      {d.description}
                    </div>
                  </li>
                );
              })}

              {deals.length === 0 && (
                <li className="small">
                  {locationCity ? (
                    <>
                      No deals in <b>{locationCity}</b>.{' '}
                      <button
                        type="button"
                        onClick={async () => {
                          setLocationCity('');
                          localStorage.removeItem('lossflip_city');
                          await refreshDeals('');
                        }}
                      >
                        Show all deals
                      </button>
                    </>
                  ) : (
                    'No deals yet. Create the first one!'
                  )}
                </li>
              )}
            </ul>
          </div>

          {/* Chats */}
          <div className="card">
            <h2>
              Chats
              {Object.keys(unread).length > 0 && (
                <span className="badge" style={{ marginLeft: 8 }}>
                  {Object.keys(unread).length}
                </span>
              )}
            </h2>

            <ul className="list">
              {threads.map(t => {
                const statusInfo = getOrderStatusInfo(t.state);
                return (
                  <li
                    key={t._id}
                    className="row"
                    style={{
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                    onClick={() => openThread(t)}
                  >
                    <div>
                      <div>
                        <b>{t.deal?.title || 'Deal'}</b>{' '}
                        <span className="badge">
                          {t.deal?.category || '-'}
                        </span>
                        {unread[t._id] && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 12,
                              color: '#ff4d4f'
                            }}
                          >
                            ●
                          </span>
                        )}
                      </div>
                      <div className="small">
                        {t.seller?.name} ↔ {t.buyer?.name} •{' '}
                        <span
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
                        • ₹{t.amount} × {t.quantity} = ₹
                        {t.amount * t.quantity}
                      </div>
                    </div>
                    <button>Open</button>
                  </li>
                );
              })}
              {threads.length === 0 && (
                <li className="small text-dim">
                  No chat threads yet. Grab a deal to start chatting.
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* CHAT MODAL */}
      {chatOpen && active && (
        <ChatModal
          currentUserId={myId}
          currentUserName={authUser.name}
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

/* =======================
   CHAT MODAL
   ======================= */

function ChatModal({ currentUserId, currentUserName, active, onClose }) {
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
  const [typingName, setTypingName] = useState(null);
  const typingTimeoutRef = useRef(null);

  const myId = currentUserId;

  const [messageStatus, setMessageStatus] = useState({}); // id -> { sent, delivered, seen }
  const initialAcksSent = useRef(false);

  const iAmSeller =
    myId && deal?.seller?.id && String(deal.seller.id) === String(myId);

  // load history + join room + listen (ticks + typing)
  useEffect(() => {
    // load history
    api
      .get(`/deals/orders/${order._id}/chat`)
      .then(res =>
        setMessages(
          Array.isArray(res.data) ? res.data : res.data?.messages || []
        )
      )
      .catch(err => console.error('load chat failed', err));

    const extraHeaders = {
      'x-user-id': myId,
      'x-user-name': currentUserName || 'User'
    };

    const s = io('http://localhost:8080', { extraHeaders });
    socketRef.current = s;

    s.on('connect_error', e =>
      console.error('socket connect error', e?.message)
    );

    s.emit('chat:join', { dealId: order.dealId, orderId: order._id });
    s.on('chat:joined', () => {});

    s.on('chat:new', m => {
      if (m.orderId !== order._id) return;

      setMessages(prev => [...prev, m]);

      setMessageStatus(prev => {
        const next = { ...prev };

        if (m.from?.id === myId) {
          // my outgoing message reached server
          next[m._id] = { ...(next[m._id] || {}), sent: true };
        } else {
          // incoming message: I'm viewing this chat → delivered + seen
          s.emit('chat:delivered', {
            orderId: order._id,
            messageIds: [m._id]
          });
          s.emit('chat:seen', { orderId: order._id, messageId: m._id });
        }

        return next;
      });
    });

    s.on('order:updated', u => {
      if (u.orderId !== order._id) return;
      if (typeof u.amount === 'number') setProposal(u.amount);
      if (typeof u.quantity === 'number') setQuantity(u.quantity);
      if (u.state) setState(u.state);
    });

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

    s.on('typing', (payload = {}) => {
      if (payload.orderId !== order._id) return;
      if (payload.from?.id === myId) return;

      if (!payload.isTyping) {
        setTypingName(null);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        return;
      }

      setTypingName(payload.from?.name || 'Someone');
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingName(null), 2000);
    });

    return () => {
      s.off('chat:new');
      s.off('order:updated');
      s.off('chat:delivered');
      s.off('chat:seen');
      s.off('typing');
      s.disconnect();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [order._id, order.dealId, myId, currentUserName]);

  // When I open this chat and see the history, mark all incoming as delivered,
  // and the latest as seen.
  useEffect(() => {
    if (!socketRef.current) return;
    if (initialAcksSent.current) return;
    if (!messages.length) return;

    const incomingIds = messages
      .filter(m => m.from?.id && m.from.id !== myId)
      .map(m => m._id)
      .filter(Boolean);

    if (incomingIds.length === 0) return;

    initialAcksSent.current = true;

    socketRef.current.emit('chat:delivered', {
      orderId: order._id,
      messageIds: incomingIds
    });

    const lastId = incomingIds[incomingIds.length - 1];
    socketRef.current.emit('chat:seen', {
      orderId: order._id,
      messageId: lastId
    });
  }, [messages, myId, order._id]);

  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [messages]);

  const send = e => {
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

  const handleInputChange = e => {
    const value = e.target.value;
    setText(value);
    if (!socketRef.current) return;
    socketRef.current.emit('typing', {
      orderId: order._id,
      isTyping: value.length > 0
    });
  };

  const propose = async () => {
    const { data } = await api.post(
      `/deals/${order.dealId}/escrow-propose`,
      { amount: Number(proposal), orderId: order._id }
    );
    setProposal(data.amount);
  };

  const startPayment = () => {
    const fakeId =
      'TXN-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    setTxnId(fakeId);
    setShowPayment(true);
  };

  const confirmPayment = async () => {
    const { data } = await api.post(`/deals/orders/${order._id}/accept`);
    setState(data.state);
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
    const proofs = (proof || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const { data } = await api.post(`/deals/orders/${order._id}/report`, {
      reason,
      proofs
    });
    setState(data.state);
  };

  const changeQty = async delta => {
    const next = quantity + delta;
    if (next < 1) return;
    const { data } = await api.post(`/deals/orders/${order._id}/quantity`, {
      quantity: next
    });
    setQuantity(data.quantity);
  };

  const buyerFee = Math.round(
    Number(proposal || 0) * Number(quantity || 1) * 0.03
  );
  const totalBuyerPays =
    Number(proposal || 0) * Number(quantity || 1) + buyerFee;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div
          className="row"
          style={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
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
            const isSystem =
              m.kind === 'system' || m.from?.id === 'system';

            if (isSystem) {
              return (
                <div key={m._id} className="chat-msg system-msg">
                  <div
                    className="small text-dim"
                    style={{ textAlign: 'center' }}
                  >
                    {m.body}
                  </div>
                </div>
              );
            }

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
              <div
                key={m._id}
                className={`chat-msg ${me ? 'chat-me' : ''}`}
              >
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

          {messages.length === 0 && (
            <p
              className="small text-dim"
              style={{ textAlign: 'center' }}
            >
              No messages yet. Say hi to start chatting!
            </p>
          )}
        </div>

        {typingName && (
          <div className="small" style={{ marginTop: 4 }}>
            {typingName} is typing…
          </div>
        )}

        <form
          onSubmit={send}
          className="row"
          style={{ marginTop: 8 }}
        >
          <input
            value={text}
            onChange={handleInputChange}
            placeholder="Type a message..."
          />
          <button className="primary">Send</button>
        </form>

        {deal?.escrowRequired && (
          <div className="card" style={{ marginTop: 12 }}>
            <div
              className="row"
              style={{ justifyContent: 'space-between', alignItems: 'center' }}
            >
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
              <div
                className="row"
                style={{ marginTop: 8, alignItems: 'center' }}
              >
                <span className="small">Quantity:&nbsp;</span>
                <button
                  type="button"
                  onClick={() => changeQty(-1)}
                >
                  -
                </button>
                <span style={{ margin: '0 8px' }}>{quantity}</span>
                <button
                  type="button"
                  onClick={() => changeQty(1)}
                >
                  +
                </button>
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
                <button type="button" onClick={propose}>
                  Propose
                </button>
              </div>
            ) : (
              <div className="grid" style={{ marginTop: 8 }}>
                <div className="small">
                  Amount: ₹{proposal} × {quantity} • Escrow fee (3%): ₹
                  {buyerFee} • <b>Total: ₹{totalBuyerPays}</b>
                </div>
                {state === 'initiated' && (
                  <button
                    className="primary"
                    type="button"
                    onClick={startPayment}
                  >
                    Accept &amp; Pay (Hold)
                  </button>
                )}
                {state === 'paid_held' && (
                  <div className="row">
                    <button
                      className="primary"
                      type="button"
                      onClick={release}
                    >
                      Release Payment
                    </button>
                    <button type="button" onClick={report}>
                      Report Fraud
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Mock payment overlay */}
        {showPayment && (
          <div
            className="modal-backdrop"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)'
            }}
          >
            <div className="modal" style={{ maxWidth: 420 }}>
              <h3>Mock Payment</h3>
              <p className="small">
                UPI-style simulation (no real gateway).
              </p>
              <div className="card" style={{ marginTop: 8 }}>
                <div>
                  Deal: <b>{deal?.title}</b>
                </div>
                <div>
                  Quantity: <b>{quantity}</b>
                </div>
                <div>
                  Amount per unit: <b>₹{proposal}</b>
                </div>
                <div>
                  Escrow fee (3%): <b>₹{buyerFee}</b>
                </div>
                <div style={{ marginTop: 6 }}>
                  Total payable: <b>₹{totalBuyerPays}</b>
                </div>
                <div className="small" style={{ marginTop: 8 }}>
                  Transaction ID (mock): <code>{txnId}</code>
                </div>
              </div>

              <div
                className="row"
                style={{
                  marginTop: 12,
                  justifyContent: 'flex-end',
                  gap: 8
                }}
              >
                <button type="button" onClick={cancelPayment}>
                  Cancel
                </button>
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

/* =======================
   ADMIN DASHBOARD
   ======================= */

function AdminPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [typingName] = useState(null); // kept for layout

  const adminHeaders = { 'x-admin-key': 'lossflip-admin' };

  const load = async () => {
    setLoading(true);
    try {
      const [statsRes, ordersRes] = await Promise.all([
        api.get('/admin/stats', { headers: adminHeaders }),
        api.get('/admin/orders', {
          headers: adminHeaders,
          params: { state: 'in_dispute' }
        })
      ]);
      setStats(statsRes.data);
      setOrders(
        Array.isArray(ordersRes.data)
          ? ordersRes.data
          : ordersRes.data?.orders || []
      );
    } catch (err) {
      console.error('Admin load error', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const openChat = async order => {
    setSelectedOrder(order);
    const res = await api.get(`/admin/orders/${order._id}/chat`, {
      headers: adminHeaders
    });
    setChatMessages(
      Array.isArray(res.data) ? res.data : res.data?.messages || []
    );
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
      <div
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
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
            Total deals
            <br />
            <b>{stats.totalDeals}</b>
          </div>
          <div className="card small">
            Active deals
            <br />
            <b>{stats.activeDeals}</b>
          </div>
          <div className="card small">
            Total orders
            <br />
            <b>{stats.totalOrders}</b>
          </div>
          <div className="card small">
            Disputes
            <br />
            <b>{stats.disputes}</b>
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 16 }}>Dispute orders</h3>
      <ul className="list">
        {orders.map(o => (
          <li key={o._id}>
            <div
              className="row"
              style={{
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div>
                  <b>{o.deal?.title || 'Deal'}</b>{' '}
                  <span className="badge">{o.deal?.category || '-'}</span>
                </div>
                <div className="small">
                  {o.seller?.name} ↔ {o.buyer?.name} • State: {o.state} • ₹
                  {o.amount} × {o.quantity} = ₹
                  {o.amount * o.quantity}
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
              <div
                key={m._id}
                className="chat-msg"
                style={{ marginBottom: 4 }}
              >
                <div className="small">{m.from?.name}</div>
                <div>{m.body}</div>
              </div>
            ))}
            {chatMessages.length === 0 && (
              <p className="small">No messages in this chat.</p>
            )}
          </div>
          {typingName && (
            <div className="small" style={{ marginTop: 4 }}>
              {typingName} is typing…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
