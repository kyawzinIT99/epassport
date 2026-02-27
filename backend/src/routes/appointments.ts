import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import db from '../database/db';
import { notifyUser } from '../services/sseService';

const router = Router();

// GET / — user: own appointments; admin: all (pending first)
router.get('/', authenticate, (req: AuthRequest, res: Response): void => {
  if (req.user!.role === 'admin') {
    const rows = db.prepare(`
      SELECT a.*, u.full_name as user_name, u.email as user_email
      FROM appointments a
      JOIN users u ON a.user_id = u.id
      ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END ASC,
               a.requested_at DESC
    `).all();
    res.json(rows);
  } else {
    const rows = db.prepare(
      'SELECT * FROM appointments WHERE user_id = ? ORDER BY requested_at DESC'
    ).all(req.user!.id);
    res.json(rows);
  }
});

// POST / — user submits an appointment request
router.post('/', authenticate, (req: AuthRequest, res: Response): void => {
  if (req.user!.role === 'admin') {
    res.status(403).json({ message: 'Admins do not submit appointment requests.' });
    return;
  }

  const { subject, description, application_id } = req.body;
  if (!subject?.trim()) {
    res.status(400).json({ message: 'Subject is required.' });
    return;
  }

  // Limit: max 2 pending requests per user
  const pendingCount = (db.prepare(
    "SELECT COUNT(*) as c FROM appointments WHERE user_id = ? AND status = 'pending'"
  ).get(req.user!.id) as any).c;
  if (pendingCount >= 2) {
    res.status(429).json({ message: 'You already have 2 pending appointment requests. Please wait for them to be processed.' });
    return;
  }

  // Validate application_id belongs to this user if provided
  if (application_id) {
    const app = db.prepare('SELECT id FROM applications WHERE id = ? AND user_id = ?').get(application_id, req.user!.id);
    if (!app) { res.status(400).json({ message: 'Invalid application reference.' }); return; }
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO appointments (id, user_id, application_id, subject, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.user!.id, application_id || null, subject.trim(), description?.trim() || null);

  // Notify all active admins of new request
  const userRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.user!.id) as any;
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND suspended = 0").all() as any[];
  for (const admin of admins) {
    notifyUser(
      admin.id,
      `📅 New appointment request from ${userRow?.full_name}: "${subject.trim()}"`,
      'info',
    );
  }

  const row = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  res.status(201).json(row);
});

// PATCH /:id — admin arranges (approve + schedule) or rejects
router.patch('/:id', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id) as any;
  if (!appt) { res.status(404).json({ message: 'Appointment not found' }); return; }

  const { status, scheduled_date, scheduled_time, location, admin_notes } = req.body;
  if (!['approved', 'rejected', 'completed', 'pending'].includes(status)) {
    res.status(400).json({ message: 'Invalid status' }); return;
  }

  const adminRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.user!.id) as any;
  const adminName = adminRow?.full_name || 'Admin';

  db.prepare(`
    UPDATE appointments SET
      status = ?, scheduled_date = ?, scheduled_time = ?, location = ?,
      admin_notes = ?, arranged_by = ?, arranged_by_name = ?, arranged_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    status,
    scheduled_date || null, scheduled_time || null, location || null,
    admin_notes || null, req.user!.id, adminName,
    req.params.id,
  );

  // Notify the applicant
  const notifMsg: Record<string, string> = {
    approved: scheduled_date
      ? `📅 Your appointment has been scheduled for ${scheduled_date}${scheduled_time ? ' at ' + scheduled_time : ''}${location ? ' — ' + location : ''}. Check Appointments for full details.`
      : `📅 Your appointment request "${appt.subject}" has been approved. Details to follow.`,
    rejected: `❌ Your appointment request "${appt.subject}" could not be accommodated. See admin notes for more info.`,
    completed: `✅ Your appointment "${appt.subject}" is marked as completed. Thank you!`,
    pending:   `Your appointment "${appt.subject}" status has been updated.`,
  };
  notifyUser(
    appt.user_id,
    notifMsg[status] || 'Your appointment has been updated.',
    status === 'rejected' ? 'error' : status === 'approved' ? 'success' : 'info',
  );

  const updated = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /:id — user cancels own pending; admin cancels any
router.delete('/:id', authenticate, (req: AuthRequest, res: Response): void => {
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id) as any;
  if (!appt) { res.status(404).json({ message: 'Appointment not found' }); return; }

  if (req.user!.role !== 'admin') {
    if (appt.user_id !== req.user!.id) { res.status(403).json({ message: 'Access denied' }); return; }
    if (appt.status !== 'pending') {
      res.status(400).json({ message: 'Only pending appointments can be cancelled.' }); return;
    }
  }

  db.prepare('DELETE FROM appointments WHERE id = ?').run(req.params.id);
  res.json({ message: 'Appointment cancelled' });
});

export default router;
