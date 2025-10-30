import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, setActingUser } from './api';
import './App.css';

export default function App() {
  const [who, setWho] = useState('raj');
  const [health, setHealth] = useState(null);
  const [deals, setDeals] = useState([]);
  const [threads, setThreads] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [active, setActive] = useState(null);  // { deal, order }
  const socketRef = useRef(null);

  useEffect(() => {
    api.get('/health').then(res => setHealth(res.data)).catch(()=>{});
    refreshDeals();
    refreshThreads();

    // socket for notifications
    const s = io('http://localhost:8080', { extraHeaders: { 'x-user': who } });
    socketRef.current = s;
    s.on('thread:new', () => refreshThreads());
    s.on('thread:updated', () => refreshThreads());
    return () => s.disconnect();
  }, [who]);

  const refreshDeals = () => api.get('/deals').then(res => setDeals(res.data));
  const refreshThreads = () => api.get('/deals/me/threads').then(res => setThreads(res.data));

  const switchUser = (u) => {
    setWho(u);
    setActingUser(u);
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
    setForm({ title:'', category:'product', faceValue:0, dealPrice:0, description:'', escrowRequired:true, stock:1, paymentMethodsAccepted:'UPI', digitalSecret:'' });
    refreshDeals();
  };

  // Grab deal: server will reuse existing initiated thread or create one
  const grab = async (deal) => {
    const { data: order } = await api.post(`/deals/${deal._id}/grab`, {});
    setActive({ deal, order });
    setChatOpen(true);
    refreshThreads();
  };

  const openThread = (t) => {
    const deal = deals.find(d => d._id === t.dealId) || t.deal || null;
    setActive({ deal, order: t });
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
            <input placeholder="Title" value={form.title} onChange={e=>setForm({...form, title:e.target.value})}/>
            <select value={form.category} onChange={e=>setForm({...form, category:e.target.value})}>
              <option value="product">product</option>
              <option value="service">service</option>
              <option value="ticket">ticket</option>
              <option value="giftcard">giftcard</option>
            </select>
            <input type="number" placeholder="Face value (optional)" value={form.faceValue}
                   onChange={e=>setForm({...form, faceValue:e.target.value})}/>
            <input type="number" placeholder="Deal price" value={form.dealPrice}
                   onChange={e=>setForm({...form, dealPrice:e.target.value})}/>
            <textarea placeholder="Description" value={form.description}
                      onChange={e=>setForm({...form, description:e.target.value})}/>
            <label><input type="checkbox" checked={form.escrowRequired}
                          onChange={e=>setForm({...form, escrowRequired:e.target.checked})}/> Escrow required</label>
            <input type="number" placeholder="Stock" value={form.stock}
                   onChange={e=>setForm({...form, stock:e.target.value})}/>
            <input placeholder="Payment methods (e.g., UPI, USDT)" value={form.paymentMethodsAccepted}
                   onChange={e=>setForm({...form, paymentMethodsAccepted:e.target.value})}/>
            <textarea placeholder="Digital secret (code/link delivered to buyer)" value={form.digitalSecret}
                      onChange={e=>setForm({...form, digitalSecret:e.target.value})}/>
            <button className="primary" type="submit">Create</button>
          </form>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="card">
            <h2>Latest Deals</h2>
            <ul className="list">
              {deals.map(d => {
                const iAmSeller =
                  (d.seller?.id === '671111111111111111111111' && who==='raj') ||
                  (d.seller?.id === '671111111111111111111112' && who==='neha');
                return (
                  <li key={d._id}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <b>{d.title}</b> <span className="badge">{d.category}</span><br/>
                        <span>₹{d.dealPrice}</span>
                        {d.faceValue>0 && <span> • Face ₹{d.faceValue} • Disc {d.discountPct}%</span>}
                        <div className="small">by {d.seller?.name} • Stock: {d.stock}</div>
                      </div>
                      {!iAmSeller && d.stock>0 && (
                        <button onClick={() => grab(d)} className="primary">Grab</button>
                      )}
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
              {threads.map(t => (
                <li key={t._id} className="row" style={{ justifyContent:'space-between' }}>
                  <div>
                    <div><b>{t.deal?.title || 'Deal'}</b> <span className="badge">{t.deal?.category || '-'}</span></div>
                    <div className="small">
                      {t.seller?.name} ↔ {t.buyer?.name} • State: {t.state} • ₹{t.amount} × {t.quantity} = ₹{t.amount * t.quantity}
                    </div>
                  </div>
                  <button onClick={() => openThread(t)}>Open</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {chatOpen && active && (
        <ChatModal
          who={who}
          active={active}
          onClose={() => { setChatOpen(false); refreshDeals(); refreshThreads(); }}
        />
      )}
    </div>
  );
}

function ChatModal({ who, active, onClose }) {
  const { deal, order } = active;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState(order.amount);
  const [state, setState] = useState(order.state);
  const socketRef = useRef(null);
  const boxRef = useRef(null);

  const iAmSeller =
    (deal?.seller?.id === '671111111111111111111111' && who==='raj') ||
    (deal?.seller?.id === '671111111111111111111112' && who==='neha');

  // load history + robust join
  useEffect(() => {
    api.get(`/deals/orders/${order._id}/chat`).then(res => setMessages(res.data));
    const s = io('http://localhost:8080', { extraHeaders: { 'x-user': who } });
    socketRef.current = s;

    s.on('connect_error', (e) => console.error('socket connect error', e?.message));
    s.emit('chat:join', { dealId: order.dealId, orderId: order._id });
    s.on('chat:joined', () => {/* joined room ok */});
    s.on('chat:new', (m) => setMessages(prev => [...prev, m]));

    return () => s.disconnect();
  }, [order._id, order.dealId, who]);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [messages]);

  // optimistic send
  const send = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    const myId = who==='raj' ? '671111111111111111111111' : '671111111111111111111112';
    const myName = who==='raj' ? 'Raj Student' : 'Neha Buyer';
    const temp = {
      _id: 'temp_'+Date.now(),
      dealId: order.dealId,
      orderId: order._id,
      from: { id: myId, name: myName },
      body,
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, temp]);
    setText('');
    socketRef.current.emit('chat:send', { dealId: order.dealId, orderId: order._id, body });
  };

  const propose = async () => {
    const { data } = await api.post(`/deals/${order.dealId}/escrow-propose`, { amount: Number(proposal), orderId: order._id });
    setProposal(data.amount);
  };

  const acceptAndPay = async () => {
    const { data } = await api.post(`/deals/orders/${order._id}/accept`);
    setState(data.state);
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

  const buyerFee = Math.round(Number(proposal || 0) * Number(order.quantity || 1) * 0.03);
  const totalBuyerPays = Number(proposal || 0) * Number(order.quantity || 1) + buyerFee;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="row" style={{ justifyContent:'space-between' }}>
          <h3>Chat — {deal?.title || 'Deal'}</h3>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="chat-box" ref={boxRef}>
          {messages.map(m => {
            const myId = who==='raj' ? '671111111111111111111111' : '671111111111111111111112';
            const me = myId === m.from?.id;
            return (
              <div key={m._id} className={`chat-msg ${me ? 'chat-me' : ''}`}>
                <div className="small">{m.from?.name}</div>
                <div>{m.body}</div>
              </div>
            );
          })}
        </div>

        <form onSubmit={send} className="row" style={{ marginTop: 8 }}>
          <input value={text} onChange={(e)=>setText(e.target.value)} placeholder="Type a message..." />
          <button className="primary">Send</button>
        </form>

        {deal?.escrowRequired && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent:'space-between' }}>
              <b>Escrow</b>
              <span className="badge">State: {state}</span>
            </div>

            {iAmSeller ? (
              <div className="row" style={{ marginTop: 8 }}>
                <input type="number" value={proposal}
                       onChange={e=>setProposal(e.target.value)} placeholder="Propose amount (per unit)" />
                <button onClick={propose}>Propose</button>
              </div>
            ) : (
              <div className="grid" style={{ marginTop: 8 }}>
                <div className="small">
                  Amount: ₹{proposal} × {order.quantity} • Escrow fee (3%): ₹{buyerFee} • <b>Total: ₹{totalBuyerPays}</b>
                </div>
                {state === 'initiated' && <button className="primary" onClick={acceptAndPay}>Accept & Pay (Hold)</button>}
                {state === 'paid_held' && (
                  <div className="row">
                    <button className="primary" onClick={release}>Release Payment</button>
                    <button onClick={report}>Report Fraud</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
