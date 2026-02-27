import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/emailService';

const router = Router();

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password, full_name, role: requestedRole } = req.body;
  if (!email || !password || !full_name) {
    res.status(400).json({ message: 'All fields are required' });
    return;
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ message: 'Email already registered' });
    return;
  }
  // Only allow self-registering as 'agent' or default 'applicant'
  const role = requestedRole === 'agent' ? 'agent' : 'applicant';
  const hashedPassword = bcrypt.hashSync(password, 10);
  const id = uuidv4();
  db.prepare('INSERT INTO users (id, email, password, full_name, role, email_verified) VALUES (?, ?, ?, ?, ?, 0)').run(
    id, email, hashedPassword, full_name, role
  );

  // Create verification token (24h expiry)
  const verifyToken = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO email_verification_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(verifyToken, id, expiresAt);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const verifyLink = `${frontendUrl}/verify-email?token=${verifyToken}`;
  await sendVerificationEmail(email, full_name, verifyLink);

  res.status(201).json({ pending: true, message: 'Account created! Please check your email to verify your account before logging in.' });
});

router.post('/login', (req: Request, res: Response): void => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required' });
    return;
  }

  const ip = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || req.ip || 'unknown';
  const ua = (req.headers['user-agent'] || 'unknown').substring(0, 255);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!user || !bcrypt.compareSync(password, user.password)) {
    db.prepare('INSERT INTO login_logs (id, user_id, email, ip, user_agent, success) VALUES (?, ?, ?, ?, ?, 0)')
      .run(uuidv4(), user?.id || null, email, ip, ua);
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }
  if (!user.email_verified) {
    db.prepare('INSERT INTO login_logs (id, user_id, email, ip, user_agent, success) VALUES (?, ?, ?, ?, ?, 0)')
      .run(uuidv4(), user.id, email, ip, ua);
    res.status(403).json({ message: 'Please verify your email address before logging in. Check your inbox for the verification link.', unverified: true });
    return;
  }
  if (user.suspended) {
    db.prepare('INSERT INTO login_logs (id, user_id, email, ip, user_agent, success) VALUES (?, ?, ?, ?, ?, 0)')
      .run(uuidv4(), user.id, email, ip, ua);
    res.status(403).json({ message: 'Your account has been suspended. Please contact support.' });
    return;
  }

  // Successful login — record log and update last-login fields
  db.prepare('INSERT INTO login_logs (id, user_id, email, ip, user_agent, success) VALUES (?, ?, ?, ?, ?, 1)')
    .run(uuidv4(), user.id, email, ip, ua);
  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, last_login_ip = ? WHERE id = ?')
    .run(ip, user.id);

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '7d' }
  );
  res.json({ token, user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, is_super_admin: user.is_super_admin ?? 0 } });
});

// GET /api/auth/me - get current user profile
router.get('/me', authenticate, (req: AuthRequest, res: Response): void => {
  const user = db.prepare('SELECT id, email, full_name, role, created_at, is_super_admin, phone, sms_opt_in FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!user) { res.status(404).json({ message: 'User not found' }); return; }
  res.json(user);
});

// PATCH /api/auth/sms-settings - update phone and SMS opt-in preference
router.patch('/sms-settings', authenticate, (req: AuthRequest, res: Response): void => {
  const { phone, sms_opt_in } = req.body;
  db.prepare('UPDATE users SET phone = ?, sms_opt_in = ? WHERE id = ?')
    .run(phone?.trim() || null, sms_opt_in ? 1 : 0, req.user!.id);
  res.json({ message: 'SMS settings updated successfully' });
});

// PATCH /api/auth/profile - update name and email
router.patch('/profile', authenticate, (req: AuthRequest, res: Response): void => {
  const { full_name, email } = req.body;
  if (!full_name || !email) { res.status(400).json({ message: 'Name and email are required' }); return; }
  const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user!.id);
  if (existing) { res.status(409).json({ message: 'Email already in use by another account' }); return; }
  db.prepare('UPDATE users SET full_name = ?, email = ? WHERE id = ?').run(full_name, email, req.user!.id);
  res.json({ message: 'Profile updated successfully' });
});

// PATCH /api/auth/change-password - change password
router.patch('/change-password', authenticate, (req: AuthRequest, res: Response): void => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) { res.status(400).json({ message: 'All fields are required' }); return; }
  if (new_password.length < 8) { res.status(400).json({ message: 'New password must be at least 8 characters' }); return; }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!bcrypt.compareSync(current_password, user.password)) {
    res.status(401).json({ message: 'Current password is incorrect' });
    return;
  }
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.user!.id);
  res.json({ message: 'Password changed successfully' });
});

// GET /api/auth/verify-email?token=xxx
router.get('/verify-email', (req: Request, res: Response): void => {
  const { token } = req.query as { token: string };
  if (!token) { res.status(400).json({ message: 'Token is required' }); return; }

  const record = db.prepare('SELECT * FROM email_verification_tokens WHERE token = ?').get(token) as any;
  if (!record) { res.status(400).json({ message: 'Invalid or already used verification link' }); return; }

  // Token already used (e.g. React StrictMode fires the effect twice — be idempotent)
  if (record.used) {
    const user = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(record.user_id) as any;
    if (user?.email_verified) {
      res.json({ message: 'Email verified successfully! You can now log in.' });
    } else {
      res.status(400).json({ message: 'Invalid or already used verification link' });
    }
    return;
  }

  if (new Date(record.expires_at) < new Date()) {
    db.prepare('DELETE FROM email_verification_tokens WHERE token = ?').run(token);
    res.status(400).json({ message: 'Verification link has expired. Please request a new one.' });
    return;
  }

  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(record.user_id);
  db.prepare('UPDATE email_verification_tokens SET used = 1 WHERE token = ?').run(token);
  res.json({ message: 'Email verified successfully! You can now log in.' });
});

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  if (!email) { res.status(400).json({ message: 'Email is required' }); return; }

  const user = db.prepare('SELECT id, full_name, email, email_verified FROM users WHERE email = ?').get(email) as any;
  if (!user || user.email_verified) {
    res.json({ message: 'If that account exists and is unverified, a new link has been sent.' });
    return;
  }

  // Delete old token and create a new one
  db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(user.id);
  const verifyToken = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO email_verification_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(verifyToken, user.id, expiresAt);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  await sendVerificationEmail(user.email, user.full_name, `${frontendUrl}/verify-email?token=${verifyToken}`);

  res.json({ message: 'If that account exists and is unverified, a new link has been sent.' });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  if (!email) { res.status(400).json({ message: 'Email is required' }); return; }

  const user = db.prepare('SELECT id, full_name, email FROM users WHERE email = ?').get(email) as any;
  // Always respond success to prevent email enumeration
  if (!user) { res.json({ message: 'If that email exists, a reset link has been sent.' }); return; }

  // Invalidate any existing tokens for this user
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  db.prepare('INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetLink = `${frontendUrl}/reset-password?token=${token}`;

  const previewUrl = await sendPasswordResetEmail(user.email, user.full_name, resetLink);
  if (previewUrl) console.log(`🔑 Reset link preview: ${previewUrl}`);

  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

// POST /api/auth/reset-password
router.post('/reset-password', (req: Request, res: Response): void => {
  const { token, new_password } = req.body;
  if (!token || !new_password) { res.status(400).json({ message: 'Token and new password are required' }); return; }
  if (new_password.length < 8) { res.status(400).json({ message: 'Password must be at least 8 characters' }); return; }

  const record = db.prepare('SELECT * FROM password_reset_tokens WHERE token = ?').get(token) as any;
  if (!record) { res.status(400).json({ message: 'Invalid or expired reset link' }); return; }
  if (record.used) { res.status(400).json({ message: 'This reset link has already been used' }); return; }
  if (new Date(record.expires_at) < new Date()) {
    db.prepare('DELETE FROM password_reset_tokens WHERE token = ?').run(token);
    res.status(400).json({ message: 'Reset link has expired. Please request a new one.' });
    return;
  }

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), record.user_id);
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);

  res.json({ message: 'Password reset successfully. You can now log in.' });
});

export default router;
