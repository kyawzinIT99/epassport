# E-Passport System — Migration Guide
## From Local Dev → Production at Scale

---

## Current Architecture (Dev)

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR MACBOOK / LOCAL SERVER                 │
│                                                                 │
│   ┌──────────────────┐          ┌──────────────────────────┐   │
│   │   FRONTEND       │          │   BACKEND                │   │
│   │   React + Vite   │◄────────►│   Node.js + Express      │   │
│   │   port :3000     │  proxy   │   port :5001             │   │
│   └──────────────────┘          └───────────┬──────────────┘   │
│                                             │                  │
│                                  ┌──────────▼──────────┐       │
│                                  │  passport.db        │       │
│                                  │  (SQLite file)      │       │
│                                  └─────────────────────┘       │
│                                             │                  │
│                                  ┌──────────▼──────────┐       │
│                                  │  /src/uploads/      │       │
│                                  │  (local disk)       │       │
│                                  └─────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘

  ✅ Works great for:  dev, demo, portfolio, small office
  ❌ Breaks at:        simultaneous writes, server restarts,
                       multiple servers, file loss on crash
```

---

## Target Architecture (Production — 1M+ Users)

```
                         ┌─────────────────┐
                         │   CLOUDFLARE    │
                         │   DNS + WAF     │
                         │   DDoS protect  │
                         └────────┬────────┘
                                  │
                         ┌────────▼────────┐
                         │  LOAD BALANCER  │
                         │  (Nginx / ALB)  │
                         └────┬───────┬────┘
                              │       │
               ┌──────────────┘       └──────────────┐
               │                                     │
      ┌────────▼────────┐                  ┌─────────▼───────┐
      │  BACKEND Node   │                  │  BACKEND Node   │
      │  Instance  #1   │                  │  Instance  #2   │
      │  (pm2 cluster)  │                  │  (pm2 cluster)  │
      └────────┬────────┘                  └────────┬────────┘
               │                                    │
               └──────────────┬─────────────────────┘
                              │
               ┌──────────────▼─────────────────────┐
               │                                    │
      ┌────────▼────────┐                ┌──────────▼──────┐
      │   POSTGRESQL    │                │  REDIS CACHE    │
      │   Primary DB    │                │  Sessions /     │
      │   + Replica     │                │  Rate limiting  │
      └─────────────────┘                └─────────────────┘
               │
      ┌────────▼────────┐
      │   AWS S3 /      │
      │   Cloudflare R2 │
      │   (File uploads)│
      └─────────────────┘

      ┌─────────────────┐
      │   FRONTEND      │
      │   Built static  │
      │   → Vercel /    │
      │   Netlify / CDN │
      └─────────────────┘
```

---

## Migration Map — What Changes

```
  CURRENT                         PRODUCTION
  ─────────────────────────────────────────────────────────────────

  better-sqlite3           ──►    PostgreSQL (pg driver)
  ┌──────────────────┐            ┌──────────────────────────────┐
  │ passport.db      │            │ Hosted DB options:           │
  │ single file      │            │  • Supabase (free tier)      │
  │ no concurrency   │            │  • Railway PostgreSQL        │
  │ local only       │            │  • AWS RDS                   │
  └──────────────────┘            │  • Neon (serverless pg)      │
                                  └──────────────────────────────┘

  /src/uploads/ (disk)     ──►    Object Storage
  ┌──────────────────┐            ┌──────────────────────────────┐
  │ Local files      │            │  • AWS S3                    │
  │ Lost on deploy   │            │  • Cloudflare R2 (free 10GB) │
  │ No CDN           │            │  • Supabase Storage          │
  │ Single server    │            │  Served via CDN globally     │
  └──────────────────┘            └──────────────────────────────┘

  Ethereal (fake SMTP)     ──►    Real Email Provider
  ┌──────────────────┐            ┌──────────────────────────────┐
  │ Test only        │            │  • SendGrid (100/day free)   │
  │ No real delivery │            │  • Resend (3000/month free)  │
  │ Preview URL only │            │  • AWS SES (cheapest bulk)   │
  └──────────────────┘            └──────────────────────────────┘

  Single process Node      ──►    Clustered / Containerized
  ┌──────────────────┐            ┌──────────────────────────────┐
  │ 1 CPU core used  │            │  pm2 cluster mode            │
  │ Crashes = down   │            │  or Docker + Railway         │
  │ No restarts      │            │  or AWS ECS / Fly.io         │
  └──────────────────┘            └──────────────────────────────┘

  Vite dev server          ──►    Static Build + CDN
  ┌──────────────────┐            ┌──────────────────────────────┐
  │ npm run dev      │            │  npm run build → dist/       │
  │ Dev only         │            │  Deploy to Vercel / Netlify  │
  │ Not optimized    │            │  Edge cached globally        │
  └──────────────────┘            └──────────────────────────────┘
```

---

## Database Migration — SQLite → PostgreSQL

### Step 1 — Install PostgreSQL driver

```
  backend/
  ├── Remove:   better-sqlite3
  └── Add:      pg  +  @types/pg
                (or use Prisma ORM for both)

  npm uninstall better-sqlite3 @types/better-sqlite3
  npm install pg @types/pg
```

### Step 2 — Schema (same tables, PostgreSQL syntax)

```sql
  SQLite                          PostgreSQL
  ─────────────────────────────────────────────────────────────
  TEXT PRIMARY KEY          ──►   UUID PRIMARY KEY DEFAULT gen_random_uuid()
  DATETIME DEFAULT          ──►   TIMESTAMPTZ DEFAULT NOW()
    CURRENT_TIMESTAMP
  INTEGER NOT NULL DEFAULT 0──►   BOOLEAN NOT NULL DEFAULT FALSE
  db.prepare().run()        ──►   pool.query('INSERT...', [values])
  db.prepare().get()        ──►   pool.query().then(r => r.rows[0])
  db.prepare().all()        ──►   pool.query().then(r => r.rows)
  PRAGMA table_info()       ──►   information_schema.columns
  strftime('%Y-%m', col)    ──►   TO_CHAR(col, 'YYYY-MM')
  julianday()               ──►   EXTRACT(EPOCH FROM (a - b))/86400
```

### Step 3 — Connection pool (replaces single db instance)

```
  BEFORE (db.ts)                  AFTER (db.ts)
  ┌──────────────────────┐        ┌──────────────────────────────┐
  │ new Database(path)   │        │ new Pool({                   │
  │                      │        │   connectionString:          │
  │ // sync, blocking    │        │     process.env.DATABASE_URL │
  │ db.prepare(sql).run()│        │ })                           │
  │ db.prepare(sql).get()│        │                              │
  │ db.prepare(sql).all()│        │ // async, non-blocking       │
  └──────────────────────┘        │ pool.query(sql, params)      │
                                  │   .then(r => r.rows)         │
                                  └──────────────────────────────┘
```

---

## File Upload Migration — Local → Cloudflare R2 (or AWS S3)

```
  CURRENT FLOW                    PRODUCTION FLOW
  ──────────────────────────────────────────────────────────────

  Browser                         Browser
     │                               │
     │  POST /api/applications        │  POST /api/applications
     │  multipart/form-data           │  multipart/form-data
     ▼                               ▼
  Multer (disk storage)           Multer (memory storage)
     │                               │
     │  saves to                     │  streams to
     ▼                               ▼
  /src/uploads/photo.jpg         S3 / R2 Bucket
     │                               │
     │  served as                    │  served as
     ▼                               ▼
  /uploads/photo.jpg             https://cdn.yourdomain.com/
  (same server)                  uploads/photo.jpg
                                 (CDN — global edge)
```

### Code change in upload.ts

```
  BEFORE                          AFTER
  ┌──────────────────────┐        ┌──────────────────────────────┐
  │ multer({             │        │ multer({ storage:            │
  │   storage:           │        │   multer.memoryStorage()     │
  │   multer.diskStorage │        │ })                           │
  │ })                   │        │                              │
  │                      │        │ // then in route:            │
  │ file saved to disk   │        │ await s3.putObject({         │
  │ path stored in DB    │        │   Bucket, Key, Body:         │
  │                      │        │   req.file.buffer            │
  └──────────────────────┘        │ })                           │
                                  │ // store S3 key in DB        │
                                  └──────────────────────────────┘
```

---

## Email Migration — Ethereal → Resend (or SendGrid)

```
  BEFORE (emailService.ts)        AFTER
  ┌──────────────────────┐        ┌──────────────────────────────┐
  │ nodemailer           │        │ Option A: Resend SDK         │
  │ + createTestAccount()│        │  npm install resend          │
  │                      │        │  resend.emails.send({...})   │
  │ Fake SMTP            │        │  Free: 3,000/month           │
  │ No real delivery     │        │                              │
  │ Preview URL logged   │        │ Option B: SendGrid           │
  │                      │        │  npm install @sendgrid/mail  │
  └──────────────────────┘        │  Free: 100/day               │
                                  │                              │
                                  │ Option C: AWS SES            │
                                  │  $0.10 per 1,000 emails      │
                                  │  Best for bulk               │
                                  └──────────────────────────────┘
```

---

## Deployment Options — Cheapest to Recommended

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  OPTION 1 — FREE TIER  (Good for demo / MVP)                    │
  │                                                                 │
  │  Frontend  →  Vercel         (free, auto-deploy from git)       │
  │  Backend   →  Railway        ($5/mo or free hobby)             │
  │  Database  →  Supabase       (free 500MB PostgreSQL)           │
  │  Files     →  Supabase Stor  (free 1GB)                        │
  │  Email     →  Resend         (free 3000/month)                 │
  │                                                                 │
  │  Total cost: $0 – $5/month                                      │
  └─────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────┐
  │  OPTION 2 — SMALL PRODUCTION  (Up to ~50K users)                │
  │                                                                 │
  │  Frontend  →  Vercel / Netlify  (free)                         │
  │  Backend   →  Fly.io            (~$5–10/mo, auto-scale)        │
  │  Database  →  Neon PostgreSQL   ($19/mo, serverless)           │
  │  Files     →  Cloudflare R2     (free 10GB, $0.015/GB after)   │
  │  Email     →  SendGrid          ($20/mo up to 50K/month)       │
  │  Cache     →  Upstash Redis     (free tier, serverless)        │
  │                                                                 │
  │  Total cost: ~$50/month                                         │
  └─────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────┐
  │  OPTION 3 — NATIONAL SCALE  (1M+ users)                         │
  │                                                                 │
  │  Frontend  →  AWS CloudFront + S3 static                       │
  │  Backend   →  AWS ECS (Docker containers, auto-scale)          │
  │  Database  →  AWS RDS PostgreSQL Multi-AZ + Read Replicas      │
  │  Files     →  AWS S3 + CloudFront CDN                          │
  │  Email     →  AWS SES ($0.10/1000 emails)                      │
  │  Cache     →  AWS ElastiCache Redis                            │
  │  Queue     →  AWS SQS (async jobs, email sending)              │
  │  Monitor   →  AWS CloudWatch / Datadog                         │
  │                                                                 │
  │  Total cost: $300–2000+/month depending on traffic              │
  └─────────────────────────────────────────────────────────────────┘
```

---

## Performance Numbers — What Each Setup Handles

```
  Setup                    Concurrent Users    Requests/sec    Uptime
  ─────────────────────────────────────────────────────────────────────
  SQLite + single Node     ~50                 ~200 r/s        manual
  PostgreSQL + single Node ~500                ~1,000 r/s      manual
  PostgreSQL + pm2 cluster ~2,000              ~5,000 r/s      auto-restart
  Docker + 3 instances     ~10,000             ~15,000 r/s     99.9%
  AWS ECS auto-scale       ~1,000,000+         ~500,000+ r/s   99.99%

  Note: "Concurrent users" means users actively clicking at the same second.
  Registered/stored users can be unlimited — that's just database rows.
```

---

## Migration Order (Recommended Steps)

```
  Phase 1 — Easiest wins  (1–2 days)
  ─────────────────────────────────────────────────────────────────
  [ ] 1. Replace Ethereal with Resend or SendGrid
         → swap 5 lines in emailService.ts
         → real emails start working immediately

  [ ] 2. Add environment variables properly
         → .env.example file with all keys documented
         → never commit real secrets

  [ ] 3. Build frontend for production
         → npm run build in /frontend
         → test that dist/ works correctly

  Phase 2 — Database  (2–4 days)
  ─────────────────────────────────────────────────────────────────
  [ ] 4. Create Supabase project (free)
         → get DATABASE_URL connection string

  [ ] 5. Run schema on PostgreSQL
         → copy CREATE TABLE statements
         → adjust syntax (see table above)

  [ ] 6. Swap better-sqlite3 → pg in db.ts
         → change all .prepare().run/.get/.all
         → to async pool.query()

  [ ] 7. Make all route handlers async/await
         → currently sync with SQLite
         → PostgreSQL is always async

  Phase 3 — Files  (1 day)
  ─────────────────────────────────────────────────────────────────
  [ ] 8. Create Cloudflare R2 bucket (free 10GB)
         → get R2 credentials

  [ ] 9. Swap multer diskStorage → memoryStorage
         → upload buffer to R2 via S3-compatible API
         → store R2 object key in DB instead of local path

  [  ] 10. Update image src URLs
          → /uploads/filename.jpg → https://cdn.domain.com/key

  Phase 4 — Deploy  (1–2 days)
  ─────────────────────────────────────────────────────────────────
  [ ] 11. Containerize backend with Dockerfile
          → FROM node:20-alpine
          → COPY, npm install, npm run build

  [ ] 12. Deploy backend to Railway or Fly.io
          → set all ENV variables in dashboard

  [ ] 13. Deploy frontend to Vercel
          → connect GitHub repo
          → auto-deploys on every push

  [ ] 14. Point domain → Vercel (frontend) + Railway (API)
          → update Vite proxy or use CORS properly in prod
```

---

## Files to Change (Code Map)

```
  backend/src/database/db.ts
  └── better-sqlite3 Database()  →  pg Pool()

  backend/src/middleware/upload.ts
  └── diskStorage                →  memoryStorage
                                    + R2/S3 upload helper

  backend/src/services/emailService.ts
  └── nodemailer + Ethereal      →  Resend / SendGrid SDK

  backend/src/routes/*.ts  (all route files)
  └── sync db calls              →  async/await pool.query()

  backend/.env
  └── Add:
      DATABASE_URL=postgresql://...
      R2_ACCOUNT_ID=...
      R2_ACCESS_KEY=...
      R2_SECRET_KEY=...
      R2_BUCKET=...
      RESEND_API_KEY=...
      JWT_SECRET=<strong-random-secret>

  frontend/.env.production
  └── VITE_API_URL=https://api.yourdomain.com
```

---

## Security Checklist Before Going Live

```
  [ ] Change JWT_SECRET from 'secret' to a 64-char random string
  [ ] Enable HTTPS (automatic on Vercel/Railway/Fly.io)
  [ ] Set CORS to only allow your frontend domain
  [ ] Add rate limiting on /api/auth/login  (prevent brute force)
  [ ] Add file type validation on uploads   (images only, max 5MB)
  [ ] Enable helmet.js for HTTP security headers
  [ ] Set up database connection SSL (enabled by default on Supabase)
  [ ] Add request logging (morgan) for audit trail
  [ ] Rotate admin default password  (Admin@123 → strong password)
  [ ] Add input sanitization on all text fields
```
