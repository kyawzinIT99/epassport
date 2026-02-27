# E-Passport System — User Workflow

## Overview

The system has two actor types: **Applicant** (regular user) and **Admin** (government officer).
Both share the same login portal but see different dashboards.

---

## User Self-Registration Flow

```
  User visits /register
        │
        ▼
  ┌─────────────────────────────────────────┐
  │  Registration Form                      │
  │  • Full Name  (free text)               │
  │  • Email      (must be unique)          │
  │  • Password   (any, hashed before save) │
  └──────────────────┬──────────────────────┘
                     │  Submit
                     ▼
  ┌─────────────────────────────────────────┐
  │  Backend: POST /api/auth/register       │
  │                                         │
  │  1. Check email not already taken       │
  │  2. Hash password with bcrypt(10)       │
  │  3. INSERT into users table:            │
  │     ┌─────────────────────────────────┐ │
  │     │ id          → UUID (auto)       │ │
  │     │ email       → user's email      │ │
  │     │ password    → bcrypt hash       │ │
  │     │ full_name   → user's name       │ │
  │     │ role        → 'applicant'       │ │
  │     │ created_at  → current time      │ │
  │     └─────────────────────────────────┘ │
  │  4. Generate JWT token (7-day expiry)   │
  │  5. Return token + user object          │
  └──────────────────┬──────────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────────┐
  │  Frontend saves to localStorage:        │
  │  • token  → used in every API request   │
  │  • user   → displayed in Navbar         │
  └──────────────────┬──────────────────────┘
                     │
                     ▼
              Redirected to /dashboard
              Account is immediately active
              No email verification needed (dev mode)
              No admin approval needed
```

---

## User Password Management (Independent)

```
  User navigates to /profile  (click avatar in Navbar)
        │
        ├─── SECTION A: Update Name / Email
        │         │
        │         ▼
        │    ┌────────────────────────────────────────┐
        │    │  PATCH /api/auth/profile               │
        │    │                                        │
        │    │  Validates:                            │
        │    │  • name and email not empty            │
        │    │  • email not used by another account   │
        │    │                                        │
        │    │  On success:                           │
        │    │  • UPDATE users SET full_name, email   │
        │    │  • Updates localStorage 'user' key     │
        │    │  • Navbar avatar letter refreshes      │
        │    └────────────────────────────────────────┘
        │
        └─── SECTION B: Change Password
                  │
                  ▼
             ┌────────────────────────────────────────┐
             │  PATCH /api/auth/change-password        │
             │                                        │
             │  User provides:                        │
             │  • Current password  (verified first)  │
             │  • New password      (min 8 chars)     │
             │  • Confirm password  (matched frontend)│
             │                                        │
             │  Validates:                            │
             │  • current_password matches DB hash    │
             │  • new_password length >= 8            │
             │  • confirm match done in browser       │
             │                                        │
             │  On success:                           │
             │  • Hash new password with bcrypt(10)   │
             │  • UPDATE users SET password = hash    │
             │  • Form clears, success message shown  │
             │  • Existing JWT stays valid (no logout)│
             └────────────────────────────────────────┘
```

---

## Forgot Password / Reset Flow

```
  Login page → click "Forgot password?" link
        │
        ▼
  ┌─────────────────────────────────────────┐
  │  /forgot-password                       │
  │  • User enters email address            │
  │  • Clicks "Send Reset Link"             │
  └──────────────────┬──────────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────────┐
  │  POST /api/auth/forgot-password         │
  │                                         │
  │  1. Look up user by email               │
  │  2. If not found → still return success │
  │     (prevents email enumeration)        │
  │  3. Delete any previous tokens for user │
  │  4. Generate UUID token                 │
  │  5. Store in password_reset_tokens:     │
  │     ┌──────────────────────────────┐    │
  │     │ token      → UUID            │    │
  │     │ user_id    → user's id       │    │
  │     │ expires_at → now + 1 hour    │    │
  │     │ used       → 0 (false)       │    │
  │     └──────────────────────────────┘    │
  │  6. Send branded email via Nodemailer   │
  │     (dev: prints Ethereal preview URL) │
  └──────────────────┬──────────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────────┐
  │  User receives email with button:       │
  │  "Reset Password" → /reset-password     │
  │                    ?token=<uuid>        │
  └──────────────────┬──────────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────────┐
  │  /reset-password?token=<uuid>           │
  │  • New password + Confirm password form │
  └──────────────────┬──────────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────────┐
  │  POST /api/auth/reset-password          │
  │                                         │
  │  Validates:                             │
  │  • Token exists in DB                   │
  │  • Token not already used               │
  │  • Token not expired (expires_at check) │
  │  • New password length >= 8             │
  │                                         │
  │  On success:                            │
  │  • UPDATE users SET password = hash     │
  │  • Mark token used = 1                  │
  │  • Success message shown                │
  │  • Auto-redirect to /login after 3s     │
  │                                         │
  │  On failure:                            │
  │  • Expired → delete token, show error  │
  │  • Already used → show error            │
  │  • Invalid token → show error           │
  └─────────────────────────────────────────┘
```

---

## Where User Data Lives

```
  SQLite database:  backend/src/database/passport.db
                    (auto-created on first server start)

  users table
  ┌────────────────┬─────────────────────────────────────────────┐
  │ Column         │ Details                                     │
  ├────────────────┼─────────────────────────────────────────────┤
  │ id             │ UUID — unique per user, never changes       │
  │ email          │ Unique — login identifier                   │
  │ password       │ bcrypt hash — plain text never stored       │
  │ full_name      │ Display name — editable via /profile        │
  │ role           │ 'applicant' (default) or 'admin'            │
  │ created_at     │ Registration timestamp                      │
  └────────────────┴─────────────────────────────────────────────┘

  File location:  /Users/berry/Antigravity/E-passport/backend/
                  src/database/passport.db

  Inspect with:   npx @sqlite-viewer/app passport.db
                  or any SQLite browser (DB Browser for SQLite)
```

---

## Full System Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        E-PASSPORT SYSTEM                            │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐        ┌──────────────────────────────────────────┐
  │   APPLICANT  │        │               ADMIN OFFICER              │
  └──────┬───────┘        └────────────────────┬─────────────────────┘
         │                                     │
  ───────┼─────────────────────────────────────┼───────────────────────
  STEP 1 │  REGISTER / LOGIN                   │  LOGIN
  ───────┼─────────────────────────────────────┼───────────────────────
         │                                     │
         ▼                                     ▼
  ┌─────────────┐                     ┌─────────────────┐
  │  /register  │  ── or ──           │  /login         │
  │  /login     │                     │  (admin role)   │
  └──────┬──────┘                     └────────┬────────┘
         │                                     │
         ▼                                     ▼
  ┌─────────────┐                     ┌─────────────────┐
  │  /dashboard │                     │  /admin         │
  │  (My apps)  │                     │  (Admin panel)  │
  └──────┬──────┘                     └────────┬────────┘
         │                                     │
  ───────┼─────────────────────────────────────┼───────────────────────
  STEP 2 │  APPLY FOR PASSPORT                 │
  ───────┼─────────────────────────────────────┼───────────────────────
         │                                     │
         ▼                                     │
  ┌─────────────────────────────┐              │
  │  /apply                     │              │
  │  Fill in application form:  │              │
  │  • Full name                │              │
  │  • Date of birth            │              │
  │  • Nationality              │              │
  │  • Gender                   │              │
  │  • Place of birth           │              │
  │  • Address / phone / email  │              │
  │  • Passport type            │              │
  │    (regular / official /    │              │
  │     diplomatic)             │              │
  │  • Upload passport photo    │              │
  │  • Upload ID document       │              │
  └──────────────┬──────────────┘              │
                 │                             │
                 │  Submit                     │
                 ▼                             │
  ┌─────────────────────────────┐              │
  │  Application created with   │              │
  │  status: PENDING            │              │
  │  App number generated       │◄─────────────┤
  └──────────────┬──────────────┘              │
                 │                             │
  ───────────────┼─────────────────────────────┼───────────────────────
  STEP 3         │  ADMIN REVIEW               │
  ───────────────┼─────────────────────────────┼───────────────────────
                 │                             │
                 │                             ▼
                 │                   ┌──────────────────────┐
                 │                   │  Admin sees new app  │
                 │                   │  in Applications tab │
                 │                   │  Views:              │
                 │                   │  • Passport photo    │
                 │                   │  • ID document       │
                 │                   │  • All personal info │
                 │                   └──────────┬───────────┘
                 │                              │
                 │                   ┌──────────▼───────────┐
                 │                   │  Admin sets status:  │
                 │                   │                      │
                 │                   │  PROCESSING ──┐      │
                 │                   │  APPROVED  ───┤      │
                 │                   │  REJECTED  ───┤      │
                 │                   │               │      │
                 │                   │  + Admin notes│      │
                 │                   └───────────────┼──────┘
                 │                                   │
  ───────────────┼───────────────────────────────────┼───────────────────
  STEP 4         │  NOTIFICATIONS                    │
  ───────────────┼───────────────────────────────────┼───────────────────
                 │                                   │
                 │         ┌─────────────────────────┘
                 │         │  System sends:
                 │         │  • In-app notification (bell 🔔)
                 │         │  • Email notification (Ethereal preview)
                 │         │
                 │         └─────────────────┐
                 │                           ▼
                 │                 ┌───────────────────┐
                 │                 │  Applicant receives│
                 │                 │  notification      │
                 │◄────────────────┤  Clicks to view    │
                 │                 │  application status│
                 │                 └───────────────────┘
                 │
  ───────────────┼───────────────────────────────────────────────────────
  STEP 5         │  AFTER APPROVAL — DIGITAL PASSPORT
  ───────────────┼───────────────────────────────────────────────────────
                 │
                 ▼
  ┌──────────────────────────────────────────────────────┐
  │  /applications/:id   (status = approved)             │
  │                                                      │
  │  Digital Passport Certificate shows:                 │
  │  ┌────────────────────────────────────────────────┐  │
  │  │  🛂  Republic — E-Passport                     │  │
  │  │  ─────────────────────────────────────────     │  │
  │  │  [Photo]  Passport No.  | Nationality          │  │
  │  │           Full Name     | Gender               │  │
  │  │           Date of Birth | Place of Birth       │  │
  │  │           Date of Issue | Date of Expiry       │  │
  │  │  ─────────────────────────────────────────     │  │
  │  │  P<NATIONALITY<FULLNAME<<<<<<<<<<<<<<<<<<<<    │  │
  │  │  PASSPORTNO<NATION<DDDDDDSEXEXPIRY<<<<<<<<<    │  │
  │  │                                     [QR CODE]  │  │
  │  └────────────────────────────────────────────────┘  │
  │                                                      │
  │  Verification link: https://domain/verify/XXXXXXXX  │
  │  [Copy Link]  [Open ↗]  [Print / Save PDF]          │
  └──────────────────────────────────────────────────────┘
                 │
  ───────────────┼───────────────────────────────────────────────────────
  STEP 6         │  PUBLIC VERIFICATION (no login required)
  ───────────────┼───────────────────────────────────────────────────────
                 │
                 ▼
  ┌──────────────────────────────────────────────────────┐
  │  Anyone scans QR code or opens verify link           │
  │  /verify/:passport_number                            │
  │                                                      │
  │  Result A — VALID ✅                                  │
  │  Green card showing holder photo + all details       │
  │                                                      │
  │  Result B — EXPIRED ⚠️                                │
  │  Orange card showing expiry date                     │
  │                                                      │
  │  Result C — INVALID ❌                                │
  │  Red card — not found or not approved                │
  └──────────────────────────────────────────────────────┘
```

---

## Page Map

| Route | Who Can Access | Description |
|-------|---------------|-------------|
| `/register` | Public | Create new applicant account |
| `/login` | Public | Login (applicant or admin) |
| `/forgot-password` | Public | Request a password reset email |
| `/reset-password?token=` | Public (token required) | Set new password via reset link |
| `/dashboard` | Applicant | View all submitted applications + status timeline |
| `/apply` | Applicant | Submit new passport application |
| `/applications/:id` | Applicant (owner) | View status + digital certificate + print/PDF |
| `/profile` | All logged-in users | Update name/email, change password |
| `/admin` | Admin only | Review applications, manage users, view analytics |
| `/verify/:passport_number` | Public (no login) | Verify a passport by number or QR scan |

---

## Application Status Flow

```
  [Submitted]
       │
       ▼
  ┌─────────┐
  │ PENDING │  ──── Admin reviews ────►  ┌────────────┐
  └────┬────┘                            │ PROCESSING │
       │                                 └─────┬──────┘
       │                                       │
       │                          ┌────────────┴─────────────┐
       │                          │                          │
       │                          ▼                          ▼
       │                    ┌──────────┐              ┌──────────┐
       └───────────────────►│ APPROVED │              │ REJECTED │
                            └──────────┘              └──────────┘
                                 │
                                 ▼
                      Passport number generated
                      10-year validity period set
                      Digital certificate issued
                      QR verification link activated
```

---

## Admin Panel Tabs

```
  ┌─────────────────┬────────────────┬─────────────────┐
  │  Applications   │     Users      │    Analytics    │
  ├─────────────────┼────────────────┼─────────────────┤
  │ Filter by status│ All registered │ Monthly chart   │
  │ Click to review │ users table    │ Status bars     │
  │ View documents  │ Role badges    │ Type breakdown  │
  │ Update status   │ App count per  │ Approval rate   │
  │ Add admin notes │ user           │ Avg. proc. time │
  └─────────────────┴────────────────┴─────────────────┘
```

---

## Data Model Summary

```
  users
  ├── id, email, password (hashed), full_name, role, created_at

  applications
  ├── id, user_id (FK), application_number
  ├── status (pending / processing / approved / rejected)
  ├── personal info (name, dob, nationality, gender, ...)
  ├── photo_path, id_document_path
  ├── admin_notes, reviewed_at, reviewed_by
  └── passport_number, issued_at, expires_at  (set on approval)

  notifications
  ├── id, user_id (FK), message, type (info/success/error)
  ├── read (0/1), application_id (FK)
  └── created_at

  password_reset_tokens
  ├── token (UUID, primary key)
  ├── user_id (FK)
  ├── expires_at  (1 hour from creation)
  └── used (0/1 — single-use, invalidated after redemption)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express + TypeScript |
| Database | SQLite via better-sqlite3 |
| Auth | JWT (7-day tokens) + bcrypt passwords |
| File uploads | Multer (stored in `/backend/src/uploads/`) |
| Email | Nodemailer + Ethereal (dev preview) |
| Frontend | React 18 + TypeScript + Vite |
| Routing | React Router v6 |
| Styling | Tailwind CSS |
| QR Code | qrcode.react |
| HTTP client | Axios |
| Dev runner | Concurrently (runs both servers from root) |

---

## Running the System

```bash
# From project root — starts both backend (port 5001) and frontend (port 3000)
npm run dev

# Access on local machine
http://localhost:3000

# Access from phone on same WiFi (for QR code scanning)
http://<your-local-ip>:3000

# Default admin credentials
Email:    admin@epassport.gov
Password: Admin@123
```
