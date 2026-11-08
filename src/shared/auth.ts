// Name + 4-digit PIN login. PINs are hashed with PBKDF2; sessions are random
// tokens kept in a cookie, with only their SHA-256 hash stored in D1.

import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv, User } from './types';

const COOKIE = 'km_session';
const DEVICE_COOKIE = 'km_device';
const SESSION_HOURS = { google: 12, pin: 8 } as const;
export type LoginMethod = keyof typeof SESSION_HOURS;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const PBKDF2_ITERATIONS = 100_000; // Workers' maximum

const enc = new TextEncoder();
export const toB64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const isValidPin = (pin: string) => /^\d{4}$/.test(pin);

export async function hashPin(pin: string, saltB64?: string) {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return { hash: toB64(bits), salt: toB64(salt) };
}

function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sha256(s: string) {
  return toB64(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

type UserRow = User & {
  pin_hash: string;
  pin_salt: string;
  failed_logins: number;
  locked_until: string | null;
};

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'wrong' | 'locked'; minutes?: number };

/** Checks name + PIN, counting wrong attempts and locking after MAX_FAILED. */
export async function checkLogin(db: D1Database, name: string, pin: string): Promise<LoginResult> {
  const row = await db
    .prepare('SELECT * FROM users WHERE name = ? AND active = 1')
    .bind(name.trim())
    .first<UserRow>();
  if (!row || !row.pin_hash) return { ok: false, reason: 'wrong' };

  const now = Date.now();
  if (row.locked_until && Date.parse(row.locked_until) > now) {
    return { ok: false, reason: 'locked', minutes: Math.ceil((Date.parse(row.locked_until) - now) / 60000) };
  }

  const { hash } = await hashPin(pin, row.pin_salt);
  if (!sameString(hash, row.pin_hash)) {
    const failed = row.failed_logins + 1;
    const lock = failed >= MAX_FAILED ? new Date(now + LOCK_MINUTES * 60000).toISOString() : null;
    await db
      .prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
      .bind(lock ? 0 : failed, lock, row.id)
      .run();
    await audit(db, null, 'user', row.id, lock ? 'login_locked' : 'login_failed');
    return lock ? { ok: false, reason: 'locked', minutes: LOCK_MINUTES } : { ok: false, reason: 'wrong' };
  }

  await db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').bind(row.id).run();
  return { ok: true, user: { id: row.id, name: row.name, role: row.role, active: row.active } };
}

const randomToken = () => toB64(crypto.getRandomValues(new Uint8Array(32)));
const isHttps = (c: Context) => new URL(c.req.url).protocol === 'https:';

export async function startSession(c: Context<AppEnv>, user: User, method: LoginMethod) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_HOURS[method] * 3600_000);
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, method) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), user.id, expires.toISOString(), method)
    .run();
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: 'Lax',
    path: '/',
    expires,
  });
  await audit(c.env.DB, user.id, 'user', user.id, 'login', { method });
}

export async function endSession(c: Context<AppEnv>) {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  deleteCookie(c, COOKIE, { path: '/' });
}

// ---- Kitchen tablets: only devices an admin registered get the name + PIN screen.

export type Device = { id: number; name: string };

export async function getDevice(c: Context<AppEnv>): Promise<Device | null> {
  const token = getCookie(c, DEVICE_COOKIE);
  if (!token) return null;
  return c.env.DB.prepare('SELECT id, name FROM devices WHERE token_hash = ? AND revoked_at IS NULL')
    .bind(await sha256(token))
    .first<Device>();
}

export async function registerDevice(c: Context<AppEnv>, name: string) {
  const token = randomToken();
  const res = await c.env.DB.prepare('INSERT INTO devices (token_hash, name, created_by) VALUES (?, ?, ?)')
    .bind(await sha256(token), name, c.get('user')!.id)
    .run();
  setCookie(c, DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: 400 * 24 * 3600, // browsers cap cookies at 400 days
  });
  await audit(c.env.DB, c.get('user')!.id, 'device', Number(res.meta.last_row_id), 'register', { name });
}

/** Loads the logged-in user (if any) into c.var.user. */
export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  if (token) {
    const user = await c.env.DB.prepare(
      `SELECT u.id, u.name, u.role, u.active FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
      .bind(await sha256(token), new Date().toISOString())
      .first<User>();
    if (user) c.set('user', user);
  }
  await next();
};

/** Blocks cross-site form posts (belt and braces on top of SameSite cookies). */
export const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin) return c.text('Forbidden', 403);
  }
  await next();
};

export const requireLogin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) return c.redirect('/login');
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('user')?.role !== 'admin') return c.text('Only admins can do this.', 403);
  await next();
};

export async function audit(
  db: D1Database,
  userId: number | null,
  entity: string,
  entityId: string | number | null,
  action: string,
  details?: unknown,
) {
  await db
    .prepare('INSERT INTO audit_log (user_id, entity, entity_id, action, details) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, entity, entityId === null ? null : String(entityId), action, details === undefined ? null : JSON.stringify(details))
    .run();
}
