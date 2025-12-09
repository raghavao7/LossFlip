import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const r = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'lossflip-dev-secret';
const COOKIE_NAME = 'lossflip_token';

// helper: sign JWT
function signUser(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/register
r.post('/register', async (req, res) => {
  try {
    const { name, email, password, defaultCity } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, password required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      defaultCity: defaultCity || ''
    });

    const token = signUser(user);

    res
      .cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false // set true in production with HTTPS
      })
      .json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        defaultCity: user.defaultCity
      });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
r.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signUser(user);

    res
      .cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false
      })
      .json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        defaultCity: user.defaultCity
      });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
r.get('/me', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json(req.user);
});

// POST /api/auth/logout
r.post('/logout', (req, res) => {
  res
    .clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: false })
    .json({ ok: true });
});

export default r;
