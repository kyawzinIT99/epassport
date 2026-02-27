import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// ── Resend client (lazy-init) ─────────────────────────────────────────────────
let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY!);
  return resendClient;
}

// ── SMTP transporter (Gmail / any SMTP provider) ──────────────────────────────
let smtpTransporter: nodemailer.Transporter | null = null;

function getSmtpTransporter(): nodemailer.Transporter {
  if (smtpTransporter) return smtpTransporter;
  smtpTransporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  });
  console.log(`📧 Email: SMTP mode via ${process.env.SMTP_HOST || 'smtp.gmail.com'}`);
  return smtpTransporter;
}

// ── Ethereal fallback (lazy-init) ─────────────────────────────────────────────
let etherealTransporter: nodemailer.Transporter | null = null;

async function getEtherealTransporter() {
  if (etherealTransporter) return etherealTransporter;
  const testAccount = await nodemailer.createTestAccount();
  etherealTransporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  console.log('📧 Email: Ethereal test mode — check server logs for preview URLs');
  return etherealTransporter;
}

function emailMode(): 'resend' | 'smtp' | 'ethereal' {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  return 'ethereal';
}

// Resend requires a verified "from" domain.
// Until you add a custom domain, use onboarding@resend.dev (delivers only to your own account email).
const FROM_ADDRESS = process.env.RESEND_FROM || 'E-Passport System <onboarding@resend.dev>';
const SMTP_FROM    = process.env.SMTP_FROM   || `"E-Passport System" <${process.env.SMTP_USER || 'noreply@epassport.gov'}>`;

// ── Shared HTML wrapper ───────────────────────────────────────────────────────
function htmlWrap(body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E-Passport System</title>
</head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0f1b3a 0%,#1a2744 55%,#1e3a6e 100%);border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;position:relative;overflow:hidden;">
      <!-- Gold accent line -->
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#c9a227,#f0c84a,#c9a227,transparent);"></div>
      <div style="display:inline-block;background:linear-gradient(135deg,#c9a227,#f0c84a);border-radius:14px;width:56px;height:56px;line-height:56px;font-size:28px;margin-bottom:12px;">🛂</div>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:0.5px;">E-Passport System</h1>
      <p style="color:#93c5fd;margin:4px 0 0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Secure Digital Identity Platform</p>
    </div>

    <!-- Body -->
    <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(26,39,68,0.08);">
      ${body}
      <hr style="border:none;border-top:1px solid #f3f4f6;margin:28px 0 16px;">
      <p style="color:#9ca3af;font-size:11px;margin:0;text-align:center;line-height:1.6;">
        This is an automated message from the E-Passport System. Please do not reply to this email.<br>
        &copy; ${new Date().getFullYear()} E-Passport System. All rights reserved.
      </p>
    </div>

    <!-- Footer spacer -->
    <div style="height:32px;"></div>
  </div>
</body>
</html>`;
}

// ── Generic send helper ───────────────────────────────────────────────────────
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const mode = emailMode();

  if (mode === 'resend') {
    const { error } = await getResend().emails.send({ from: FROM_ADDRESS, to, subject, html });
    if (error) { console.error('Resend error:', error); return false; }
    console.log(`📧 Email sent via Resend → ${to}`);
    return true;
  }

  if (mode === 'smtp') {
    const t = getSmtpTransporter();
    await t.sendMail({ from: SMTP_FROM, to, subject, html });
    console.log(`📧 Email sent via SMTP → ${to}`);
    return true;
  }

  // Ethereal fallback
  const t = await getEtherealTransporter();
  const info = await t.sendMail({ from: '"E-Passport System" <noreply@epassport.gov>', to, subject, html });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.log(`📧 Ethereal preview → ${previewUrl}`);
  return true;
}

// ── Status email ──────────────────────────────────────────────────────────────
const statusMessages: Record<string, { subject: string; body: string }> = {
  processing: {
    subject: '📋 Your passport application is being processed',
    body: 'Your passport application is now under review by our team. We will notify you once a decision has been made.',
  },
  approved: {
    subject: '✅ Congratulations! Your passport has been approved',
    body: 'Great news! Your passport application has been approved. You can now log in to view and download your digital passport certificate.',
  },
  rejected: {
    subject: '❌ Your passport application was not approved',
    body: 'Unfortunately, your passport application has not been approved at this time. Please log in to view the admin notes for more details, and you may re-apply after addressing the issues.',
  },
  pending: {
    subject: '⏳ Your passport application status has been updated',
    body: 'Your passport application status has been updated to pending.',
  },
};

export async function sendStatusEmail(
  toEmail: string,
  toName: string,
  applicationNumber: string,
  status: string,
  adminNotes?: string | null
) {
  try {
    const msg = statusMessages[status] || statusMessages.pending;
    const notesSection = adminNotes
      ? `<p style="background:#f9f9f9;padding:12px;border-left:4px solid #c9a227;margin:16px 0;font-style:italic;">${adminNotes}</p>`
      : '';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const statusIcon: Record<string, string> = { pending: '⏳', processing: '🔄', approved: '✅', rejected: '❌' };
    const statusColor: Record<string, string> = {
      pending: '#b45309', processing: '#1d4ed8', approved: '#065f46', rejected: '#991b1b',
    };
    const statusBg: Record<string, string> = {
      pending: '#fef3c7', processing: '#dbeafe', approved: '#d1fae5', rejected: '#fee2e2',
    };
    const icon = statusIcon[status] || '📋';
    const sColor = statusColor[status] || '#1a2744';
    const sBg = statusBg[status] || '#f3f4f6';

    const html = htmlWrap(`
      <p style="color:#374151;font-size:15px;margin-bottom:4px;">Dear <strong style="color:#1a2744;">${toName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-top:0;">${msg.body}</p>

      <!-- Status badge -->
      <div style="background:${sBg};border:1px solid ${sColor}33;border-radius:12px;padding:16px 20px;margin:20px 0;text-align:center;">
        <div style="font-size:32px;margin-bottom:6px;">${icon}</div>
        <p style="margin:0;color:${sColor};font-size:18px;font-weight:700;text-transform:capitalize;">${status}</p>
      </div>

      ${notesSection ? `
      <!-- Admin notes -->
      <div style="background:#fffbeb;border-left:4px solid #c9a227;border-radius:0 8px 8px 0;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#92400e;">Admin Notes</p>
        <p style="margin:0;color:#374151;font-size:13px;font-style:italic;">${notesSection.replace(/<[^>]+>/g, '')}</p>
      </div>` : ''}

      <!-- Application info -->
      <div style="background:linear-gradient(135deg,#f8faff,#f0f4ff);border:1px solid #e0e7ff;border-radius:12px;padding:16px 20px;margin:20px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;width:140px;">Application No.</td>
            <td style="padding:4px 0;color:#1a2744;font-size:13px;font-weight:700;font-family:monospace;">${applicationNumber}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Status</td>
            <td style="padding:4px 0;color:${sColor};font-size:13px;font-weight:700;text-transform:capitalize;">${icon} ${status}</td>
          </tr>
        </table>
      </div>

      <!-- CTA button -->
      <div style="text-align:center;margin-top:24px;">
        <a href="${frontendUrl}/dashboard"
           style="display:inline-block;background:linear-gradient(135deg,#1a2744,#243660);color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.3px;">
          View My Application →
        </a>
      </div>
    `);

    return await sendEmail(toEmail, `${msg.subject} — ${applicationNumber}`, html);
  } catch (err) {
    console.error('sendStatusEmail failed:', err);
    return null;
  }
}

// ── Password reset email ──────────────────────────────────────────────────────
export async function sendPasswordResetEmail(
  toEmail: string,
  toName: string,
  resetLink: string
) {
  try {
    const html = htmlWrap(`
      <p style="color:#374151;font-size:15px;margin-bottom:4px;">Dear <strong style="color:#1a2744;">${toName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-top:0;">We received a request to reset your password. Click the button below to set a new password.</p>

      <!-- Lock icon area -->
      <div style="text-align:center;margin:24px 0 20px;">
        <div style="display:inline-block;background:linear-gradient(135deg,#1a2744,#243660);border-radius:50%;width:60px;height:60px;line-height:60px;font-size:28px;">🔑</div>
      </div>

      <!-- Warning box -->
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;margin:16px 0;text-align:center;">
        <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">⏱ This link expires in <strong>1 hour</strong></p>
      </div>

      <!-- CTA button -->
      <div style="text-align:center;margin:24px 0;">
        <a href="${resetLink}"
           style="display:inline-block;background:linear-gradient(135deg,#1a2744,#243660);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.3px;">
          Reset Password →
        </a>
      </div>

      <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:16px;">
        If you did not request a password reset, you can safely ignore this email.<br>
        <strong>Never share this link with anyone.</strong>
      </p>
    `);

    return await sendEmail(toEmail, '🔑 Reset your E-Passport password', html);
  } catch (err) {
    console.error('sendPasswordResetEmail failed:', err);
    return null;
  }
}

// ── Email verification email ──────────────────────────────────────────────────
export async function sendVerificationEmail(
  toEmail: string,
  toName: string,
  verifyLink: string
) {
  try {
    const html = htmlWrap(`
      <p style="color:#374151;font-size:15px;margin-bottom:4px;">Dear <strong style="color:#1a2744;">${toName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-top:0;">Welcome to the E-Passport System! Please verify your email address to activate your account.</p>

      <!-- Welcome icon area -->
      <div style="text-align:center;margin:24px 0 20px;">
        <div style="display:inline-block;background:linear-gradient(135deg,#c9a227,#f0c84a);border-radius:50%;width:60px;height:60px;line-height:60px;font-size:28px;">✉️</div>
      </div>

      <!-- Info box -->
      <div style="background:linear-gradient(135deg,#f8faff,#f0f4ff);border:1px solid #e0e7ff;border-radius:10px;padding:14px 16px;margin:16px 0;text-align:center;">
        <p style="margin:0;color:#374151;font-size:13px;">One click to activate your E-Passport account</p>
        <p style="margin:6px 0 0;color:#6b7280;font-size:12px;">⏱ This link expires in <strong>24 hours</strong></p>
      </div>

      <!-- CTA button -->
      <div style="text-align:center;margin:24px 0;">
        <a href="${verifyLink}"
           style="display:inline-block;background:linear-gradient(135deg,#c9a227,#f0c84a);color:#0f1b3a;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.3px;">
          Verify Email Address →
        </a>
      </div>

      <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:16px;">
        If you did not create an account, you can safely ignore this email.
      </p>
    `);
    return await sendEmail(toEmail, '✅ Verify your E-Passport email address', html);
  } catch (err) {
    console.error('sendVerificationEmail failed:', err);
    return null;
  }
}
