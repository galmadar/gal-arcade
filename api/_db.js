// Shared by every function under /api. Underscored so Vercel does not route it.
import { createHash, timingSafeEqual } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export const KINDS = ['broken', 'wanted'];
export const STATUSES = ['new', 'in review', 'develop', 'done in production', 'declined'];

// Same list as GAMES in requests.html; a new game goes in both.
export const GAMES = ['cranes-game', 'rail-yard', 'gal-arcade'];

// The page is public, so every length is a rule here, not a maxlength attribute.
export const LIMITS = { game: 40, body: 2000, author: 60, comment: 1000, browser: 100 };

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let sql;

// The HTTP driver holds no socket, so one instance per cold start is all there is to reuse.
export function db() {
  if (!process.env.DATABASE_URL) throw new HttpError(500, 'The board is not configured.');
  if (!sql) sql = neon(process.env.DATABASE_URL);
  return sql;
}

export function body(req) {
  try {
    return req.body && typeof req.body === 'object' ? req.body : {};
  } catch {
    throw new HttpError(400, 'That request was not readable.');
  }
}

export function text(value, name, max) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) throw new HttpError(400, name + ' is required.');
  if (trimmed.length > max) throw new HttpError(400, name + ' is too long — ' + max + ' characters at most.');
  return trimmed;
}

export function oneOf(value, allowed, name) {
  if (!allowed.includes(value)) throw new HttpError(400, 'That is not a ' + name + ' this board knows.');
  return value;
}

export function requestId(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, 'That request id is not valid.');
  return n;
}

function digest(value) {
  return createHash('sha256').update(String(value), 'utf8').digest();
}

// Hashing both sides first makes the compared buffers the same 32 bytes whatever
// was sent, so neither the length nor the content of the real password leaks.
export function isAdmin(req) {
  const secret = process.env.ADMIN_PASSWORD;
  const given = req.headers['x-admin-password'];
  if (!secret || typeof given !== 'string' || given === '') return false;
  return timingSafeEqual(digest(given), digest(secret));
}

export function only(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  res.status(405).json({ error: 'That method is not allowed here.' });
  return false;
}

export async function handle(res, work) {
  try {
    await work();
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    // A row pointing at a request that no longer exists, or text the table's own
    // checks reject: the caller's problem, not the database being unreachable.
    if (err && err.code === '23503') {
      res.status(404).json({ error: 'That request is gone.' });
      return;
    }
    if (err && err.code === '23514') {
      res.status(400).json({ error: 'That does not fit what the board accepts.' });
      return;
    }
    console.error('board:', err && err.message);
    res.status(502).json({ error: 'The board could not reach its database. Try again in a moment.' });
  }
}
