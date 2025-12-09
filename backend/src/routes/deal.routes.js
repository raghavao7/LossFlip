
import { Router } from 'express';
import Deal from '../models/Deal.js';
import Order from '../models/Order.js';
import ChatMessage from '../models/ChatMessage.js';

const r = Router();

/* -------- inline fake auth (TEMP) -------- */
function fakeAuth(req, _res, next) {
  const who = (req.header('x-user') || 'raj').toLowerCase();
  req.user = who === 'neha'
    ? { _id: '671111111111111111111112', name: 'Neha Buyer', email: 'neha@example.com' }
    : { _id: '671111111111111111111111', name: 'Raj Student', email: 'raj@example.com' };
  next();
}
r.use(fakeAuth);

/* ---------- helpers ---------- */

function redact(doc, currentUserId) {
  const d = doc.toObject({ virtuals: true });
  if (String(d.seller.id) !== String(currentUserId)) delete d.digitalSecret;
  return d;
}

// 3% fee on total (amount * quantity)
function feeOnTotal(orderLike) {
  const amount = Number(orderLike.amount) || 0;
  const qty = Number(orderLike.quantity) || 1;
  const total = amount * qty;
  const fee = Math.round(total * 0.03);
  return { buyerFee: fee, sellerFee: fee };
}

/* ---------- DEAL CRUD + LIST ---------- */

// CREATE DEAL
r.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const deal = await Deal.create({
      seller: { id: req.user._id, name: req.user.name },
      title: b.title,
      category: b.category,
      faceValue: b.faceValue ?? 0,
      dealPrice: b.dealPrice,
      description: b.description ?? '',
      escrowRequired: b.escrowRequired ?? true,
      stock: b.stock ?? 1,
      validityUntil: b.validityUntil ? new Date(b.validityUntil) : undefined,
      paymentMethodsAccepted: b.paymentMethodsAccepted ?? [],
      meta: b.meta ?? {},
      location: {
    city: (b.location && b.location.city) || b.city || '',
    area: (b.location && b.location.area) || b.area || '',
    pincode: (b.location && b.location.pincode) || b.pincode || ''
  },
      images: b.images ?? [],
      digitalSecret: b.digitalSecret ?? ''
    });
    res.status(201).json(redact(deal, req.user._id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// LIST DEALS (optionally filtered by city / pincode)
r.get('/', async (req, res) => {
  const { city, pincode } = req.query || {};
  const filter = {};

  if (city) {
    filter['location.city'] = city;
  }
  if (pincode) {
    filter['location.pincode'] = pincode;
  }

  const list = await Deal.find(filter).sort({ createdAt: -1 }).limit(50);
  res.json(list.map(d => redact(d, req.user._id)));
});


// GET DEAL BY ID
r.get('/:id', async (req, res) => {
  const d = await Deal.findById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(redact(d, req.user._id));
});


// RESTOCK a deal (seller only)
r.post('/:id/restock', async (req, res) => {
  try {
    const extra = Number(req.body.amount || req.body.delta || 1);
    if (!Number.isFinite(extra) || extra <= 0) {
      return res.status(400).json({ error: 'amount must be > 0' });
    }

    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    // only the seller (based on fakeAuth) can restock
    if (String(deal.seller.id) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Only seller can restock this deal' });
    }

    deal.stock = Number(deal.stock || 0) + extra;
    await deal.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`deal:${deal._id}`).emit('deal:updated', { dealId: deal._id });
    }

    // send redacted version so buyer never sees digitalSecret
    res.json(redact(deal, req.user._id));
  } catch (err) {
    console.error('restock error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* -------------- CHAT --------------- */

// CHAT HISTORY (per ORDER)
r.get('/orders/:orderId/chat', async (req, res) => {
  const msgs = await ChatMessage.find({ orderId: req.params.orderId })
    .sort({ createdAt: 1 })
    .limit(500);
  res.json(msgs);
});

// ALL MY THREADS (as buyer or seller) with lightweight deal info
r.get('/me/threads', async (req, res) => {
  const q = { $or: [{ 'buyer.id': req.user._id }, { 'seller.id': req.user._id }] };
  const orders = await Order.find(q).sort({ updatedAt: -1 });

  const dealIds = [...new Set(orders.map(o => String(o.dealId)))];
  const deals = await Deal.find(
    { _id: { $in: dealIds } },
    { title: 1, category: 1, seller: 1 }
  ).lean();

  const map = new Map(deals.map(d => [String(d._id), d]));
  const enriched = orders.map(o => ({ ...o.toObject(), deal: map.get(String(o.dealId)) || null }));
  res.json(enriched);
});

/* -------------- ORDER / ESCROW FLOW --------------- */

// GRAB (start or reuse thread) — NO STOCK CHANGE HERE
r.post('/:id/grab', async (req, res) => {
  const deal = await Deal.findById(req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  if (String(deal.seller.id) === String(req.user._id))
    return res.status(400).json({ error: 'You cannot grab your own deal' });

  // reuse existing initiated order for this buyer+deal
  let order = await Order.findOne({
    dealId: deal._id,
    'buyer.id': req.user._id,
    state: 'initiated'
  });

  if (order) {
    // just return it; quantity changes will be done via /orders/:id/quantity
    return res.json(order);
  }

  // create new thread (initiated)
  order = await Order.create({
    dealId: deal._id,
    seller: { id: deal.seller.id, name: deal.seller.name },
    buyer: { id: req.user._id, name: req.user.name },
    amount: deal.dealPrice,              // per-unit price snapshot
    quantity: 1,
    fees: feeOnTotal({ amount: deal.dealPrice, quantity: 1 }),
    delivery: {
      payload: deal.digitalSecret || '',
      deliveredAt: deal.digitalSecret ? new Date() : undefined
    }
  });

  // notify seller about new thread
  const io = req.app.get('io');
  if (io) io.to(`user:${deal.seller.id}`).emit('thread:new', {
    orderId: order._id,
    dealId: deal._id,
    buyer: order.buyer
  });

  res.status(201).json(order);
});

// CHANGE QUANTITY (only in initiated)
r.post('/orders/:orderId/quantity', async (req, res) => {
  const { quantity } = req.body || {};
  const newQty = Number(quantity);
  if (!Number.isFinite(newQty) || newQty < 1) {
    return res.status(400).json({ error: 'Quantity must be >= 1' });
  }

  const order = await Order.findById(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.state !== 'initiated') {
    return res.status(400).json({ error: 'Cannot change quantity after payment/dispute' });
  }
  if (String(order.buyer.id) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Only buyer can change quantity' });
  }

  order.quantity = newQty;
  order.fees = feeOnTotal(order);
  await order.save();

  const io = req.app.get('io');
  if (io) io.to(`order:${order._id}`).emit('order:updated', {
    orderId: order._id,
    amount: order.amount,
    quantity: order.quantity,
    fees: order.fees,
    state: order.state
  });

  res.json(order);
});


// SELLER proposes escrow per-unit amount (escrow must be enabled)
r.post('/:id/escrow-propose', async (req, res) => {
  try {
    const { amount, orderId } = req.body || {};
    if (!amount || !orderId) {
      return res.status(400).json({ error: 'amount and orderId required' });
    }

    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    if (!deal.escrowRequired) {
      return res.status(400).json({ error: 'Escrow not enabled' });
    }
    if (String(deal.seller.id) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Only seller can propose' });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.amount = Number(amount);
    order.fees = feeOnTotal(order);
    await order.save();

    const io = req.app.get('io');

    // 🟣 system message
    const sys = await ChatMessage.create({
      dealId: order.dealId,
      orderId: order._id,
      from: { id: 'system', name: 'System' },
      body: `Seller proposed ₹${order.amount} per unit`,
      kind: 'system'
    });

    if (io) {
      io.to(`order:${order._id}`).emit('order:updated', {
        orderId: order._id,
        amount: order.amount,
        quantity: order.quantity,
        fees: order.fees,
        state: order.state
      });
      io.to(`order:${order._id}`).emit('chat:new', sys);
    }

    res.json(order);
  } catch (err) {
    console.error('escrow-propose error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// BUYER accepts and "pays" (funds held in escrow) — NO STOCK CHANGE HERE
r.post('/orders/:orderId/accept', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (String(order.buyer.id) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Only buyer can accept/pay' });
    }

    if (order.state !== 'initiated') {
      return res.status(400).json({ error: 'Order is not in initiated state' });
    }

    order.state = 'paid_held';
    await order.save();

    const io = req.app.get('io');
    const total = Number(order.amount || 0) * Number(order.quantity || 1);

    // 🟣 system message
    const sys = await ChatMessage.create({
      dealId: order.dealId,
      orderId: order._id,
      from: { id: 'system', name: 'System' },
      body: `Buyer paid ₹${order.amount} × ${order.quantity} = ₹${total} (held in escrow)`,
      kind: 'system'
    });

    if (io) {
      io.to(`order:${order._id}`).emit('order:updated', {
        orderId: order._id,
        amount: order.amount,
        quantity: order.quantity,
        fees: order.fees,
        state: order.state
      });
      io.to(`order:${order._id}`).emit('chat:new', sys);
    }

    res.json(order);
  } catch (err) {
    console.error('accept error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// BUYER releases funds
// BUYER releases funds (stock was decremented here earlier for smart stock)
r.post('/orders/:id/release', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.state !== 'paid_held') {
      return res.status(400).json({ error: 'Order is not in escrow' });
    }

    order.state = 'released';
    await order.save();

    // SMART STOCK: decrement stock on release
    const deal = await Deal.findById(order.dealId);
    if (deal) {
      const qty = Number(order.quantity || 1);
      const current = Number(deal.stock || 0);
      const nextStock = Math.max(0, current - qty);
      deal.stock = nextStock;
      await deal.save();
    }

    const io = req.app.get('io');
    const total = Number(order.amount || 0) * Number(order.quantity || 1);

    // 🟣 system message
    const sys = await ChatMessage.create({
      dealId: order.dealId,
      orderId: order._id,
      from: { id: 'system', name: 'System' },
      body: `Buyer released ₹${total} to seller`,
      kind: 'system'
    });

    if (io) {
      io.to(`order:${order._id}`).emit('order:updated', {
        orderId: order._id,
        state: order.state
      });

      io.to(`order:${order._id}`).emit('chat:new', sys);

      // keep your existing "deal:updated" for stock refresh
      io.to(`deal:${order.dealId}`).emit('deal:updated', {
        dealId: order.dealId
      });
    }

    res.json(order);
  } catch (err) {
    console.error('release error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// BUYER reports fraud (with proofs)
// BUYER reports fraud (with proofs)
r.post('/orders/:orderId/report', async (req, res) => {
  try {
    const { reason, proofs } = req.body || {};
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (String(order.buyer.id) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Only buyer can report' });
    }

    order.state = 'in_dispute';
    order.dispute = {
      reason: reason || '',
      proofs: Array.isArray(proofs) ? proofs : []
    };
    await order.save();

    const io = req.app.get('io');

    const trimmed = (reason || '').trim();
    const snippet = trimmed ? trimmed.slice(0, 80) : '';
    const msgText = snippet
      ? `Buyer reported fraud: "${snippet}"` 
      : 'Buyer reported fraud';

    // 🟣 system message
    const sys = await ChatMessage.create({
      dealId: order.dealId,
      orderId: order._id,
      from: { id: 'system', name: 'System' },
      body: msgText,
      kind: 'system'
    });

    if (io) {
      io.to(`order:${order._id}`).emit('order:updated', {
        orderId: order._id,
        amount: order.amount,
        quantity: order.quantity,
        fees: order.fees,
        state: order.state
      });
      io.to(`order:${order._id}`).emit('chat:new', sys);
    }

    res.json(order);
  } catch (err) {
    console.error('report error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


export default r;
