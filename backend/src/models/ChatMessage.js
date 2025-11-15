import mongoose from 'mongoose';

const ChatMessageSchema = new mongoose.Schema(
  {
    dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    from: {
      id: { type: String, required: true },
      name: { type: String, required: true }
    },
    body: { type: String, required: true }
  },
  { timestamps: true }
);

// 🔑 Fast load for one chat
ChatMessageSchema.index({ orderId: 1, createdAt: 1 });

// 🔑 For admin views: messages per deal
ChatMessageSchema.index({ dealId: 1, createdAt: 1 });

// 🔑 For investigating a specific user
ChatMessageSchema.index({ 'from.id': 1, createdAt: -1 });

export default mongoose.model('ChatMessage', ChatMessageSchema);
