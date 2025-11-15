import { Router } from 'express';
import Deal from '../models/Deal.js';
import Order from '../models/Order.js';
import ChatMessage from '../models/ChatMessage.js';

const router = Router();

// Very simple admin "auth" for now.
// In production, DO NOT hardcode this.
const ADMIN_KEY = process.env.ADMIN_KEY || 'lossflip-admin';

// middleware: check admin header or ?key=...
function requireAdmin(req, res, next) {
  const key = req.header('x-admin-key') || req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Not authorized (admin key missing or invalid)' });
  }
  next();
}

router.use(requireAdmin);

// GET /api/admin/stats
router.get('/stats', async (_req, res) => {
  const [totalDeals, activeDeals, totalOrders, disputesAgg] = await Promise.all([
    Deal.countDocuments(),
    Deal.countDocuments({ stock: { $gt: 0 } }),
    Order.countDocuments(),
    Order.countDocuments({ state: 'in_dispute' })
  ]);

  // counts per state
  const byState = await Order.aggregate([
    { $group: { _id: '$state', count: { $sum: 1 } } }
  ]);

  res.json({
    totalDeals,
    activeDeals,
    totalOrders,
    disputes: disputesAgg,
    ordersByState: byState
  });
});

// GET /api/admin/orders?state=in_dispute
router.get('/orders', async (req, res) => {
  const { state } = req.query;
  const filter = {};
  if (state) filter.state = state;

  const orders = await Order.find(filter).sort({ updatedAt: -1 }).limit(100).lean();

  // attach minimal deal info for each order
  const dealIds = [...new Set(orders.map(o => String(o.dealId)))];
  const deals = await Deal.find(
    { _id: { $in: dealIds } },
    { title: 1, category: 1, seller: 1 }
  ).lean();
  const dealMap = new Map(deals.map(d => [String(d._id), d]));

  const enriched = orders.map(o => ({
    ...o,
    deal: dealMap.get(String(o.dealId)) || null
  }));

  res.json(enriched);
});

// GET /api/admin/orders/:orderId/chat
router.get('/orders/:orderId/chat', async (req, res) => {
  const { orderId } = req.params;
  const msgs = await ChatMessage.find({ orderId })
    .sort({ createdAt: 1 })
    .limit(1000)
    .lean();
  res.json(msgs);
});

export default router;
