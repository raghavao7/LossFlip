// import { Router } from 'express';
// import Deal from '../models/Deal.js';
// import Order from '../models/Order.js';
// import ChatMessage from '../models/ChatMessage.js';

// const r = Router();

// /* -------- inline fake auth (TEMP) -------- */
// function fakeAuth(req, _res, next) {
//   const who = (req.header('x-user') || 'raj').toLowerCase();
//   req.user = who === 'neha'
//     ? { _id: '671111111111111111111112', name: 'Neha Buyer', email: 'neha@example.com' }
//     : { _id: '671111111111111111111111', name: 'Raj Student', email: 'raj@example.com' };
//   next();
// }
// r.use(fakeAuth);
// /* ---------------------------------------- */

// function redact(doc, currentUserId) {
//   const d = doc.toObject({ virtuals: true });
//   if (String(d.seller.id) !== String(currentUserId)) delete d.digitalSecret;
//   return d;
// }

// // helper: compute 3% fee on total (amount * quantity)
// function feeOnTotal(orderLike) {
//   const amount = Number(orderLike.amount) || 0;
//   const qty = Number(orderLike.quantity) || 1;
//   const total = amount * qty;
//   const fee = Math.round(total * 0.03);
//   return { buyerFee: fee, sellerFee: fee };
// }

// /* ---------- DEAL CRUD + LIST ---------- */

// // CREATE DEAL
// r.post('/', async (req, res) => {
//   try {
//     const b = req.body || {};
//     const deal = await Deal.create({
//       seller: { id: req.user._id, name: req.user.name },
//       title: b.title,
//       category: b.category,
//       faceValue: b.faceValue ?? 0,
//       dealPrice: b.dealPrice,
//       description: b.description ?? '',
//       escrowRequired: b.escrowRequired ?? true,
//       stock: b.stock ?? 1,
//       validityUntil: b.validityUntil ? new Date(b.validityUntil) : undefined,
//       paymentMethodsAccepted: b.paymentMethodsAccepted ?? [],
//       meta: b.meta ?? {},
//       images: b.images ?? [],
//       digitalSecret: b.digitalSecret ?? ''
//     });
//     res.status(201).json(redact(deal, req.user._id));
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// // LIST DEALS
// r.get('/', async (req, res) => {
//   const list = await Deal.find().sort({ createdAt: -1 }).limit(50);
//   res.json(list.map(d => redact(d, req.user._id)));
// });

// // GET DEAL BY ID
// r.get('/:id', async (req, res) => {
//   const d = await Deal.findById(req.params.id);
//   if (!d) return res.status(404).json({ error: 'Not found' });
//   res.json(redact(d, req.user._id));
// });

// /* -------------- CHAT --------------- */

// // CHAT HISTORY (per ORDER)
// r.get('/orders/:orderId/chat', async (req, res) => {
//   const msgs = await ChatMessage.find({ orderId: req.params.orderId })
//     .sort({ createdAt: 1 })
//     .limit(500);
//   res.json(msgs);
// });

// // ALL MY THREADS (as buyer or seller) with lightweight deal info
// r.get('/me/threads', async (req, res) => {
//   const q = { $or: [{ 'buyer.id': req.user._id }, { 'seller.id': req.user._id }] };
//   const orders = await Order.find(q).sort({ updatedAt: -1 });

//   const dealIds = [...new Set(orders.map(o => String(o.dealId)))];
//   const deals = await Deal.find(
//     { _id: { $in: dealIds } },
//     { title: 1, category: 1, seller: 1 }
//   ).lean();

//   const map = new Map(deals.map(d => [String(d._id), d]));
//   const enriched = orders.map(o => ({ ...o.toObject(), deal: map.get(String(o.dealId)) || null }));
//   res.json(enriched);
// });

// /* -------------- ORDER / ESCROW FLOW --------------- */

// // GRAB (start or reuse thread) — NO STOCK CHANGE HERE
// r.post('/:id/grab', async (req, res) => {
//   const deal = await Deal.findById(req.params.id);
//   if (!deal) return res.status(404).json({ error: 'Deal not found' });
//   if (String(deal.seller.id) === String(req.user._id))
//     return res.status(400).json({ error: 'You cannot grab your own deal' });

//   // try reuse existing initiated order for this buyer+deal
//   let order = await Order.findOne({
//     dealId: deal._id, 'buyer.id': req.user._id, state: 'initiated'
//   });

//   if (order) {
//     order.quantity += 1;
//     order.fees = feeOnTotal(order);
//     await order.save();

//     // notify seller thread updated
//     const io = req.app.get('io');
//     if (io) io.to(`user:${deal.seller.id}`).emit('thread:updated', { orderId: order._id, quantity: order.quantity });
//     return res.json(order);
//   }

//   // create new thread (initiated)
//   order = await Order.create({
//     dealId: deal._id,
//     seller: { id: deal.seller.id, name: deal.seller.name },
//     buyer: { id: req.user._id, name: req.user.name },
//     amount: deal.dealPrice,              // per-unit price snapshot
//     quantity: 1,
//     fees: feeOnTotal({ amount: deal.dealPrice, quantity: 1 }),
//     delivery: {
//       payload: deal.digitalSecret || '',
//       deliveredAt: deal.digitalSecret ? new Date() : undefined
//     }
//   });

//   // notify seller about new thread
//   const io = req.app.get('io');
//   if (io) io.to(`user:${deal.seller.id}`).emit('thread:new', { orderId: order._id, dealId: deal._id, buyer: order.buyer });
//   res.status(201).json(order);
// });

// // SELLER proposes escrow per-unit amount (escrow must be enabled)
// r.post('/:id/escrow-propose', async (req, res) => {
//   const { amount, orderId } = req.body || {};
//   if (!amount || !orderId) return res.status(400).json({ error: 'amount and orderId required' });

//   const deal = await Deal.findById(req.params.id);
//   if (!deal) return res.status(404).json({ error: 'Deal not found' });
//   if (!deal.escrowRequired) return res.status(400).json({ error: 'Escrow not enabled' });
//   if (String(deal.seller.id) !== String(req.user._id))
//     return res.status(403).json({ error: 'Only seller can propose' });

//   const order = await Order.findById(orderId);
//   if (!order) return res.status(404).json({ error: 'Order not found' });

//   order.amount = Number(amount);
//   order.fees = feeOnTotal(order); // recalc 3% on (amount * quantity)
//   await order.save();

//   res.json(order);
// });

// // BUYER accepts and "pays" (funds held) — STOCK DECREMENT HAPPENS HERE
// r.post('/orders/:orderId/accept', async (req, res) => {
//   const order = await Order.findById(req.params.orderId);
//   if (!order) return res.status(404).json({ error: 'Order not found' });
//   if (String(order.buyer.id) !== String(req.user._id))
//     return res.status(403).json({ error: 'Only buyer can accept/pay' });

//   // ensure enough stock then decrement atomically
//   const updatedDeal = await Deal.findOneAndUpdate(
//     { _id: order.dealId, stock: { $gte: order.quantity } },
//     { $inc: { stock: -order.quantity } },
//     { new: true }
//   );
//   if (!updatedDeal) return res.status(409).json({ error: 'Out of stock' });

//   order.state = 'paid_held';
//   await order.save();
//   res.json(order);
// });

// // BUYER releases funds
// r.post('/orders/:orderId/release', async (req, res) => {
//   const order = await Order.findById(req.params.orderId);
//   if (!order) return res.status(404).json({ error: 'Order not found' });
//   if (String(order.buyer.id) !== String(req.user._id))
//     return res.status(403).json({ error: 'Only buyer can release' });

//   order.state = 'released';
//   await order.save();
//   res.json(order);
// });

// // BUYER reports fraud (with proofs)
// r.post('/orders/:orderId/report', async (req, res) => {
//   const { reason, proofs } = req.body || {};
//   const order = await Order.findById(req.params.orderId);
//   if (!order) return res.status(404).json({ error: 'Order not found' });
//   if (String(order.buyer.id) !== String(req.user._id))
//     return res.status(403).json({ error: 'Only buyer can report' });

//   order.state = 'in_dispute';
//   order.dispute = { reason: reason || '', proofs: Array.isArray(proofs) ? proofs : [] };
//   await order.save();
//   res.json(order);
// });

// export default r;


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
/* ---------------------------------------- */

function redact(doc, currentUserId) {
  const d = doc.toObject({ virtuals: true });
  if (String(d.seller.id) !== String(currentUserId)) delete d.digitalSecret;
  return d;
}

// helper: 3% fee on total (amount * quantity)
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
      images: b.images ?? [],
      digitalSecret: b.digitalSecret ?? ''
    });
    res.status(201).json(redact(deal, req.user._id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// LIST DEALS
r.get('/', async (req, res) => {
  const list = await Deal.find().sort({ createdAt: -1 }).limit(50);
  res.json(list.map(d => redact(d, req.user._id)));
});

// GET DEAL BY ID
r.get('/:id', async (req, res) => {
  const d = await Deal.findById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(redact(d, req.user._id));
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

  // reuse existing initiated order for this buyer+deal, else create new
  let order = await Order.findOne({
    dealId: deal._id, 'buyer.id': req.user._id, state: 'initiated'
  });

  if (order) {
    order.quantity += 1;
    order.fees = feeOnTotal(order);
    await order.save();

    const io = req.app.get('io');
    if (io) io.to(`user:${deal.seller.id}`).emit('thread:updated', {
      orderId: order._id,
      quantity: order.quantity
    });
    return res.json(order);
  }

  order = await Order.create({
    dealId: deal._id,
    seller: { id: deal.seller.id, name: deal.seller.name },
    buyer: { id: req.user._id, name: req.user.name },
    amount: deal.dealPrice,
    quantity: 1,
    fees: feeOnTotal({ amount: deal.dealPrice, quantity: 1 }),
    delivery: {
      payload: deal.digitalSecret || '',
      deliveredAt: deal.digitalSecret ? new Date() : undefined
    }
  });

  const io = req.app.get('io');
  if (io) io.to(`user:${deal.seller.id}`).emit('thread:new', {
    orderId: order._id,
    dealId: deal._id,
    buyer: order.buyer
  });

  res.status(201).json(order);
});

// SELLER proposes escrow per-unit amount (escrow must be enabled)
r.post('/:id/escrow-propose', async (req, res) => {
  const { amount, orderId } = req.body || {};
  if (!amount || !orderId) return res.status(400).json({ error: 'amount and orderId required' });

  const deal = await Deal.findById(req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  if (!deal.escrowRequired) return res.status(400).json({ error: 'Escrow not enabled' });
  if (String(deal.seller.id) !== String(req.user._id))
    return res.status(403).json({ error: 'Only seller can propose' });

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.amount = Number(amount);
  order.fees = feeOnTotal(order);
  await order.save();

  // 🔔 notify both buyer & seller in this order room
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

// BUYER accepts and "pays" (funds held) — STOCK DECREMENT HAPPENS HERE
r.post('/orders/:orderId/accept', async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (String(order.buyer.id) !== String(req.user._id))
    return res.status(403).json({ error: 'Only buyer can accept/pay' });

  const updatedDeal = await Deal.findOneAndUpdate(
    { _id: order.dealId, stock: { $gte: order.quantity } },
    { $inc: { stock: -order.quantity } },
    { new: true }
  );
  if (!updatedDeal) return res.status(409).json({ error: 'Out of stock' });

  order.state = 'paid_held';
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

// BUYER releases funds
r.post('/orders/:orderId/release', async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (String(order.buyer.id) !== String(req.user._id))
    return res.status(403).json({ error: 'Only buyer can release' });

  order.state = 'released';
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

// BUYER reports fraud (with proofs)
r.post('/orders/:orderId/report', async (req, res) => {
  const { reason, proofs } = req.body || {};
  const order = await Order.findById(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (String(order.buyer.id) !== String(req.user._id))
    return res.status(403).json({ error: 'Only buyer can report' });

  order.state = 'in_dispute';
  order.dispute = { reason: reason || '', proofs: Array.isArray(proofs) ? proofs : [] };
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

export default r;
