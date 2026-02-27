import Database from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DATABASE_PATH || './src/database/passport.db';
const db = new Database(path.resolve(dbPath));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'applicant',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    application_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    full_name TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    nationality TEXT NOT NULL,
    gender TEXT NOT NULL,
    place_of_birth TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    passport_type TEXT NOT NULL DEFAULT 'regular',
    photo_path TEXT,
    id_document_path TEXT,
    admin_notes TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    reviewed_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    read INTEGER NOT NULL DEFAULT 0,
    application_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Seed admin user
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@epassport.gov');
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync('Admin@123', 10);
  db.prepare(
    'INSERT INTO users (id, email, password, full_name, role) VALUES (?, ?, ?, ?, ?)'
  ).run(uuidv4(), 'admin@epassport.gov', hashedPassword, 'System Administrator', 'admin');
  console.log('Admin user seeded: admin@epassport.gov / Admin@123');
}

// Add passport certificate columns to existing DB (safe migration)
const cols = (db.prepare("PRAGMA table_info(applications)").all() as any[]).map((c) => c.name);
if (!cols.includes('passport_number')) db.exec("ALTER TABLE applications ADD COLUMN passport_number TEXT");
if (!cols.includes('issued_at')) db.exec("ALTER TABLE applications ADD COLUMN issued_at TEXT");
if (!cols.includes('expires_at')) db.exec("ALTER TABLE applications ADD COLUMN expires_at TEXT");
// Enforce uniqueness at the DB level — only where a passport number is actually set
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_passport_number ON applications(passport_number) WHERE passport_number IS NOT NULL");
// Previous/existing passport number field (for renewals and duplicate detection)
if (!cols.includes('existing_passport_number')) db.exec("ALTER TABLE applications ADD COLUMN existing_passport_number TEXT");

// Add suspended column to users (safe migration)
const userCols = (db.prepare("PRAGMA table_info(users)").all() as any[]).map((c) => c.name);
if (!userCols.includes('suspended')) db.exec("ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0");
// Add is_super_admin column — the seeded admin is always super admin
if (!userCols.includes('is_super_admin')) db.exec("ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0");
db.prepare("UPDATE users SET is_super_admin = 1 WHERE email = 'admin@epassport.gov'").run();

// Password reset tokens table
db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Add email_verified to users — DEFAULT 1 so existing users stay active
const userCols2 = (db.prepare("PRAGMA table_info(users)").all() as any[]).map((c) => c.name);
if (!userCols2.includes('email_verified')) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1");
}

// Email verification tokens table
db.exec(`
  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);
// Safe migration: add 'used' column to existing DBs that predate this column
const evtCols = (db.prepare("PRAGMA table_info(email_verification_tokens)").all() as any[]).map((c) => c.name);
if (!evtCols.includes('used')) db.exec("ALTER TABLE email_verification_tokens ADD COLUMN used INTEGER NOT NULL DEFAULT 0");

// ── Application history (status change log) ───────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS application_history (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    status TEXT NOT NULL,
    admin_notes TEXT,
    changed_by TEXT,
    changed_by_name TEXT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id)
  );
`);

// ── Admin audit log ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    admin_name TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT 'application',
    target_id TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Login / IP logs ─────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS login_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    success INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Last-login columns on users (safe migration)
const userCols3 = (db.prepare("PRAGMA table_info(users)").all() as any[]).map((c) => c.name);
if (!userCols3.includes('last_login_at')) db.exec("ALTER TABLE users ADD COLUMN last_login_at DATETIME");
if (!userCols3.includes('last_login_ip'))  db.exec("ALTER TABLE users ADD COLUMN last_login_ip TEXT");

// ── Application assignment ────────────────────────────────────────────────────
const appCols2 = (db.prepare("PRAGMA table_info(applications)").all() as any[]).map((c) => c.name);
if (!appCols2.includes('assigned_to')) db.exec("ALTER TABLE applications ADD COLUMN assigned_to TEXT");
if (!appCols2.includes('assigned_name')) db.exec("ALTER TABLE applications ADD COLUMN assigned_name TEXT");

// ── Step 37: Express processing tier ─────────────────────────────────────────
const appCols3 = (db.prepare("PRAGMA table_info(applications)").all() as any[]).map((c) => c.name);
if (!appCols3.includes('processing_tier'))
  db.exec("ALTER TABLE applications ADD COLUMN processing_tier TEXT NOT NULL DEFAULT 'standard'");
if (!appCols3.includes('tier_price'))
  db.exec("ALTER TABLE applications ADD COLUMN tier_price INTEGER NOT NULL DEFAULT 0");
if (!appCols3.includes('payment_status'))
  db.exec("ALTER TABLE applications ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending'");

// ── Step 38: Agent columns on applications ────────────────────────────────────
const appCols4 = (db.prepare("PRAGMA table_info(applications)").all() as any[]).map((c) => c.name);
if (!appCols4.includes('agent_id'))
  db.exec("ALTER TABLE applications ADD COLUMN agent_id TEXT");
if (!appCols4.includes('agent_name'))
  db.exec("ALTER TABLE applications ADD COLUMN agent_name TEXT");

// ── Step 39: SMS opt-in on users ──────────────────────────────────────────────
const userCols4 = (db.prepare("PRAGMA table_info(users)").all() as any[]).map((c) => c.name);
if (!userCols4.includes('phone'))
  db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
if (!userCols4.includes('sms_opt_in'))
  db.exec("ALTER TABLE users ADD COLUMN sms_opt_in INTEGER NOT NULL DEFAULT 0");

// ── Step 40: CSAT surveys table + live support flag ───────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS csat_surveys (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(application_id, user_id)
  );
`);
const appCols5 = (db.prepare("PRAGMA table_info(applications)").all() as any[]).map((c) => c.name);
if (!appCols5.includes('support_chat_open'))
  db.exec("ALTER TABLE applications ADD COLUMN support_chat_open INTEGER NOT NULL DEFAULT 0");

// ── In-app messaging ──────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );
`);

// ── Passport expiry reminder tracking ────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS passport_expiry_reminders (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    days_before INTEGER NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(application_id, days_before),
    FOREIGN KEY (application_id) REFERENCES applications(id)
  );
`);

export default db;
