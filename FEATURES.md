# E-Passport System — Feature Inventory

**Status:** All 46 features implemented, tested, and confirmed working
**Live URL:** https://kyawzin-ccna--e-passport-serve.modal.run
**Stack:** React 18 + TypeScript + Vite (frontend) · Node.js + Express + TypeScript (backend) · SQLite (better-sqlite3) · Modal.com (cloud)

---

## Authentication & Identity

### 1. User Registration
Multi-field registration form (name, email, password) with real-time validation. Password confirmation check and strength enforcement. Rate-limited to 10 registrations per IP per hour.

### 2. Email Verification
Registration sends a branded verification email with a 24-hour tokenised link (`/verify/:token`). Account is locked until email is confirmed. Verified badge shown on profile.

### 3. Login with JWT
Email + password login. Returns a signed JWT stored in `sessionStorage`. Auto-redirect based on role (admin → AdminDashboard, agent → AgentDashboard, applicant → Dashboard). Rate-limited to 10 attempts per 15 minutes.

### 4. Forgot Password / Password Reset
"Forgot Password" form sends a branded reset email with a 1-hour token link. Reset page validates token, allows new password entry. Anti-enumeration: always returns generic success message regardless of whether email exists.

### 5. Profile Management
Applicants, agents, and admins can update their full name and change their password from the Profile page. Shows account creation date, role badge, and email-verified status.

### 6. Role-based Access Control
Three roles: `admin`, `agent`, `applicant`. Middleware enforces role on every protected route. Route guards on the frontend redirect unauthorised users. Super-admin flag for elevated privileges.

### 7. Account Suspension
Admins can suspend any non-super-admin account. Suspended users receive a 403 on next API call and are shown a suspension notice. Admins can unsuspend from the user management panel.

---

## Application Lifecycle

### 8. Multi-step Application Form
Three-step form: Personal Details → Contact & Documents → Upload Files. Progress indicator shows current step. Validates required fields before advancing. Pre-fills email from logged-in session.

### 9. Processing Tier Selection (Standard / Express)
Step 2 of the application form lets applicants choose Standard (free, 10–15 days) or Express ($50 fee, 24–72 hours). Card-style picker with clear pricing and timeline. Selection is persisted with the application.

### 10. File Upload (Photo + ID Document)
Multer middleware handles multipart uploads. Accepts JPEG, PNG, PDF up to 5 MB. UUID-named files stored in the uploads directory (persistent Volume in production). Photo and ID document are required before submission.

### 11. Application Submission & Number Generation
On submit the backend generates a unique `EP-YYYY-NNNNNN` application number, stores all fields, sets status to `pending`, and triggers an AI welcome message. Applicant is redirected to the ApplicationStatus page.

### 12. Application Status Page
Full-detail view: status banner with progress stepper (Pending → Processing → Approved), application details grid, admin notes, history timeline, express payment panel, uploaded document preview, queue position, and re-apply option.

### 13. Status History Timeline
Every status change is recorded in `application_history` with timestamp, changed-by name, and notes. Displayed as a vertical timeline with colour-coded dots on the ApplicationStatus page.

### 14. Admin Review & Status Update
Admins can set status to Processing, Approved, or Rejected from the review panel. Approval auto-generates a passport number, issue date, and 10-year expiry. All changes fire email + SSE notifications to the applicant.

### 15. Admin Notes
Free-text notes field on each application (visible to applicant on ApplicationStatus). Separate `internal_notes` field visible only to admins. Notes are preserved in history on each status change.

### 16. Digital Passport Certificate
Approved applications display a styled passport card (dark navy + gold, photo, MRZ strip, QR code, all personal data). "Print / Save PDF" button triggers browser print. QR code links to the public verification endpoint.

### 17. Public Passport Verification
`GET /api/verify/:passport_number` — no auth required. Returns holder name, nationality, photo, dates, and validity status. Used by the QR code on printed certificates. Accessible via `/verify/:passport_number` on the frontend.

---

## Notifications & Messaging

### 18. Real-time SSE Notifications
Server-Sent Events endpoint (`/api/notifications/stream`) pushes live notifications to connected clients. Navbar bell badge updates instantly. No polling required. Persistent across page navigation via a global event source.

### 19. In-app Notification Centre
Bell icon in the Navbar shows unread count (capped at "9+"). Dropdown lists all notifications with colour-coded icons (info/warning/error), relative timestamps, and click-to-navigate. Mark-all-read button.

### 20. Status Change Email Notifications
Branded HTML emails sent on every status change (pending → processing → approved/rejected). Uses Gmail SMTP (configured via `SMTP_*` env vars). Falls back to Ethereal preview if no SMTP config. Includes application number, status badge, admin notes, and CTA button.

### 21. In-app Messaging (Applicant ↔ Admin)
Chat-style message thread on ApplicationStatus (applicant) and the review panel (admin). Messages stored in `messages` table. New admin messages trigger SSE flash animation on the applicant's page. Full message history with timestamps and sender role.

### 22. Live Support Chat
Toggle button on ApplicationStatus opens a floating chat window for applicants. Admins see an "Open Live Support" toggle on the review panel. Support session is flagged in the database; chat persists with the application.

---

## Admin Tools

### 23. Admin Dashboard
Tabbed interface: Applications list · Analytics · CSAT · Appointments · Report Generator · Announcements. Stat bar shows Total / Pending / Processing / Approved / Rejected / Flagged / Express counts. Filter bar with status, tier, passport type, overdue, and search.

### 24. Application Assignment
Admins can assign any application to a specific admin or agent from the review panel. Assigned user receives an SSE notification. SLA breach alerts target the assigned user first.

### 25. SLA Breach Alerts
Cron job (`runSlaCheck`) runs hourly. Compares `submitted_at` against `SLA_STANDARD_DAYS` (default 15) and `SLA_EXPRESS_DAYS` (default 3). Sends SSE warning to assigned admin (or all admins). Records `sla_notified_at` to avoid duplicate alerts.

### 26. Bulk Broadcast Messages
Admin composes a message + selects status/tier filters. Backend fans out SSE + email to all matching applicants. Recipient count reported back to admin. Delivery is instant.

### 27. Scheduled Announcements
Admin composes a title, body, optional status/tier filter, and a future datetime. A 5-minute cron (`runAnnouncementDelivery`) delivers overdue announcements via SSE + branded email. History tab shows pending (with cancel) and sent announcements with recipient counts.

### 28. Internal Notes (Admin-only)
Separate text field on each application visible only in the admin review panel. Never exposed to the applicant. Stored in `internal_notes` column alongside public `admin_notes`.

### 29. AI-powered Application Review
Calls OpenAI to analyse the application data and return a structured recommendation (Approve / Review Needed / Reject) with a confidence score and reasoning bullet points. One-click "Run AI Review" button; result shown in the review panel.

### 30. Audit Log
Every admin action (status change, payment mark, tier change, user suspend, bulk broadcast, report generate, etc.) is written to `audit_log` with admin ID/name, action type, target type/ID, and detail text. Viewable from the admin report section.

### 31. Analytics Dashboard
Charts and KPIs: monthly application volume (bar chart), approval rate trend (line), status distribution (donut), nationality breakdown (bar), agent performance table, average processing days. Date-range filter.

### 32. CSAT (Customer Satisfaction)
After an application is decided, applicants see a 1–5 star rating widget + optional comment. Rating stored in `applications.csat_rating`. Admin analytics tab shows average rating, total ratings, and score distribution.

### 33. Report Generator
Admin selects date range + status filter → backend returns all matching applications. Rendered as a responsive table with responsive padding and horizontal scroll. "Print Report" button triggers print CSS for clean paper output. Summary stat cards (total, approval rate, avg days, express count, revenue).

---

## Express Tier Management

### 34. Express Payment Tracking
Express applications show an amber "Express Fee Due — $50" panel with payment instructions. Admin can click "Mark Payment as Received" to set `payment_status = 'paid'`. Panel turns green with a confirmation message.

### 35. Self-service Tier Downgrade (Applicant)
Inside the unpaid express payment panel, a "Switch to Standard Processing (Free)" button lets the applicant downgrade themselves. Guards: application must be `pending`, `express`, and unpaid. Triggers history entry and admin SSE notification.

### 36. Admin Tier Override
Admin review panel shows tier controls for all applications. "Upgrade to Express" (adds $50 pending fee) and "Switch to Standard" (clears fee) buttons with confirm dialogs. Guards against downgrading paid express apps. Triggers applicant SSE + history + audit log.

### 37. Auto-revert Express to Standard (Cron)
`runExpressPaymentRevert()` runs hourly. Finds express applications where fee was not paid within `EXPRESS_PAYMENT_GRACE_DAYS` (default 3). Automatically downgrades to Standard, sends branded email + SSE to applicant, writes history. Disabled if grace days = 0.

---

## Automation & Scheduled Jobs

### 38. Auto-expire Stale Applications
`runAutoExpire()` runs hourly. Rejects pending applications older than `AUTO_EXPIRE_DAYS` (default 30). Sends rejection email + SSE + audit entry. Configurable; disabled at 0.

### 39. Passport Expiry Reminders
`runExpiryReminders()` runs hourly. Sends reminder emails at 90, 60, and 30 days before expiry. Each threshold fires once (tracked in `passport_expiry_reminders`). Includes a "Start Renewal →" CTA.

### 40. Data Retention Policy
`runDataRetention()` runs hourly. Permanently deletes rejected applications older than `DATA_RETENTION_DAYS` (default 0 = disabled). Removes uploaded files from disk, cascades through all related tables. Compliance audit entry written for each deletion.

---

## Agent Portal

### 41. Agent Role & Portal
Agents have a dedicated AgentDashboard. They can submit applications on behalf of applicants (email-based lookup or create-on-submit). Agent name is attached to the application and visible in the admin review panel.

### 42. Appointment Scheduling (Agent)
Agents can book appointments for applicants: date, time, type (New Application / Renewal / Collection / Consultation), notes. Appointments stored in `appointments` table. Admin sees appointment details in the review panel and can update status (Scheduled / Completed / Cancelled / No Show).

---

## User Experience

### 43. Queue Position Tracker
`GET /api/applications/:id/queue-position` counts how many applications in the same tier were submitted before this one and are still pending/processing. Shown as a card on ApplicationStatus with a progress bar and estimated processing days. Dashboard cards show "🔢 Queue #N" badge.

### 44. Document Re-upload
Pending applicants can replace their photo or ID document without re-applying. `PATCH /api/applications/:id/documents` deletes old files from disk and saves the new ones. Admin receives an SSE notification. Success banner shown on the page.

### 45. Document Lightbox Preview
Photo and ID document thumbnails are clickable on both the applicant's ApplicationStatus and the admin's review panel. Clicking opens a full-screen dark overlay lightbox. Press ESC or click outside to close. PDFs open in a new tab instead.

### 46. Responsive Design (Mobile + Desktop)
Full audit and fix pass across all pages:
- **Login / Register:** Logo and heading scale down on mobile; card padding reduces from `px-8` to `px--5`
- **Apply form:** All 2-column grids stack to 1 column on mobile (`grid-cols-1 sm:grid-cols-2`)
- **Admin stat bar:** 7-column grid → `grid-cols-2 sm:grid-cols-4 lg:grid-cols-7`
- **Navbar notification dropdown:** Fixed `w-80` → `w-[calc(100vw-1rem)] sm:w-80` to prevent overflow
- **Application Details, Reapply modal:** Grid stacks on mobile
- **Chat bubbles:** Percentage-based max-width on mobile
- **Report table:** Responsive cell padding; horizontal scroll wrapper already in place
- **Analytics, CSAT, Express summary grids:** All responsive breakpoints added

---

## Infrastructure

| Component | Technology |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS |
| Backend | Node.js · Express · TypeScript |
| Database | SQLite (better-sqlite3) |
| Auth | JWT (jsonwebtoken) · bcryptjs |
| Email | Gmail SMTP (nodemailer) · Resend fallback · Ethereal test mode |
| File Uploads | Multer (disk storage) |
| Real-time | Server-Sent Events (SSE) |
| AI | OpenAI GPT (review) · Anthropic Claude (messaging) |
| SMS | Twilio (optional) |
| Deployment | Modal.com — single container, persistent Volume |
| DB Admin CLI | Python 3 (kzadmin.py) |

---

## Deployment

| Item | Value |
|---|---|
| Platform | Modal.com |
| Live URL | https://kyawzin-ccna--e-passport-serve.modal.run |
| Dashboard | https://modal.com/apps/kyawzin-ccna/main/deployed/e-passport |
| Persistent storage | modal.Volume `e-passport-data` → `/data/passport.db` + `/data/uploads/` |
| Redeploy command | `modal deploy deploy.py` |

---

*Generated 2026-02-28 · E-Passport System · All features verified in production*
