import mongoose from 'mongoose';

const Party = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true }
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true },
  seller: { type: Party, required: true },
  buyer:  { type: Party, required: true },

  amount: { type: Number, required: true }, // per-unit agreed amount
  quantity: { type: Number, default: 1, min: 1 },

  fees: { buyerFee: { type: Number, default: 0 }, sellerFee: { type: Number, default: 0 } },

  state: { type: String, enum: ['initiated','paid_held','released','in_dispute'], default: 'initiated' },

  dispute: { reason: { type: String, default: '' }, proofs: [{ type: String }] },

  delivery: { payload: { type: String, default: '' }, deliveredAt: { type: Date } }
}, { timestamps: true });

export default mongoose.model('Order', OrderSchema);
