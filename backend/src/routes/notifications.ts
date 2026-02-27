import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../database/db';
import { registerClient, removeClient } from '../services/sseService';

const router = Router();

// ── Real-time SSE stream ───────────────────────────────────────────────────
// EventSource cannot send Authorization headers, so we accept the JWT as a
// query param: GET /api/notifications/stream?token=<jwt>
router.get('/stream', (req: Request, res: Response): void => {
  const token = req.query.token as string | undefined;
  if (!token) { res.status(401).json({ message: 'No token' }); return; }

  let userId: string;
  let userRole: string;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: string; role: string };
    userId = decoded.id;
    userRole = decoded.role || 'applicant';
  } catch {
    res.status(401).json({ message: 'Invalid token' }); return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Send initial "connected" confirmation
  res.write('event: connected\ndata: {"status":"ok"}\n\n');

  registerClient(userId, res, userRole);

  // Keep-alive heartbeat every 25 s (SSE comments are ignored by clients)
  const heartbeat = setInterval(() => {
    try { res.write(':\n\n'); } catch { clearInterval(heartbeat); removeClient(userId, res); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(userId, res);
  });
});

// Get user notifications
router.get('/', authenticate, (req: AuthRequest, res: Response): void => {
  const notifications = db.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(req.user!.id);
  res.json(notifications);
});

// Mark one as read
router.patch('/:id/read', authenticate, (req: AuthRequest, res: Response): void => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user!.id);
  res.json({ success: true });
});

// Mark all as read
router.patch('/read-all', authenticate, (req: AuthRequest, res: Response): void => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ success: true });
});

export { router as notificationRouter };
