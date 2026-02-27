import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

dotenv.config();

import authRoutes from './routes/auth';
import applicationRoutes from './routes/applications';
import adminRoutes from './routes/admin';
import { notificationRouter } from './routes/notifications';
import appointmentRoutes from './routes/appointments';
import { startAutoExpireJob } from './services/autoExpire';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate limiters ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { message: 'Too many accounts created from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { message: 'Too many password reset requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiters to specific auth endpoints
app.post('/api/auth/login', loginLimiter);
app.post('/api/auth/register', registerLimiter);
app.post('/api/auth/forgot-password', forgotPasswordLimiter);

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRouter);
app.use('/api/appointments', appointmentRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'E-Passport API is running' });
});

// Public passport verification — no auth required
app.get('/api/verify/:passport_number', (req, res) => {
  const db = require('./database/db').default;
  const record = db.prepare(`
    SELECT full_name, nationality, gender, date_of_birth, passport_type,
           passport_number, issued_at, expires_at, status, photo_path
    FROM applications
    WHERE passport_number = ? AND status = 'approved'
  `).get(req.params.passport_number) as any;

  if (!record) {
    res.status(404).json({ valid: false, message: 'Passport not found or not approved' });
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const expired = record.expires_at < today;

  res.json({
    valid: !expired,
    expired,
    passport_number: record.passport_number,
    full_name: record.full_name,
    nationality: record.nationality,
    gender: record.gender,
    date_of_birth: record.date_of_birth,
    passport_type: record.passport_type,
    issued_at: record.issued_at,
    expires_at: record.expires_at,
    photo_path: record.photo_path,
  });
});

app.listen(PORT, () => {
  console.log(`E-Passport Backend running on http://localhost:${PORT}`);
  startAutoExpireJob();
});

export default app;
