import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import db from '../database/db';
import { notifyUser, emitToRole, emitToUser } from '../services/sseService';
import { sendExpressPaymentGuidance, sendStandardWelcomeMessage } from '../services/aiMessageService';
import { sendSmsToUser } from '../services/smsService';

const router = Router();

// Generate application number
const generateAppNumber = (): string => {
  const year = new Date().getFullYear();
  const random = Math.floor(100000 + Math.random() * 900000);
  return `EP-${year}-${random}`;
};

// Submit new application
router.post(
  '/',
  authenticate,
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'id_document', maxCount: 1 },
  ]),
  (req: AuthRequest, res: Response): void => {
    const {
      full_name, date_of_birth, nationality, gender,
      place_of_birth, address, phone, email, passport_type, existing_passport_number,
      processing_tier,
    } = req.body;

    if (!full_name || !date_of_birth || !nationality || !gender || !place_of_birth || !address || !phone || !email) {
      res.status(400).json({ message: 'All personal details are required' });
      return;
    }
    if (!existing_passport_number?.trim()) {
      res.status(400).json({ message: 'Previous passport number is required.' });
      return;
    }

    // Block duplicate active applications (agents can submit multiple, one per client)
    if (req.user!.role !== 'agent') {
      const existing = db.prepare(
        "SELECT id, status FROM applications WHERE user_id = ? AND status IN ('pending', 'processing', 'approved', 'rejected') ORDER BY submitted_at DESC LIMIT 1"
      ).get(req.user!.id) as any;
      if (existing) {
        const msg = existing.status === 'rejected'
          ? 'Your previous application was rejected. Please use the "Reapply" button on your existing application to update and resubmit it.'
          : existing.status === 'approved'
          ? 'You already have an approved passport. You cannot submit a new application.'
          : 'You already have an application currently under review. Please wait for it to be processed before submitting a new one.';
        res.status(400).json({ message: msg });
        return;
      }
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const photoPath = files?.photo?.[0]?.filename || null;
    const idDocumentPath = files?.id_document?.[0]?.filename || null;

    const id = uuidv4();
    const applicationNumber = generateAppNumber();

    // Express tier pricing (mock payment — Stripe is a future step)
    const tier = processing_tier === 'express' ? 'express' : 'standard';
    const tierPrice = tier === 'express' ? 50 : 0;

    // Agent context
    const agentId   = req.user!.role === 'agent' ? req.user!.id : null;
    const agentUser = agentId ? db.prepare('SELECT full_name FROM users WHERE id = ?').get(agentId) as any : null;
    const agentName = agentUser?.full_name || null;

    db.prepare(`
      INSERT INTO applications (
        id, user_id, application_number, full_name, date_of_birth, nationality,
        gender, place_of_birth, address, phone, email, passport_type, photo_path, id_document_path,
        existing_passport_number, processing_tier, tier_price, payment_status, agent_id, agent_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.user!.id, applicationNumber, full_name, date_of_birth, nationality,
      gender, place_of_birth, address, phone, email, passport_type || 'regular', photoPath, idDocumentPath,
      existing_passport_number?.trim().toUpperCase() || null,
      tier, tierPrice, tier === 'express' ? 'pending' : 'paid', agentId, agentName
    );

    // Record initial history entry
    db.prepare(`
      INSERT INTO application_history (id, application_id, status, admin_notes, changed_by, changed_by_name)
      VALUES (?, ?, 'pending', NULL, ?, ?)
    `).run(uuidv4(), id, req.user!.id, agentName ? `Agent: ${agentName}` : 'Applicant');

    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as any;

    // Notify applicant / agent
    if (tier === 'express') {
      notifyUser(
        req.user!.id,
        `Your express application ${applicationNumber} has been submitted — priority processing within 24-72 hours.`,
        'success', id,
      );
    } else {
      notifyUser(
        req.user!.id,
        `Your application ${applicationNumber} has been submitted successfully. You will be notified when it is reviewed.`,
        'success', id,
      );
    }

    // Audit log for agent submissions
    if (agentId) {
      db.prepare(
        'INSERT INTO audit_log (id, admin_id, admin_name, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uuidv4(), agentId, agentName, 'agent_submit', 'application', id,
        `Agent ${agentName} submitted application ${applicationNumber} for ${full_name}`);
    }

    // SMS confirmation on submission
    sendSmsToUser(req.user!.id,
      `E-Passport: Your application ${applicationNumber} has been submitted successfully.`
    ).catch(console.error);

    // Notify all connected admins about the new submission in real-time
    // Send the full application object so the admin review panel has all fields available
    emitToRole('admin', 'new_application', application ?? {
      id,
      application_number: applicationNumber,
      full_name,
      nationality,
      passport_type: passport_type || 'regular',
      processing_tier: tier,
      status: 'pending',
      submitted_at: new Date().toISOString(),
    });

    // AI auto-reply — fire-and-forget for all non-agent submissions
    if (!agentId) {
      if (tier === 'express') {
        sendExpressPaymentGuidance(id, req.user!.id, full_name, applicationNumber)
          .catch((err) => console.error('[AI Message] express guidance failed:', err.message));
      } else {
        sendStandardWelcomeMessage(id, req.user!.id, full_name, applicationNumber)
          .catch((err) => console.error('[AI Message] standard welcome failed:', err.message));
      }
    }

    res.status(201).json(application);
  }
);

// GDPR: export all personal data as downloadable JSON
router.get('/export-data', authenticate, (req: AuthRequest, res: Response): void => {
  const user = db.prepare('SELECT id, email, full_name, role, created_at, last_login_at, last_login_ip FROM users WHERE id = ?').get(req.user!.id) as any;
  const applications = db.prepare('SELECT * FROM applications WHERE user_id = ?').all(req.user!.id) as any[];
  const appIds = applications.map((a) => a.id);
  let applicationHistory: any[] = [];
  if (appIds.length > 0) {
    const placeholders = appIds.map(() => '?').join(',');
    applicationHistory = db.prepare(`SELECT * FROM application_history WHERE application_id IN (${placeholders})`).all(...appIds) as any[];
  }
  const notifications = db.prepare(
    'SELECT id, message, type, read, created_at FROM notifications WHERE user_id = ?'
  ).all(req.user!.id);
  const loginHistory = db.prepare(
    'SELECT ip, user_agent, success, created_at FROM login_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'
  ).all(req.user!.id);

  const exportData = {
    exported_at: new Date().toISOString(),
    profile: user,
    applications,
    application_history: applicationHistory,
    notifications,
    login_history: loginHistory,
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="my-passport-data-${new Date().toISOString().split('T')[0]}.json"`);
  res.json(exportData);
});

// Get user's applications (agents see apps they submitted; applicants see their own)
router.get('/', authenticate, (req: AuthRequest, res: Response): void => {
  let applications;
  if (req.user!.role === 'agent') {
    applications = db.prepare(
      'SELECT * FROM applications WHERE agent_id = ? ORDER BY submitted_at DESC'
    ).all(req.user!.id);
  } else {
    applications = db.prepare(
      'SELECT * FROM applications WHERE user_id = ? ORDER BY submitted_at DESC'
    ).all(req.user!.id);
  }
  res.json(applications);
});

// Get single application
router.get('/:id', authenticate, (req: AuthRequest, res: Response): void => {
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!application) {
    res.status(404).json({ message: 'Application not found' });
    return;
  }
  if (application.user_id !== req.user!.id && req.user!.role !== 'admin' && application.agent_id !== req.user!.id) {
    res.status(403).json({ message: 'Access denied' });
    return;
  }
  res.json(application);
});

// Agent cash payment: mark express application as paid
router.patch('/:id/pay', authenticate, (req: AuthRequest, res: Response): void => {
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!application) { res.status(404).json({ message: 'Application not found' }); return; }

  // Only the submitting agent can record payment
  if (req.user!.role !== 'agent' || application.agent_id !== req.user!.id) {
    res.status(403).json({ message: 'Access denied' }); return;
  }
  if (application.processing_tier !== 'express') {
    res.status(400).json({ message: 'No payment required for standard tier' }); return;
  }
  if (application.payment_status === 'paid') {
    res.status(400).json({ message: 'Payment already recorded' }); return;
  }

  db.prepare("UPDATE applications SET payment_status = 'paid' WHERE id = ?").run(req.params.id);

  notifyUser(
    req.user!.id,
    `Cash payment of $50 recorded for application ${application.application_number}.`,
    'success',
    application.id,
  );

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Get application history (timeline)
router.get('/:id/history', authenticate, (req: AuthRequest, res: Response): void => {
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!application) { res.status(404).json({ message: 'Application not found' }); return; }
  if (application.user_id !== req.user!.id && req.user!.role !== 'admin' && application.agent_id !== req.user!.id) {
    res.status(403).json({ message: 'Access denied' }); return;
  }
  const history = db.prepare(
    'SELECT * FROM application_history WHERE application_id = ? ORDER BY changed_at ASC'
  ).all(req.params.id);
  res.json(history);
});

// Re-apply: edit a rejected application and resubmit
router.put(
  '/:id/reapply',
  authenticate,
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'id_document', maxCount: 1 },
  ]),
  (req: AuthRequest, res: Response): void => {
    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
    if (!application) { res.status(404).json({ message: 'Application not found' }); return; }
    if (application.user_id !== req.user!.id) { res.status(403).json({ message: 'Access denied' }); return; }
    if (application.status !== 'rejected') {
      res.status(400).json({ message: 'Only rejected applications can be resubmitted' }); return;
    }

    const {
      full_name, date_of_birth, nationality, gender,
      place_of_birth, address, phone, email, passport_type, existing_passport_number,
    } = req.body;

    if (!full_name || !date_of_birth || !nationality || !gender || !place_of_birth || !address || !phone || !email) {
      res.status(400).json({ message: 'All personal details are required' }); return;
    }
    const resolvedPrevPassport = existing_passport_number?.trim() || application.existing_passport_number;
    if (!resolvedPrevPassport) {
      res.status(400).json({ message: 'Previous passport number is required.' }); return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const photoPath = files?.photo?.[0]?.filename || application.photo_path;
    const idDocumentPath = files?.id_document?.[0]?.filename || application.id_document_path;

    db.prepare(`
      UPDATE applications SET
        full_name = ?, date_of_birth = ?, nationality = ?, gender = ?,
        place_of_birth = ?, address = ?, phone = ?, email = ?, passport_type = ?,
        photo_path = ?, id_document_path = ?,
        existing_passport_number = ?,
        status = 'pending', admin_notes = NULL,
        submitted_at = CURRENT_TIMESTAMP, reviewed_at = NULL, reviewed_by = NULL,
        passport_number = NULL, issued_at = NULL, expires_at = NULL
      WHERE id = ?
    `).run(
      full_name, date_of_birth, nationality, gender,
      place_of_birth, address, phone, email, passport_type || application.passport_type,
      photoPath, idDocumentPath,
      resolvedPrevPassport.toUpperCase(),
      application.id
    );

    // Record resubmission history
    db.prepare(`
      INSERT INTO application_history (id, application_id, status, admin_notes, changed_by, changed_by_name)
      VALUES (?, ?, 'pending', 'Application resubmitted by applicant', ?, ?)
    `).run(uuidv4(), application.id, req.user!.id, 'Applicant');

    const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(application.id);
    res.json(updated);
  }
);

// ── In-app messaging ──────────────────────────────────────────────────────────
router.get('/:id/messages', authenticate, (req: AuthRequest, res: Response): void => {
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!application) { res.status(404).json({ message: 'Not found' }); return; }
  if (application.user_id !== req.user!.id && req.user!.role !== 'admin' && application.agent_id !== req.user!.id) {
    res.status(403).json({ message: 'Access denied' }); return;
  }
  const messages = db.prepare(
    'SELECT * FROM messages WHERE application_id = ? ORDER BY created_at ASC'
  ).all(req.params.id);
  res.json(messages);
});

router.post('/:id/messages', authenticate, (req: AuthRequest, res: Response): void => {
  const { content } = req.body;
  if (!content?.trim()) { res.status(400).json({ message: 'Message cannot be empty' }); return; }
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!application) { res.status(404).json({ message: 'Not found' }); return; }
  if (application.user_id !== req.user!.id && req.user!.role !== 'admin' && application.agent_id !== req.user!.id) {
    res.status(403).json({ message: 'Access denied' }); return;
  }

  // Rate limit: applicants may send at most 5 messages per hour per application
  if (req.user!.role !== 'admin') {
    const recentCount = (db.prepare(
      "SELECT COUNT(*) as c FROM messages WHERE application_id = ? AND sender_id = ? AND created_at > datetime('now', '-1 hour')"
    ).get(req.params.id, req.user!.id) as any).c;
    if (recentCount >= 5) {
      res.status(429).json({ message: 'Message limit reached. You can send at most 5 messages per hour per application.' });
      return;
    }
  }

  const sender = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.user!.id) as any;
  const id = uuidv4();
  db.prepare(`
    INSERT INTO messages (id, application_id, sender_id, sender_name, sender_role, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, req.user!.id, sender?.full_name || req.user!.email, req.user!.role, content.trim());

  // Notify the other party
  if (req.user!.role !== 'admin') {
    // Applicant sent message — notify assigned admin or all admins
    if (application.assigned_to) {
      notifyUser(
        application.assigned_to,
        `New message from applicant on ${application.application_number}.`,
        'info', application.id,
      );
    } else {
      const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND suspended = 0").all() as any[];
      for (const admin of admins) {
        notifyUser(admin.id, `New message from applicant on ${application.application_number}.`, 'info', application.id);
      }
    }
  } else {
    // Admin sent message — notify applicant in real-time
    notifyUser(
      application.user_id,
      `An admin replied to your application ${application.application_number}.`,
      'info', application.id,
    );
  }

  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as any;

  // Push new_message SSE event directly to recipient's open tab so the chat updates without a reload
  const msgPayload = { application_id: req.params.id, message: msg };
  if (req.user!.role !== 'admin') {
    // Applicant/agent sent → push to assigned admin or all admins
    if (application.assigned_to) {
      emitToUser(application.assigned_to, 'new_message', msgPayload);
    } else {
      const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND suspended = 0").all() as any[];
      for (const admin of admins) emitToUser(admin.id, 'new_message', msgPayload);
    }
  } else {
    // Admin sent → push to applicant
    emitToUser(application.user_id, 'new_message', msgPayload);
  }

  res.status(201).json(msg);
});

// ── CSAT Survey ───────────────────────────────────────────────────────────────
router.get('/:id/csat', authenticate, (req: AuthRequest, res: Response): void => {
  const survey = db.prepare(
    'SELECT * FROM csat_surveys WHERE application_id = ? AND user_id = ?'
  ).get(req.params.id, req.user!.id);
  res.json(survey || null);
});

router.post('/:id/csat', authenticate, (req: AuthRequest, res: Response): void => {
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ message: 'Rating must be between 1 and 5' }); return;
  }
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!application) { res.status(404).json({ message: 'Application not found' }); return; }
  if (application.user_id !== req.user!.id && application.agent_id !== req.user!.id) {
    res.status(403).json({ message: 'Access denied' }); return;
  }
  if (!['approved', 'rejected'].includes(application.status)) {
    res.status(400).json({ message: 'Survey is only available after a decision has been made' }); return;
  }
  const existing = db.prepare(
    'SELECT id FROM csat_surveys WHERE application_id = ? AND user_id = ?'
  ).get(req.params.id, req.user!.id);
  if (existing) {
    res.status(409).json({ message: 'Survey already submitted for this application' }); return;
  }
  const id = uuidv4();
  db.prepare(`
    INSERT INTO csat_surveys (id, application_id, user_id, rating, comment) VALUES (?, ?, ?, ?, ?)
  `).run(id, req.params.id, req.user!.id, Number(rating), comment?.trim() || null);
  res.status(201).json({ message: 'Thank you for your feedback!' });
});

// ── Self-service tier downgrade (express → standard) ─────────────────────────
router.patch('/:id/downgrade-tier', authenticate, (req: AuthRequest, res: Response): void => {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!app) { res.status(404).json({ message: 'Not found' }); return; }
  if (app.user_id !== req.user!.id) { res.status(403).json({ message: 'Access denied' }); return; }
  if (app.status !== 'pending') {
    res.status(400).json({ message: 'Tier can only be changed on pending applications' }); return;
  }
  if (app.processing_tier !== 'express') {
    res.status(400).json({ message: 'Application is already on standard tier' }); return;
  }
  if (app.payment_status === 'paid') {
    res.status(400).json({ message: 'Cannot downgrade after express payment has been recorded' }); return;
  }

  db.prepare(`
    UPDATE applications SET processing_tier = 'standard', tier_price = 0, payment_status = NULL WHERE id = ?
  `).run(app.id);

  db.prepare(`
    INSERT INTO application_history (id, application_id, status, admin_notes, changed_by, changed_by_name)
    VALUES (?, ?, 'pending', 'Applicant switched from Express to Standard processing (fee waived)', ?, 'Applicant')
  `).run(uuidv4(), app.id, req.user!.id);

  if (app.assigned_to) {
    notifyUser(app.assigned_to, `Applicant switched ${app.application_number} from Express → Standard tier.`, 'info', app.id);
  } else {
    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND suspended = 0").all() as any[];
    for (const admin of admins) notifyUser(admin.id, `Applicant switched ${app.application_number} from Express → Standard tier.`, 'info', app.id);
  }

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(app.id);
  res.json(updated);
});

// ── Queue position ─────────────────────────────────────────────────────────────
router.get('/:id/queue-position', authenticate, (req: AuthRequest, res: Response): void => {
  const app = db.prepare(
    'SELECT id, status, processing_tier, submitted_at, user_id, agent_id FROM applications WHERE id = ?'
  ).get(req.params.id) as any;
  if (!app) { res.status(404).json({ message: 'Not found' }); return; }
  if (app.user_id !== req.user!.id && app.agent_id !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ message: 'Access denied' }); return;
  }
  if (!['pending', 'processing'].includes(app.status)) {
    res.json({ position: null, total: null, tier: app.processing_tier });
    return;
  }
  const ahead = (db.prepare(`
    SELECT COUNT(*) as cnt FROM applications
    WHERE status IN ('pending', 'processing')
      AND processing_tier = ?
      AND submitted_at < ?
  `).get(app.processing_tier, app.submitted_at) as any).cnt;

  const total = (db.prepare(`
    SELECT COUNT(*) as cnt FROM applications
    WHERE status IN ('pending', 'processing')
      AND processing_tier = ?
  `).get(app.processing_tier) as any).cnt;

  res.json({ position: ahead + 1, total, tier: app.processing_tier });
});

// ── Document re-upload (pending apps only) ────────────────────────────────────
router.patch(
  '/:id/documents',
  authenticate,
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'id_document', maxCount: 1 },
  ]),
  (req: AuthRequest, res: Response): void => {
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
    if (!app) { res.status(404).json({ message: 'Not found' }); return; }
    if (app.user_id !== req.user!.id) { res.status(403).json({ message: 'Access denied' }); return; }
    if (app.status !== 'pending') {
      res.status(400).json({ message: 'Documents can only be updated on pending applications' }); return;
    }
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files?.photo?.[0] && !files?.id_document?.[0]) {
      res.status(400).json({ message: 'Please upload at least one file' }); return;
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const uploadsDir = path.join(__dirname, '..', 'uploads');

    if (files?.photo?.[0]) {
      if (app.photo_path) {
        try { fs.unlinkSync(path.join(uploadsDir, app.photo_path)); } catch { /* already gone */ }
      }
      db.prepare('UPDATE applications SET photo_path = ? WHERE id = ?').run(files.photo[0].filename, app.id);
    }
    if (files?.id_document?.[0]) {
      if (app.id_document_path) {
        try { fs.unlinkSync(path.join(uploadsDir, app.id_document_path)); } catch { /* already gone */ }
      }
      db.prepare('UPDATE applications SET id_document_path = ? WHERE id = ?').run(files.id_document[0].filename, app.id);
    }

    // Notify assigned admin or all admins
    if (app.assigned_to) {
      notifyUser(app.assigned_to, `Applicant updated documents for ${app.application_number}.`, 'info', app.id);
    } else {
      const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND suspended = 0").all() as any[];
      for (const admin of admins) notifyUser(admin.id, `Applicant updated documents for ${app.application_number}.`, 'info', app.id);
    }

    const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(app.id);
    res.json(updated);
  }
);

export default router;
