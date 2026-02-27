import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import db from '../database/db';
import { sendStatusEmail } from '../services/emailService';
import { runAIReview } from '../services/aiReviewService';
import { runExpiryReminders } from '../services/autoExpire';
import { v4 as uuidv4 } from 'uuid';
import { notifyUser, emitToUser } from '../services/sseService';
import { sendSmsToUser } from '../services/smsService';

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

const generatePassportNumber = (): string => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let pn: string;
  let attempts = 0;
  do {
    const prefix = letters[Math.floor(Math.random() * letters.length)] + letters[Math.floor(Math.random() * letters.length)];
    pn = `${prefix}${Math.floor(1000000 + Math.random() * 9000000)}`;
    attempts++;
  } while (
    db.prepare('SELECT id FROM applications WHERE passport_number = ?').get(pn) && attempts < 20
  );
  return pn;
};

function logAudit(adminId: string, adminName: string, action: string, targetType: string, targetId: string | null, details: string) {
  db.prepare(
    'INSERT INTO audit_log (id, admin_id, admin_name, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(uuidv4(), adminId, adminName, action, targetType, targetId, details);
}

function recordHistory(applicationId: string, status: string, adminNotes: string | null, adminId: string, adminName: string) {
  db.prepare(`
    INSERT INTO application_history (id, application_id, status, admin_notes, changed_by, changed_by_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), applicationId, status, adminNotes || null, adminId, adminName);
}

function getAdminName(adminId: string): string {
  const u = db.prepare('SELECT full_name FROM users WHERE id = ?').get(adminId) as any;
  return u?.full_name || 'Admin';
}

function isSuperAdmin(req: AuthRequest): boolean {
  const u = db.prepare('SELECT is_super_admin FROM users WHERE id = ?').get(req.user!.id) as any;
  return u?.is_super_admin === 1;
}

// ── Applications ───────────────────────────────────────────────────────────

router.get('/applications', authenticate, requireAdmin, (_req: AuthRequest, res: Response): void => {
  const applications = db.prepare(`
    SELECT a.*, u.full_name as applicant_name, u.email as applicant_email
    FROM applications a JOIN users u ON a.user_id = u.id
    ORDER BY CASE WHEN a.processing_tier = 'express' THEN 0 ELSE 1 END ASC, a.submitted_at DESC
  `).all();
  res.json(applications);
});

router.get('/stats', authenticate, requireAdmin, (_req: AuthRequest, res: Response): void => {
  const total      = (db.prepare('SELECT COUNT(*) as count FROM applications').get() as any).count;
  const pending    = (db.prepare("SELECT COUNT(*) as count FROM applications WHERE status='pending'").get() as any).count;
  const approved   = (db.prepare("SELECT COUNT(*) as count FROM applications WHERE status='approved'").get() as any).count;
  const rejected   = (db.prepare("SELECT COUNT(*) as count FROM applications WHERE status='rejected'").get() as any).count;
  const processing = (db.prepare("SELECT COUNT(*) as count FROM applications WHERE status='processing'").get() as any).count;
  // Count applications flagged as duplicates — primary: matching existing_passport_number; secondary: name+DOB
  const flagged = (db.prepare(`
    SELECT COUNT(DISTINCT a.id) as count FROM applications a
    WHERE EXISTS (
      SELECT 1 FROM applications b
      WHERE b.id != a.id AND b.user_id != a.user_id AND (
        (a.existing_passport_number IS NOT NULL AND b.existing_passport_number = a.existing_passport_number)
        OR (LOWER(TRIM(b.full_name)) = LOWER(TRIM(a.full_name)) AND b.date_of_birth = a.date_of_birth)
      )
    )
  `).get() as any).count;
  const express_count = (db.prepare(
    "SELECT COUNT(*) as count FROM applications WHERE processing_tier='express' AND status IN ('pending','processing')"
  ).get() as any).count;
  const total_agents = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role='agent'").get() as any).count;
  res.json({ total, pending, approved, rejected, processing, flagged, express_count, total_agents });
});

// Duplicate person detection for a single application (tiered confidence)
router.get('/applications/:id/duplicates', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!app) { res.status(404).json({ message: 'Not found' }); return; }

  const results: any[] = [];
  const seen = new Set<string>();
  const addRow = (row: any, confidence: string) => {
    if (!seen.has(row.id)) { seen.add(row.id); results.push({ ...row, confidence }); }
  };

  // HIGH confidence: same existing_passport_number from a different user account
  if (app.existing_passport_number) {
    (db.prepare(`
      SELECT a.id, a.application_number, a.full_name, a.date_of_birth, a.nationality,
             a.status, a.submitted_at, a.existing_passport_number, u.email as user_email
      FROM applications a JOIN users u ON a.user_id = u.id
      WHERE a.id != ? AND a.existing_passport_number = ? AND a.user_id != ?
    `).all(req.params.id, app.existing_passport_number, app.user_id) as any[])
      .forEach((r) => addRow(r, 'HIGH'));
  }

  // MEDIUM confidence: same name + DOB (could be genuine coincidence)
  (db.prepare(`
    SELECT a.id, a.application_number, a.full_name, a.date_of_birth, a.nationality,
           a.status, a.submitted_at, a.existing_passport_number, u.email as user_email
    FROM applications a JOIN users u ON a.user_id = u.id
    WHERE a.id != ?
      AND LOWER(TRIM(a.full_name)) = LOWER(TRIM(?))
      AND a.date_of_birth = ?
      AND a.user_id != ?
  `).all(req.params.id, app.full_name, app.date_of_birth, app.user_id) as any[])
    .forEach((r) => addRow(r, 'MEDIUM'));

  res.json(results);
});

// AI-powered risk review for a single application
router.get('/applications/:id/ai-review', authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ message: 'AI review is not configured. Add OPENAI_API_KEY to .env.' });
    return;
  }

  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!app) { res.status(404).json({ message: 'Not found' }); return; }

  // Gather duplicate candidates (same logic as /duplicates)
  const duplicateCandidates: any[] = [];
  const seen = new Set<string>();
  const addDup = (row: any, confidence: string) => {
    if (!seen.has(row.id)) { seen.add(row.id); duplicateCandidates.push({ ...row, confidence }); }
  };
  if (app.existing_passport_number) {
    (db.prepare(`
      SELECT a.id, a.application_number, a.full_name, a.date_of_birth, a.existing_passport_number,
             a.status, u.email as user_email
      FROM applications a JOIN users u ON a.user_id = u.id
      WHERE a.id != ? AND a.existing_passport_number = ? AND a.user_id != ?
    `).all(app.id, app.existing_passport_number, app.user_id) as any[]).forEach((r) => addDup(r, 'HIGH'));
  }
  (db.prepare(`
    SELECT a.id, a.application_number, a.full_name, a.date_of_birth, a.existing_passport_number,
           a.status, u.email as user_email
    FROM applications a JOIN users u ON a.user_id = u.id
    WHERE a.id != ? AND LOWER(TRIM(a.full_name)) = LOWER(TRIM(?))
      AND a.date_of_birth = ? AND a.user_id != ?
  `).all(app.id, app.full_name, app.date_of_birth, app.user_id) as any[]).forEach((r) => addDup(r, 'MEDIUM'));

  // Cross-account contact matches
  const samePhone = (db.prepare(
    'SELECT COUNT(DISTINCT user_id) as c FROM applications WHERE phone = ? AND user_id != ?'
  ).get(app.phone, app.user_id) as any).c;
  const sameEmail = (db.prepare(
    'SELECT COUNT(DISTINCT user_id) as c FROM applications WHERE email = ? AND user_id != ?'
  ).get(app.email, app.user_id) as any).c;

  try {
    const result = await runAIReview(app, duplicateCandidates, { samePhone, sameEmail });
    res.json(result);
  } catch (err: any) {
    console.error('AI review error:', err.message);
    res.status(500).json({ message: 'AI review failed: ' + err.message });
  }
});

// Review single application
router.patch('/applications/:id/review', authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { status, admin_notes } = req.body;
  const validStatuses = ['pending', 'processing', 'approved', 'rejected'];
  if (!validStatuses.includes(status)) { res.status(400).json({ message: 'Invalid status' }); return; }

  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!application) { res.status(404).json({ message: 'Application not found' }); return; }

  const adminName = getAdminName(req.user!.id);

  if (status === 'approved' && !application.passport_number) {
    const issuedAt  = new Date().toISOString().split('T')[0];
    const expiresAt = new Date(Date.now() + 10 * 365.25 * 24 * 3600 * 1000).toISOString().split('T')[0];
    db.prepare(`
      UPDATE applications SET status=?, admin_notes=?, reviewed_at=CURRENT_TIMESTAMP, reviewed_by=?,
      passport_number=?, issued_at=?, expires_at=? WHERE id=?
    `).run(status, admin_notes || null, req.user!.id, generatePassportNumber(), issuedAt, expiresAt, req.params.id);
  } else {
    db.prepare(`
      UPDATE applications SET status=?, admin_notes=?, reviewed_at=CURRENT_TIMESTAMP, reviewed_by=? WHERE id=?
    `).run(status, admin_notes || null, req.user!.id, req.params.id);
  }

  recordHistory(req.params.id, status, admin_notes, req.user!.id, adminName);
  logAudit(req.user!.id, adminName, `set_status_${status}`, 'application', req.params.id,
    `Changed ${application.application_number} to "${status}"${admin_notes ? ` — ${admin_notes}` : ''}`);

  const user = db.prepare('SELECT email, full_name FROM users WHERE id = ?').get(application.user_id) as any;
  const notifMessages: Record<string, string> = {
    pending:    'Your passport application has been set back to pending.',
    processing: 'Your passport application is now being processed.',
    approved:   '🎉 Your passport has been approved! View your digital certificate.',
    rejected:   'Your passport application was not approved. Check admin notes for details.',
  };
  notifyUser(
    application.user_id,
    notifMessages[status] || 'Your application status has been updated.',
    status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'info',
    application.id,
  );

  // Push live status-change event so the applicant's page updates without refresh
  const updatedApp = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  emitToUser(application.user_id, 'status_change', {
    application_id: application.id,
    status,
    passport_number: updatedApp?.passport_number ?? null,
    issued_at:       updatedApp?.issued_at ?? null,
    expires_at:      updatedApp?.expires_at ?? null,
    admin_notes:     admin_notes ?? null,
    admin_name:      adminName,
  });

  if (user) sendStatusEmail(user.email, user.full_name, application.application_number, status, admin_notes).catch(console.error);

  // SMS notification
  const smsMessages: Record<string, string> = {
    approved:   `E-Passport: Your application ${application.application_number} has been approved! Collect within 30 days.`,
    rejected:   `E-Passport: Your application ${application.application_number} was not approved. Log in for details.`,
    processing: `E-Passport: Your application ${application.application_number} is now being processed.`,
  };
  if (smsMessages[status]) sendSmsToUser(application.user_id, smsMessages[status]).catch(console.error);

  res.json(updatedApp);
});

// Bulk review
router.post('/applications/bulk-review', authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { ids, status, admin_notes } = req.body;
  const validStatuses = ['pending', 'processing', 'approved', 'rejected'];
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ message: 'No application IDs provided' }); return; }
  if (!validStatuses.includes(status)) { res.status(400).json({ message: 'Invalid status' }); return; }

  const adminName = getAdminName(req.user!.id);
  let updated = 0;

  for (const id of ids) {
    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as any;
    if (!application) continue;

    if (status === 'approved' && !application.passport_number) {
      const issuedAt  = new Date().toISOString().split('T')[0];
      const expiresAt = new Date(Date.now() + 10 * 365.25 * 24 * 3600 * 1000).toISOString().split('T')[0];
      db.prepare(`
        UPDATE applications SET status=?, admin_notes=?, reviewed_at=CURRENT_TIMESTAMP, reviewed_by=?,
        passport_number=?, issued_at=?, expires_at=? WHERE id=?
      `).run(status, admin_notes || null, req.user!.id, generatePassportNumber(), issuedAt, expiresAt, id);
    } else {
      db.prepare(`
        UPDATE applications SET status=?, admin_notes=?, reviewed_at=CURRENT_TIMESTAMP, reviewed_by=? WHERE id=?
      `).run(status, admin_notes || null, req.user!.id, id);
    }

    recordHistory(id, status, admin_notes, req.user!.id, adminName);

    const notifMessages: Record<string, string> = {
      pending:    'Your passport application has been set back to pending.',
      processing: 'Your passport application is now being processed.',
      approved:   '🎉 Your passport has been approved! View your digital certificate.',
      rejected:   'Your passport application was not approved. Check admin notes for details.',
    };
    notifyUser(
      application.user_id,
      notifMessages[status] || 'Status updated.',
      status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'info',
      id,
    );

    const bulkUpdatedApp = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as any;
    emitToUser(application.user_id, 'status_change', {
      application_id: id,
      status,
      passport_number: bulkUpdatedApp?.passport_number ?? null,
      issued_at:       bulkUpdatedApp?.issued_at ?? null,
      expires_at:      bulkUpdatedApp?.expires_at ?? null,
      admin_notes:     admin_notes ?? null,
      admin_name:      adminName,
    });

    const user = db.prepare('SELECT email, full_name FROM users WHERE id = ?').get(application.user_id) as any;
    if (user) sendStatusEmail(user.email, user.full_name, application.application_number, status, admin_notes).catch(console.error);

    // SMS for bulk review
    const bulkSmsMessages: Record<string, string> = {
      approved:   `E-Passport: Your application ${application.application_number} has been approved! Collect within 30 days.`,
      rejected:   `E-Passport: Your application ${application.application_number} was not approved. Log in for details.`,
      processing: `E-Passport: Your application ${application.application_number} is now being processed.`,
    };
    if (bulkSmsMessages[status]) sendSmsToUser(application.user_id, bulkSmsMessages[status]).catch(console.error);
    updated++;
  }

  logAudit(req.user!.id, adminName, `bulk_set_status_${status}`, 'application', null,
    `Bulk updated ${updated} application(s) to "${status}"`);

  res.json({ message: `${updated} application(s) updated to "${status}"`, updated });
});

// Get application history (admin view)
router.get('/applications/:id/history', authenticate, requireAdmin, (_req: AuthRequest, res: Response): void => {
  const history = db.prepare(
    'SELECT * FROM application_history WHERE application_id = ? ORDER BY changed_at ASC'
  ).all(_req.params.id);
  res.json(history);
});

// ── Users ──────────────────────────────────────────────────────────────────

router.get('/users', authenticate, requireAdmin, (_req: AuthRequest, res: Response): void => {
  const users = db.prepare("SELECT id, email, full_name, role, suspended, email_verified, is_super_admin, last_login_at, last_login_ip, created_at FROM users").all();
  res.json(users);
});

router.get('/users/:id/login-logs', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const logs = db.prepare(
    'SELECT id, email, ip, user_agent, success, created_at FROM login_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 30'
  ).all(req.params.id);
  res.json(logs);
});

router.post('/users/create-admin', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ message: 'Only Super Admins can create admin accounts.' });
    return;
  }
  const { email, full_name, password } = req.body;
  if (!email || !full_name || !password) { res.status(400).json({ message: 'Email, full name and password are required' }); return; }
  if (password.length < 8) { res.status(400).json({ message: 'Password must be at least 8 characters' }); return; }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) { res.status(409).json({ message: 'Email already registered' }); return; }
  const id = uuidv4();
  const hashed = require('bcryptjs').hashSync(password, 10);
  db.prepare('INSERT INTO users (id, email, password, full_name, role, email_verified) VALUES (?, ?, ?, ?, ?, 1)')
    .run(id, email, hashed, full_name, 'admin');
  logAudit(req.user!.id, getAdminName(req.user!.id), 'create_admin', 'user', id,
    `Created admin account for ${full_name} (${email})`);
  res.status(201).json({ message: 'Admin account created', id, email, full_name, role: 'admin' });
});

router.post('/users/create-agent', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ message: 'Only Super Admins can create agent accounts.' });
    return;
  }
  const { email, full_name, password } = req.body;
  if (!email || !full_name || !password) { res.status(400).json({ message: 'Email, full name and password are required' }); return; }
  if (password.length < 8) { res.status(400).json({ message: 'Password must be at least 8 characters' }); return; }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) { res.status(409).json({ message: 'Email already registered' }); return; }
  const id = uuidv4();
  const hashed = require('bcryptjs').hashSync(password, 10);
  db.prepare('INSERT INTO users (id, email, password, full_name, role, email_verified) VALUES (?, ?, ?, ?, ?, 1)')
    .run(id, email, hashed, full_name, 'agent');
  logAudit(req.user!.id, getAdminName(req.user!.id), 'create_agent', 'user', id,
    `Created agent account for ${full_name} (${email})`);
  res.status(201).json({ message: 'Agent account created', id, email, full_name, role: 'agent' });
});

router.patch('/users/:id/suspend', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { suspended } = req.body;
  const target = db.prepare('SELECT id, role, full_name, email FROM users WHERE id = ?').get(req.params.id) as any;
  if (!target) { res.status(404).json({ message: 'User not found' }); return; }
  if (target.role === 'admin') { res.status(403).json({ message: 'Cannot suspend admin accounts' }); return; }
  db.prepare('UPDATE users SET suspended = ? WHERE id = ?').run(suspended ? 1 : 0, req.params.id);
  logAudit(req.user!.id, getAdminName(req.user!.id), suspended ? 'suspend_user' : 'unsuspend_user', 'user', req.params.id,
    `${suspended ? 'Suspended' : 'Unsuspended'} user ${target.full_name} (${target.email})`);
  res.json({ message: suspended ? 'User suspended' : 'User unsuspended' });
});

router.delete('/users/:id', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ message: 'Only Super Admins can permanently delete users.' });
    return;
  }
  const target = db.prepare('SELECT id, role, full_name, email, is_super_admin FROM users WHERE id = ?').get(req.params.id) as any;
  if (!target) { res.status(404).json({ message: 'User not found' }); return; }
  if (req.params.id === req.user!.id) { res.status(400).json({ message: 'You cannot delete your own account.' }); return; }
  if (target.is_super_admin === 1) { res.status(403).json({ message: 'Super Admin accounts cannot be deleted.' }); return; }

  try {
    logAudit(req.user!.id, getAdminName(req.user!.id), 'delete_user', 'user', req.params.id,
      `Deleted user ${target.full_name} (${target.email})`);

    // Delete in dependency order so FK references don't block
    db.prepare('DELETE FROM appointments WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM messages WHERE application_id IN (SELECT id FROM applications WHERE user_id = ?)').run(req.params.id);
    db.prepare('DELETE FROM messages WHERE sender_id = ?').run(req.params.id);
    db.prepare('DELETE FROM csat_surveys WHERE application_id IN (SELECT id FROM applications WHERE user_id = ?)').run(req.params.id);
    db.prepare('DELETE FROM csat_surveys WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM passport_expiry_reminders WHERE application_id IN (SELECT id FROM applications WHERE user_id = ?)').run(req.params.id);
    db.prepare('DELETE FROM application_history WHERE application_id IN (SELECT id FROM applications WHERE user_id = ?)').run(req.params.id);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM applications WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM login_logs WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

    res.json({ message: 'User and all associated data deleted' });
  } catch (err: any) {
    console.error('[Delete User] Error:', err.message);
    res.status(500).json({ message: `Delete failed: ${err.message}` });
  }
});

// Toggle super-admin status (super admin only)
router.patch('/users/:id/set-super-admin', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ message: 'Only Super Admins can promote or demote other admins.' });
    return;
  }
  if (req.params.id === req.user!.id) {
    res.status(400).json({ message: 'You cannot change your own super admin status.' });
    return;
  }
  const target = db.prepare('SELECT id, role, full_name, email, is_super_admin FROM users WHERE id = ?').get(req.params.id) as any;
  if (!target) { res.status(404).json({ message: 'User not found' }); return; }
  if (target.role !== 'admin') { res.status(400).json({ message: 'Only admin accounts can be promoted.' }); return; }
  const newVal = target.is_super_admin ? 0 : 1;
  db.prepare('UPDATE users SET is_super_admin = ? WHERE id = ?').run(newVal, req.params.id);
  logAudit(req.user!.id, getAdminName(req.user!.id),
    newVal ? 'promote_super_admin' : 'demote_super_admin', 'user', req.params.id,
    `${newVal ? 'Promoted' : 'Demoted'} ${target.full_name} (${target.email}) ${newVal ? 'to' : 'from'} Super Admin`);
  res.json({ message: newVal ? `${target.full_name} promoted to Super Admin` : `${target.full_name} demoted to Regular Admin` });
});

// ── Analytics ──────────────────────────────────────────────────────────────

router.get('/analytics', authenticate, requireAdmin, (_req: AuthRequest, res: Response): void => {
  const monthly = (db.prepare(`
    SELECT strftime('%Y-%m', submitted_at) as month, COUNT(*) as count
    FROM applications GROUP BY month ORDER BY month DESC LIMIT 6
  `).all() as any[]).reverse();
  const statusDist = db.prepare('SELECT status, COUNT(*) as count FROM applications GROUP BY status').all();
  const typeDist   = db.prepare('SELECT passport_type, COUNT(*) as count FROM applications GROUP BY passport_type').all();
  const avgProcessing = db.prepare(`
    SELECT AVG(julianday(reviewed_at) - julianday(submitted_at)) as avg_days
    FROM applications WHERE reviewed_at IS NOT NULL
  `).get() as any;
  const totalUsers = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role='applicant'").get() as any).count;
  res.json({
    monthly, statusDist, typeDist,
    avgProcessingDays: avgProcessing?.avg_days ? Math.round(avgProcessing.avg_days * 10) / 10 : null,
    totalUsers,
  });
});

// ── Audit log ──────────────────────────────────────────────────────────────

router.get('/audit-log', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const limit  = Math.min(parseInt((req.query.limit as string) || '100'), 200);
  const offset = parseInt((req.query.offset as string) || '0');
  const logs   = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total  = (db.prepare('SELECT COUNT(*) as count FROM audit_log').get() as any).count;
  res.json({ logs, total });
});

// ── Application assignment ─────────────────────────────────────────────────
router.patch('/applications/:id/assign', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { assigned_to } = req.body;
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!application) { res.status(404).json({ message: 'Application not found' }); return; }

  let assignedName: string | null = null;
  if (assigned_to) {
    const assignee = db.prepare('SELECT full_name, role FROM users WHERE id = ? AND role = ?').get(assigned_to, 'admin') as any;
    if (!assignee) { res.status(400).json({ message: 'Assignee must be an admin user' }); return; }
    assignedName = assignee.full_name;
  }

  db.prepare('UPDATE applications SET assigned_to = ?, assigned_name = ? WHERE id = ?')
    .run(assigned_to || null, assignedName, req.params.id);

  const adminName = getAdminName(req.user!.id);
  logAudit(req.user!.id, adminName, 'assign_application', 'application', req.params.id,
    assigned_to
      ? `Assigned ${application.application_number} to ${assignedName}`
      : `Unassigned ${application.application_number}`
  );

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ── Admin: mark express payment as received ───────────────────────────────
router.patch('/applications/:id/mark-payment', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!application) { res.status(404).json({ message: 'Application not found' }); return; }
  if (application.processing_tier !== 'express') {
    res.status(400).json({ message: 'No payment required for standard tier' }); return;
  }
  if (application.payment_status === 'paid') {
    res.status(400).json({ message: 'Payment already recorded' }); return;
  }

  db.prepare("UPDATE applications SET payment_status = 'paid' WHERE id = ?").run(req.params.id);

  const adminName = getAdminName(req.user!.id);
  logAudit(req.user!.id, adminName, 'mark_payment_received', 'application', req.params.id,
    `Marked $50 cash payment received for ${application.application_number}`);

  // Notify the agent/applicant that payment was confirmed
  notifyUser(
    application.user_id,
    `Payment of $50 has been confirmed by admin for application ${application.application_number}.`,
    'success',
    application.id,
  );

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ── Live support toggle ────────────────────────────────────────────────────
router.post('/applications/:id/toggle-support', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!application) { res.status(404).json({ message: 'Application not found' }); return; }

  const newVal = application.support_chat_open ? 0 : 1;
  db.prepare('UPDATE applications SET support_chat_open = ? WHERE id = ?').run(newVal, req.params.id);

  const adminName = getAdminName(req.user!.id);
  logAudit(req.user!.id, adminName,
    newVal ? 'open_live_support' : 'close_live_support',
    'application', req.params.id,
    `${newVal ? 'Opened' : 'Closed'} live support for ${application.application_number}`
  );

  if (newVal === 1) {
    notifyUser(
      application.user_id,
      `Live support has been activated for your application ${application.application_number}. You can now chat with an agent.`,
      'info', application.id,
    );
    emitToUser(application.user_id, 'support_activated', { application_id: application.id });
  }

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ── CSAT aggregate ─────────────────────────────────────────────────────────
router.get('/csat', authenticate, requireAdmin, (_req: AuthRequest, res: Response): void => {
  const aggregate = db.prepare(`
    SELECT
      COUNT(*) as total_responses,
      ROUND(AVG(CAST(rating AS REAL)), 2) as avg_rating,
      SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
      SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
      SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
      SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
      SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
    FROM csat_surveys
  `).get() as any;

  const totalDecided = (db.prepare(
    "SELECT COUNT(*) as count FROM applications WHERE status IN ('approved','rejected')"
  ).get() as any).count;
  const responseRate = totalDecided > 0 && aggregate.total_responses > 0
    ? Math.round((aggregate.total_responses / totalDecided) * 100)
    : 0;

  const recent = db.prepare(`
    SELECT cs.rating, cs.comment, cs.submitted_at,
           a.application_number, u.full_name as user_name
    FROM csat_surveys cs
    JOIN applications a ON cs.application_id = a.id
    JOIN users u ON cs.user_id = u.id
    ORDER BY cs.submitted_at DESC LIMIT 20
  `).all();

  res.json({ ...aggregate, response_rate: responseRate, recent });
});

// ── Debug: trigger expiry reminders manually ───────────────────────────────
router.post('/debug/run-expiry-reminders', authenticate, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  await runExpiryReminders();
  res.json({ message: 'Expiry reminder job completed. Check server logs and email inbox.' });
});

// ── Batch processing report ────────────────────────────────────────────────
router.get('/report', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { from, to, status, agent } = req.query as { from?: string; to?: string; status?: string; agent?: string };

  const fromDate = from || '2000-01-01';
  const toDate   = to   || new Date().toISOString().split('T')[0];

  const allStatuses = ['pending', 'processing', 'approved', 'rejected'];
  const statuses = status
    ? status.split(',').filter((s) => allStatuses.includes(s))
    : ['approved', 'rejected'];
  const placeholders = statuses.map(() => '?').join(',');

  // Optional agent filter
  const agentFilter = agent && agent !== 'all' ? agent : null;

  const applications = db.prepare(`
    SELECT a.id, a.application_number, a.full_name, a.email, a.phone,
           a.nationality, a.passport_type, a.status, a.passport_number,
           a.submitted_at, a.reviewed_at, a.admin_notes,
           a.issued_at, a.expires_at, a.assigned_name,
           a.processing_tier, a.payment_status, a.tier_price,
           a.agent_name, a.agent_id,
           u.email AS applicant_email
    FROM applications a
    JOIN users u ON a.user_id = u.id
    WHERE a.status IN (${placeholders})
      AND date(a.submitted_at) >= ?
      AND date(a.submitted_at) <= ?
      ${agentFilter ? 'AND a.agent_id = ?' : ''}
    ORDER BY a.submitted_at DESC
  `).all(...statuses, fromDate, toDate, ...(agentFilter ? [agentFilter] : [])) as any[];

  const byStatus: Record<string, number> = {};
  const byType:   Record<string, number> = {};
  const byAgent:  Record<string, number> = {};
  for (const a of applications) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    byType[a.passport_type] = (byType[a.passport_type] || 0) + 1;
    if (a.agent_name) {
      byAgent[a.agent_name] = (byAgent[a.agent_name] || 0) + 1;
    }
  }

  const approved = applications.filter((a) => a.status === 'approved');
  const rejected = applications.filter((a) => a.status === 'rejected');
  const reviewed  = approved.length + rejected.length;
  const approvalRate = reviewed > 0 ? Math.round((approved.length / reviewed) * 100) : 0;

  // Average processing days (submitted → reviewed)
  const processingTimes = applications
    .filter((a) => a.reviewed_at)
    .map((a) => (new Date(a.reviewed_at.replace(' ', 'T')).getTime() - new Date(a.submitted_at.replace(' ', 'T')).getTime()) / (1000 * 60 * 60 * 24));
  const avgDays = processingTimes.length
    ? Math.round((processingTimes.reduce((s, d) => s + d, 0) / processingTimes.length) * 10) / 10
    : null;

  // Express / payment stats
  const expressApps     = applications.filter((a) => a.processing_tier === 'express');
  const expressCount    = expressApps.length;
  const totalRevenue    = expressApps.filter((a) => a.payment_status === 'paid').reduce((s: number, a: any) => s + (a.tier_price || 0), 0);
  const pendingPayments = expressApps.filter((a) => a.payment_status !== 'paid').length;

  const adminName = getAdminName(req.user!.id);
  logAudit(req.user!.id, adminName, 'generate_report', 'system', null,
    `Generated batch report: ${fromDate} → ${toDate}, statuses: ${statuses.join(', ')}, agent: ${agentFilter || 'all'}, ${applications.length} records`
  );

  res.json({
    summary: {
      total: applications.length,
      byStatus,
      byType,
      byAgent,
      approvalRate,
      avgProcessingDays: avgDays,
      expressCount,
      totalRevenue,
      pendingPayments,
      dateRange: { from: fromDate, to: toDate },
      statuses,
      agentFilter: agentFilter || null,
      generatedAt: new Date().toISOString(),
      generatedBy: adminName,
    },
    applications,
  });
});

// ── Bulk broadcast message ─────────────────────────────────────────────────────
router.post('/bulk-message', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { message, filter_status, filter_tier } = req.body;
  if (!message?.trim()) {
    res.status(400).json({ message: 'Message is required.' });
    return;
  }

  let query = 'SELECT id, application_number, user_id FROM applications WHERE 1=1';
  const params: any[] = [];
  if (filter_status && filter_status !== 'all') { query += ' AND status = ?';           params.push(filter_status); }
  if (filter_tier   && filter_tier   !== 'all') { query += ' AND processing_tier = ?';  params.push(filter_tier); }

  const apps = db.prepare(query).all(...params) as any[];
  if (apps.length === 0) { res.json({ sent: 0 }); return; }

  const adminName = getAdminName(req.user!.id);
  let sent = 0;
  for (const app of apps) {
    db.prepare(`
      INSERT INTO messages (id, application_id, sender_id, sender_name, sender_role, content)
      VALUES (?, ?, ?, ?, 'admin', ?)
    `).run(uuidv4(), app.id, req.user!.id, adminName, message.trim());
    notifyUser(app.user_id, `💬 New message on application ${app.application_number}`, 'info', app.id);
    sent++;
  }

  logAudit(req.user!.id, adminName, 'bulk_message', 'applications', '',
    `Broadcast to ${sent} application(s). Filter: status=${filter_status || 'all'}, tier=${filter_tier || 'all'}. Preview: "${message.trim().slice(0, 80)}"`);

  res.json({ sent });
});

// ── Internal admin notes (private, not visible to applicant) ─────────────────
router.patch('/applications/:id/internal-notes', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const app = db.prepare('SELECT id FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!app) { res.status(404).json({ message: 'Application not found' }); return; }

  const { internal_notes } = req.body;
  db.prepare('UPDATE applications SET internal_notes = ? WHERE id = ?')
    .run(internal_notes?.trim() || null, req.params.id);
  res.json({ success: true });
});

// ── Admin tier override (standard ↔ express) ─────────────────────────────────
router.patch('/applications/:id/tier', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { tier } = req.body;
  if (!['standard', 'express'].includes(tier)) {
    res.status(400).json({ message: 'Tier must be standard or express' }); return;
  }

  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!app) { res.status(404).json({ message: 'Not found' }); return; }
  if (!['pending', 'processing'].includes(app.status)) {
    res.status(400).json({ message: 'Tier can only be changed on pending or processing applications' }); return;
  }
  if (app.processing_tier === tier) {
    res.status(400).json({ message: `Application is already on ${tier} tier` }); return;
  }
  if (app.payment_status === 'paid' && tier === 'standard') {
    res.status(400).json({ message: 'Cannot downgrade to standard after payment has been recorded' }); return;
  }

  const tierPrice     = tier === 'express' ? 50 : 0;
  const paymentStatus = tier === 'express' ? 'pending' : 'paid';
  db.prepare(`
    UPDATE applications SET processing_tier = ?, tier_price = ?, payment_status = ? WHERE id = ?
  `).run(tier, tierPrice, paymentStatus, app.id);

  const admin     = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.user!.id) as any;
  const adminName = admin?.full_name || req.user!.email;
  const tierLabel = tier === 'express' ? 'Express' : 'Standard';
  const histNotes = tier === 'standard'
    ? 'Admin changed processing tier to Standard (express fee waived)'
    : 'Admin upgraded processing tier to Express ($50 fee required)';

  db.prepare(`
    INSERT INTO application_history (id, application_id, status, admin_notes, changed_by, changed_by_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), app.id, app.status, histNotes, req.user!.id, adminName);

  notifyUser(
    app.user_id,
    tier === 'standard'
      ? `Your application ${app.application_number} has been moved to Standard processing — the $50 express fee has been waived.`
      : `Your application ${app.application_number} has been upgraded to Express processing — a $50 fee is now required.`,
    'info', app.id,
  );

  logAudit(req.user!.id, adminName, `set_tier_${tier}`, 'application', app.id,
    `Changed tier to ${tierLabel} for ${app.application_number}`);

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(app.id);
  res.json(updated);
});

// ── Scheduled Announcements ───────────────────────────────────────────────────
router.get('/announcements', authenticate, requireAdmin, (_req: AuthRequest, res: Response): void => {
  const list = db.prepare('SELECT * FROM announcements ORDER BY scheduled_at DESC').all();
  res.json(list);
});

router.post('/announcements', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { title, message, filter_status, filter_tier, scheduled_at } = req.body;
  if (!title?.trim() || !message?.trim() || !scheduled_at) {
    res.status(400).json({ message: 'Title, message and scheduled time are required' }); return;
  }
  const admin = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.user!.id) as any;
  const id = uuidv4();
  db.prepare(`
    INSERT INTO announcements (id, title, message, filter_status, filter_tier, scheduled_at, created_by, created_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, title.trim(), message.trim(),
    filter_status || 'all', filter_tier || 'all',
    scheduled_at,
    req.user!.id, admin?.full_name || req.user!.email
  );
  logAudit(req.user!.id, admin?.full_name || req.user!.email, 'create_announcement', 'announcement', id, `Scheduled "${title.trim()}" for ${scheduled_at}`);
  res.status(201).json(db.prepare('SELECT * FROM announcements WHERE id = ?').get(id));
});

router.delete('/announcements/:id', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const ann = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id) as any;
  if (!ann) { res.status(404).json({ message: 'Not found' }); return; }
  if (ann.sent_at) { res.status(400).json({ message: 'Cannot delete an already-sent announcement' }); return; }
  const admin = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.user!.id) as any;
  db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  logAudit(req.user!.id, admin?.full_name || req.user!.email, 'delete_announcement', 'announcement', req.params.id, `Cancelled "${ann.title}"`);
  res.json({ success: true });
});

export default router;
