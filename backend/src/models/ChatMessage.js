import mongoose from 'mongoose';

const Party = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true }
}, { _id: false });

const ChatMessageSchema = new mongoose.Schema({
  dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  from: { type: Party, required: true },
  body: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model('ChatMessage', ChatMessageSchema);
