import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

import dealRouter from './routes/deal.routes.js';
import ChatMessage from './models/ChatMessage.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('Missing MONGODB_URI'); process.exit(1); }

mongoose.connect(uri)
  .then(() => console.log('✅ MongoDB connected:', uri))
  .catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// attach Socket.IO
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }
});
app.set('io', io);

// tiny socket "auth"
function userFromHeaders(headers) {
  const who = (headers['x-user'] || headers['X-User'] || 'raj').toString().toLowerCase();
  return who === 'neha'
    ? { _id: '671111111111111111111112', name: 'Neha Buyer' }
    : { _id: '671111111111111111111111', name: 'Raj Student' };
}

io.on('connection', (socket) => {
  const u = userFromHeaders(socket.handshake.headers);
  // personal room for notifications
  socket.join(`user:${u._id}`);

  socket.on('chat:join', ({ dealId, orderId }) => {
    const room = orderId ? `order:${orderId}` : `deal:${dealId}`;
    socket.join(room);
    socket.emit('chat:joined', { room });
  });

  socket.on('chat:send', async (msg) => {
    const room = msg.orderId ? `order:${msg.orderId}` : `deal:${msg.dealId}`;
    const saved = await ChatMessage.create({
      dealId: msg.dealId,
      orderId: msg.orderId || null,
      from: { id: u._id, name: u.name },
      body: (msg.body || '').toString()
    });
    io.to(room).emit('chat:new', {
      _id: saved._id, dealId: saved.dealId, orderId: saved.orderId,
      from: saved.from, body: saved.body, createdAt: saved.createdAt
    });
  });
});

// REST routes
app.use('/api/deals', dealRouter);

const port = Number(process.env.PORT || 8080);
server.listen(port, () => console.log(`✅ API+WS on http://localhost:${port}`));
