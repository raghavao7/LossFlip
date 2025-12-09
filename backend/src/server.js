import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

import dealRouter from './routes/deal.routes.js';
import adminRouter from './routes/admin.routes.js';
import Order from './models/Order.js';
import ChatMessage from './models/ChatMessage.js';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

import authRouter from './routes/auth.routes.js';


const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

// attach user from JWT cookie if present
const JWT_SECRET = process.env.JWT_SECRET || 'lossflip-dev-secret';

app.use((req, _res, next) => {
  const token = req.cookies?.lossflip_token;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      _id: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role
    };
  } catch (err) {
    // invalid / expired token → ignore, act as guest
  }
  next();
});


const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('❌ Missing MONGODB_URI');
  process.exit(1);
}

mongoose
  .connect(uri)
  .then(() => console.log('✅ MongoDB connected:', uri))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// -----------------------------
// HTTP + SOCKET.IO SERVER
// -----------------------------
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }
});

// make io reachable from routes (for order:updated, thread:new, etc.)
app.set('io', io);

// tiny fake "auth" from headers (same as REST)
function userFromHeaders(headers) {
  // preferred: real user from headers (sent by frontend when logged in)
  const realId = headers['x-user-id'] || headers['X-User-Id'];
  const realName = headers['x-user-name'] || headers['X-User-Name'];

  if (realId && realName) {
    return { _id: realId.toString(), name: realName.toString() };
  }

  // fallback: old demo mode with raj/neha
  const who = (headers['x-user'] || headers['X-User'] || 'raj')
    .toString()
    .toLowerCase();

  return who === 'neha'
    ? { _id: '671111111111111111111112', name: 'Neha Buyer' }
    : { _id: '671111111111111111111111', name: 'Raj Student' };
}


io.on('connection', (socket) => {
  const u = userFromHeaders(socket.handshake.headers);
  console.log('🔌 socket connected as', u.name);

  // personal room for notifications (unread, etc.)
  socket.join(`user:${u._id}`);

  // when a chat modal opens, join the relevant rooms
  socket.on('chat:join', ({ dealId, orderId } = {}) => {
    if (dealId) socket.join(`deal:${dealId}`);
    if (orderId) socket.join(`order:${orderId}`);

    socket.emit('chat:joined', { dealId, orderId });
  });

  // send message
  socket.on('chat:send', async (msg = {}) => {
    try {
      const { dealId, orderId, body } = msg;
      if (!dealId && !orderId) return;

      const room = orderId ? `order:${orderId}` : `deal:${dealId}`;

      const saved = await ChatMessage.create({
        dealId,
        orderId: orderId || null,
        from: { id: u._id, name: u.name },
        body: (body || '').toString()
      });

      // broadcast message to room (both sides get it)
      io.to(room).emit('chat:new', {
        _id: saved._id,
        dealId: saved.dealId,
        orderId: saved.orderId,
        from: saved.from,
        body: saved.body,
        createdAt: saved.createdAt
      });

      // notify the *other* user so their thread shows unread dot + can play sound
      if (orderId) {
        try {
          const order = await Order.findById(orderId).lean();
          if (order) {
            const senderId = String(u._id);
            const sellerId = String(order.seller.id);
            const buyerId = String(order.buyer.id);
            const otherId = senderId === sellerId ? buyerId : sellerId;

            io.to(`user:${otherId}`).emit('thread:updated', {
              orderId: order._id,
              from: saved.from,
              reason: 'chat:new'
            });
          }
        } catch (err) {
          console.error('notify other user failed', err);
        }
      }
    } catch (err) {
      console.error('chat:send error', err);
    }
  });

  // ✅ delivered: the other user has received this message
  socket.on('chat:delivered', (payload = {}) => {
    const { orderId, messageIds } = payload;
    if (!orderId || !Array.isArray(messageIds) || messageIds.length === 0) return;

    const room = `order:${orderId}`;
    io.to(room).emit('chat:delivered', { orderId, messageIds });
  });

  // ✅ seen: the other user has this chat open and message is visible
  socket.on('chat:seen', (payload = {}) => {
    const { orderId, messageId } = payload;
    if (!orderId || !messageId) return;

    const room = `order:${orderId}`;
    io.to(room).emit('chat:seen', { orderId, messageId });
  });

  // 🔴 typing indicator
  socket.on('typing', (payload = {}) => {
    const { orderId, isTyping } = payload;
    if (!orderId) return;

    const room = `order:${orderId}`;
    io.to(room).emit('typing', {
      orderId,
      from: { id: u._id, name: u.name },
      isTyping: !!isTyping
    });
  });

  socket.on('disconnect', () => {
    console.log('🔌 socket disconnected', u.name);
  });
});

// -----------------------------
// REST routes
// -----------------------------
app.use('/api/auth', authRouter);
app.use('/api/deals', dealRouter);
app.use('/api/admin', adminRouter);

// -----------------------------
// START SERVER
// -----------------------------
const port = Number(process.env.PORT || 8080);
server.listen(port, () =>
  console.log(`✅ API + WebSocket running at http://localhost:${port}`)
);
