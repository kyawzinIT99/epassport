import { v4 as uuidv4 } from 'uuid';
import db from '../database/db';
import { sendStatusEmail, sendEmail } from './emailService';
import { notifyUser } from './sseService';

async function runAutoExpire(): Promise<void> {
  const expireDays = parseInt(process.env.AUTO_EXPIRE_DAYS || '30');
  if (expireDays <= 0) return;

  const cutoff = new Date(Date.now() - expireDays * 24 * 60 * 60 * 1000).toISOString();

  const expired = db.prepare(`
    SELECT a.*, u.email as user_email, u.full_name as user_name
    FROM applications a
    JOIN users u ON a.user_id = u.id
    WHERE a.status = 'pending' AND a.submitted_at < ?
  `).all(cutoff) as any[];

  if (expired.length === 0) return;

  for (const app of expired) {
    const notes = `Auto-rejected: no admin action within ${expireDays} days of submission.`;

    db.prepare(`
      UPDATE applications SET status = 'rejected', admin_notes = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(notes, app.id);

    db.prepare(`
      INSERT INTO application_history (id, application_id, status, admin_notes, changed_by, changed_by_name)
      VALUES (?, ?, 'rejected', ?, 'system', 'System (Auto-Expire)')
    `).run(uuidv4(), app.id, notes);

    notifyUser(
      app.user_id,
      `Your application ${app.application_number} was automatically closed after ${expireDays} days with no admin action.`,
      'error', app.id,
    );

    db.prepare(
      'INSERT INTO audit_log (id, admin_id, admin_name, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      uuidv4(), 'system', 'System (Auto-Expire)', 'auto_reject',
      'application', app.id,
      `Auto-rejected ${app.application_number} — pending for over ${expireDays} days`
    );

    sendStatusEmail(app.user_email, app.user_name, app.application_number, 'rejected', notes).catch(console.error);
  }

  console.log(`[Auto-Expire] Rejected ${expired.length} stale pending application(s).`);
}

// ── Passport expiry reminder job ───────────────────────────────────────────────
export async function runExpiryReminders(): Promise<void> {
  const thresholds = [90, 60, 30];
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  for (const days of thresholds) {
    const windowStart = new Date(Date.now() + (days - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const windowEnd   = new Date(Date.now() + days       * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const expiring = db.prepare(`
      SELECT a.*, u.email AS user_email, u.full_name AS user_name
      FROM applications a
      JOIN users u ON a.user_id = u.id
      WHERE a.status = 'approved'
        AND a.expires_at >= ? AND a.expires_at < ?
        AND NOT EXISTS (
          SELECT 1 FROM passport_expiry_reminders
          WHERE application_id = a.id AND days_before = ?
        )
    `).all(windowStart, windowEnd, days) as any[];

    for (const app of expiring) {
      const subject = `⚠️ Your passport expires in ${days} days — ${app.passport_number}`;
      const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f0f4ff;padding:32px;">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <div style="background:linear-gradient(135deg,#0f1b3a,#1a2744);padding:24px 28px;">
            <h1 style="color:#fff;margin:0;font-size:20px;">E-Passport Expiry Reminder</h1>
            <p style="color:#93c5fd;margin:4px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Passport Renewal Notice</p>
          </div>
          <div style="padding:28px;">
            <p style="color:#374151;">Dear <strong>${app.user_name}</strong>,</p>
            <p style="color:#6b7280;">Your passport <strong style="color:#1a2744;font-family:monospace;">${app.passport_number}</strong> will expire in <strong style="color:#dc2626;">${days} days</strong> on <strong>${app.expires_at}</strong>.</p>
            <div style="background:#fef3c7;border-left:4px solid #c9a227;border-radius:0 8px 8px 0;padding:14px 16px;margin:20px 0;">
              <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">We recommend starting your renewal application soon to avoid travel disruptions.</p>
            </div>
            <div style="text-align:center;margin-top:24px;">
              <a href="${frontendUrl}/dashboard" style="display:inline-block;background:linear-gradient(135deg,#1a2744,#243660);color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;">
                Start Renewal →
              </a>
            </div>
          </div>
        </div>
      </body></html>`;

      await sendEmail(app.user_email, subject, html).catch(console.error);

      db.prepare(`
        INSERT OR IGNORE INTO passport_expiry_reminders (id, application_id, days_before)
        VALUES (?, ?, ?)
      `).run(uuidv4(), app.id, days);

      notifyUser(
        app.user_id,
        `Your passport ${app.passport_number} expires in ${days} days (${app.expires_at}). Please consider renewing soon.`,
        'warning', app.id,
      );

      console.log(`[Expiry Reminder] Sent ${days}-day notice for ${app.passport_number} → ${app.user_email}`);
    }
  }
}

// ── Data retention job ─────────────────────────────────────────────────────
export async function runDataRetention(): Promise<void> {
  const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '0');
  if (retentionDays <= 0) return;

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  // Find rejected applications older than retentionDays
  const toDelete = db.prepare(`
    SELECT a.id, a.application_number, a.photo_path, a.id_document_path,
           u.id AS user_id, u.email AS user_email
    FROM applications a
    JOIN users u ON a.user_id = u.id
    WHERE a.status = 'rejected'
      AND a.reviewed_at IS NOT NULL
      AND a.reviewed_at < ?
  `).all(cutoff) as any[];

  if (toDelete.length === 0) return;

  const fs = require('fs');
  const path = require('path');
  const uploadsDir = path.join(__dirname, '..', 'uploads');

  for (const app of toDelete) {
    // Delete uploaded files from disk
    for (const filePath of [app.photo_path, app.id_document_path]) {
      if (filePath) {
        const fullPath = path.join(uploadsDir, filePath);
        try { fs.unlinkSync(fullPath); } catch { /* already gone */ }
      }
    }

    // Delete cascade: messages → history → notifications → application
    db.prepare('DELETE FROM messages WHERE application_id = ?').run(app.id);
    db.prepare('DELETE FROM application_history WHERE application_id = ?').run(app.id);
    db.prepare('DELETE FROM notifications WHERE application_id = ?').run(app.id);
    db.prepare('DELETE FROM passport_expiry_reminders WHERE application_id = ?').run(app.id);
    db.prepare('DELETE FROM applications WHERE id = ?').run(app.id);

    // Compliance audit entry
    db.prepare(
      'INSERT INTO audit_log (id, admin_id, admin_name, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      uuidv4(), 'system', 'System (Data Retention)',
      'data_retention_delete', 'application', app.id,
      `Auto-deleted rejected application ${app.application_number} (${app.user_email}) — exceeded ${retentionDays}-day retention policy`
    );
  }

  console.log(`[Data Retention] Deleted ${toDelete.length} rejected application(s) older than ${retentionDays} days.`);
}

// ── SLA breach checker ────────────────────────────────────────────────────────
export async function runSlaCheck(): Promise<void> {
  const standardDays = parseInt(process.env.SLA_STANDARD_DAYS || '15');
  const expressDays  = parseInt(process.env.SLA_EXPRESS_DAYS  || '3');

  for (const [tier, slaDays] of [['standard', standardDays], ['express', expressDays]] as [string, number][]) {
    const overdue = db.prepare(`
      SELECT id, application_number, full_name, assigned_to, processing_tier
      FROM applications
      WHERE status IN ('pending', 'processing')
        AND processing_tier = ?
        AND sla_notified_at IS NULL
        AND julianday('now') - julianday(submitted_at) > ?
    `).all(tier, slaDays) as any[];

    for (const app of overdue) {
      const tierLabel = tier === 'express' ? 'Express' : 'Standard';
      const msg = `⚠️ SLA Breach: ${app.application_number} (${app.full_name}) exceeded the ${slaDays}-day ${tierLabel} processing target.`;

      if (app.assigned_to) {
        notifyUser(app.assigned_to, msg, 'error', app.id);
      } else {
        const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND suspended = 0").all() as any[];
        for (const admin of admins) notifyUser(admin.id, msg, 'error', app.id);
      }

      db.prepare("UPDATE applications SET sla_notified_at = CURRENT_TIMESTAMP WHERE id = ?").run(app.id);
      console.log(`[SLA Check] Breach: ${app.application_number} (${tierLabel} >${slaDays}d)`);
    }
  }
}

// ── Express payment grace-period revert ───────────────────────────────────────
export async function runExpressPaymentRevert(): Promise<void> {
  const graceDays = parseInt(process.env.EXPRESS_PAYMENT_GRACE_DAYS || '0');
  if (graceDays <= 0) return;

  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000).toISOString();

  const unpaid = db.prepare(`
    SELECT a.*, u.email as user_email, u.full_name as user_name
    FROM applications a JOIN users u ON a.user_id = u.id
    WHERE a.processing_tier = 'express'
      AND (a.payment_status IS NULL OR a.payment_status != 'paid')
      AND a.status = 'pending'
      AND a.submitted_at < ?
  `).all(cutoff) as any[];

  if (unpaid.length === 0) return;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  for (const app of unpaid) {
    db.prepare(`
      UPDATE applications SET processing_tier = 'standard', tier_price = 0, payment_status = NULL WHERE id = ?
    `).run(app.id);

    db.prepare(`
      INSERT INTO application_history (id, application_id, status, admin_notes, changed_by, changed_by_name)
      VALUES (?, ?, 'pending', ?, 'system', 'System (Auto-Revert)')
    `).run(
      uuidv4(), app.id,
      `Auto-reverted from Express to Standard — express fee not received within ${graceDays} day(s).`
    );

    notifyUser(
      app.user_id,
      `Your application ${app.application_number} has been automatically moved to Standard processing — the express fee was not received within ${graceDays} day(s). No extra action needed.`,
      'info', app.id,
    );

    const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f0f4ff;padding:32px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:linear-gradient(135deg,#0f1b3a,#1a2744);padding:24px 28px;">
          <h1 style="color:#fff;margin:0;font-size:20px;">Processing Tier Update</h1>
          <p style="color:#93c5fd;margin:4px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Application Notice</p>
        </div>
        <div style="padding:28px;">
          <p style="color:#374151;">Dear <strong>${app.user_name}</strong>,</p>
          <p style="color:#6b7280;">Your application <strong style="color:#1a2744;font-family:monospace;">${app.application_number}</strong> has been automatically moved from <strong>Express</strong> to <strong>Standard</strong> processing because the express fee was not received within ${graceDays} day(s).</p>
          <div style="background:#d1fae5;border-left:4px solid #065f46;border-radius:0 8px 8px 0;padding:14px 16px;margin:20px 0;">
            <p style="margin:0;color:#065f46;font-size:13px;font-weight:600;">✅ No extra fee is required. Your application will continue under Standard processing at no additional cost.</p>
          </div>
          <div style="text-align:center;margin-top:24px;">
            <a href="${frontendUrl}/dashboard" style="display:inline-block;background:linear-gradient(135deg,#1a2744,#243660);color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;">
              View Application →
            </a>
          </div>
        </div>
      </div>
    </body></html>`;

    sendEmail(
      app.user_email,
      `Your application has been moved to Standard processing — ${app.application_number}`,
      html,
    ).catch(console.error);

    console.log(`[Express Revert] ${app.application_number} auto-reverted to Standard (unpaid >${graceDays}d).`);
  }
}

// ── Scheduled Announcement delivery ───────────────────────────────────────────
export async function runAnnouncementDelivery(): Promise<void> {
  const due = db.prepare(`
    SELECT * FROM announcements
    WHERE sent_at IS NULL AND scheduled_at <= datetime('now')
  `).all() as any[];

  for (const ann of due) {
    let query: string;
    const params: any[] = [];

    if (ann.filter_status === 'all' && ann.filter_tier === 'all') {
      query = "SELECT id, email, full_name FROM users WHERE role IN ('applicant', 'agent') AND suspended = 0";
    } else {
      query = `
        SELECT DISTINCT u.id, u.email, u.full_name
        FROM users u
        JOIN applications a ON a.user_id = u.id
        WHERE u.role IN ('applicant', 'agent') AND u.suspended = 0
      `;
      if (ann.filter_status !== 'all') { query += ' AND a.status = ?';          params.push(ann.filter_status); }
      if (ann.filter_tier   !== 'all') { query += ' AND a.processing_tier = ?'; params.push(ann.filter_tier); }
    }

    const recipients = db.prepare(query).all(...params) as any[];

    for (const user of recipients) {
      notifyUser(user.id, `📢 ${ann.title}: ${ann.message}`, 'info');
      sendEmail(
        user.email,
        `📢 ${ann.title}`,
        `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f0f4ff;padding:32px;">
          <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="background:linear-gradient(135deg,#0f1b3a,#1a2744);padding:24px 28px;">
              <h1 style="color:#fff;margin:0;font-size:20px;">📢 ${ann.title}</h1>
              <p style="color:#93c5fd;margin:4px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Official Announcement</p>
            </div>
            <div style="padding:28px;">
              <p style="color:#374151;">Dear <strong>${user.full_name}</strong>,</p>
              <p style="color:#6b7280;line-height:1.7;">${ann.message}</p>
            </div>
          </div>
        </body></html>`
      ).catch(console.error);
    }

    db.prepare('UPDATE announcements SET sent_at = CURRENT_TIMESTAMP, recipient_count = ? WHERE id = ?')
      .run(recipients.length, ann.id);
    console.log(`[Announcements] Delivered "${ann.title}" to ${recipients.length} recipients.`);
  }
}

export function startAutoExpireJob(): void {
  const expireDays = parseInt(process.env.AUTO_EXPIRE_DAYS || '30');
  if (expireDays <= 0) {
    console.log('[Auto-Expire] Disabled (AUTO_EXPIRE_DAYS=0).');
  } else {
    console.log(`[Auto-Expire] Job started — will reject pending applications older than ${expireDays} days.`);
    runAutoExpire();
  }
  runExpiryReminders();

  const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '0');
  if (retentionDays > 0) {
    console.log(`[Data Retention] Policy active — rejected applications deleted after ${retentionDays} days.`);
    runDataRetention();
  } else {
    console.log('[Data Retention] Disabled (DATA_RETENTION_DAYS=0).');
  }

  runSlaCheck();
  runAnnouncementDelivery();
  runExpressPaymentRevert();

  setInterval(() => {
    runAutoExpire();
    runExpiryReminders();
    runDataRetention();
    runSlaCheck();
    runExpressPaymentRevert();
  }, 60 * 60 * 1000); // every hour

  // Announcements checked every 5 minutes for timely delivery
  setInterval(() => {
    runAnnouncementDelivery();
  }, 5 * 60 * 1000);
}
