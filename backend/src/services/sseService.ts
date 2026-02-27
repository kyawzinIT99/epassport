import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/db';

// In-memory registry: userId → active SSE response streams
const clients = new Map<string, Set<Response>>();
// Track each user's role so we can broadcast to a role group
const userRoles = new Map<string, string>();

export function registerClient(userId: string, res: Response, role?: string): void {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
  if (role) userRoles.set(userId, role);
}

export function removeClient(userId: string, res: Response): void {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) {
    clients.delete(userId);
    userRoles.delete(userId);
  }
}

/** Push an SSE event to every connected user that has the given role. */
export function emitToRole(role: string, event: string, data: object): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [userId, userRole] of userRoles) {
    if (userRole !== role) continue;
    const userClients = clients.get(userId);
    if (!userClients) continue;
    for (const res of userClients) {
      try {
        res.write(payload);
      } catch {
        removeClient(userId, res);
      }
    }
  }
}

export function emitToUser(userId: string, event: string, data: object): void {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of userClients) {
    try {
      res.write(payload);
    } catch {
      removeClient(userId, res);
    }
  }
}

/**
 * Insert a notification into the DB and instantly push it to the user via SSE.
 */
export function notifyUser(
  userId: string,
  message: string,
  type: string,
  applicationId?: string | null,
): void {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO notifications (id, user_id, message, type, application_id) VALUES (?, ?, ?, ?, ?)',
  ).run(id, userId, message, type, applicationId ?? null);
  emitToUser(userId, 'notification', {
    id,
    user_id: userId,
    message,
    type,
    application_id: applicationId ?? null,
    read: 0,
    created_at: new Date().toISOString(),
  });
}
