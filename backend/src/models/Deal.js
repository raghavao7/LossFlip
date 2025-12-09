import mongoose from 'mongoose';

const Seller = new mongoose.Schema({
  id: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true }
}, { _id: false });

const DealSchema = new mongoose.Schema({
  seller: { type: Seller, required: true },
  title: { type: String, required: true, trim: true },
  category: { type: String, enum: ['product','service','ticket','giftcard'], required: true },

  faceValue: { type: Number, min: 0, default: 0 },
  dealPrice: { type: Number, min: 0, required: true },

  description: { type: String, default: '' },
  escrowRequired: { type: Boolean, default: true },
  stock: { type: Number, min: 0, default: 1 },
  validityUntil: { type: Date },

  paymentMethodsAccepted: [{ type: String }],

  meta: {
    warrantyUntil: { type: Date },
    serviceNotes: { type: String },
    ticketType: { type: String },
    eventDateTime: { type: Date },
    seatInfo: { type: String },
    brand: { type: String },
    terms: { type: String }
  },
 location: {
    city: { type: String, trim: true },
    area: { type: String, trim: true },
    pincode: { type: String, trim: true }
  },
  images: [{ type: String }],
  digitalSecret: { type: String, default: '' }
}, { timestamps: true });

DealSchema.virtual('discountPct').get(function() {
  if (!this.faceValue || this.faceValue <= 0) return 0;
  const pct = (1 - (this.dealPrice / this.faceValue)) * 100;
  return Math.max(0, Math.round(pct));
});

export default mongoose.model('Deal', DealSchema);
