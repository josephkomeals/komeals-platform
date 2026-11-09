// Sign in with Google (OpenID Connect, authorization-code flow with PKCE).
// Only verified emails on ALLOWED_EMAIL_DOMAIN that belong to an active user can sign in.

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { audit, sha256, startSession, toB64 } from './auth';
import type { AppEnv, User } from './types';

const STATE_COOKIE = 'km_oauth';
const b64url = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = () => b64url(toB64(crypto.getRandomValues(new Uint8Array(32))));

export const googleConfigured = (env: AppEnv['Bindings']) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

const redirectUri = (url: string) => `${new URL(url).origin}/auth/google/callback`;

export const googleRoutes = new Hono<AppEnv>();

googleRoutes.get('/auth/google', async (c) => {
  if (!googleConfigured(c.env)) return c.redirect('/login?err=google-off');
  const state = random();
  const verifier = random();
  const challenge = b64url(await sha256(verifier));
  setCookie(c, STATE_COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/auth/google',
    maxAge: 600,
  });
  const q = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(c.req.url),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    hd: c.env.ALLOWED_EMAIL_DOMAIN, // hint only; checked again below
    prompt: 'select_account',
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
});

googleRoutes.get('/auth/google/callback', async (c) => {
  const saved = getCookie(c, STATE_COOKIE) ?? '';
  deleteCookie(c, STATE_COOKIE, { path: '/auth/google' });
  const [state, verifier] = saved.split('.');
  const code = c.req.query('code');
  if (!state || !verifier || !code || c.req.query('state') !== state) return c.redirect('/login?err=google-failed');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(c.req.url),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) return c.redirect('/login?err=google-failed');
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) return c.redirect('/login?err=google-failed');

  // The ID token came straight from Google's token endpoint over TLS, so its claims
  // can be read without checking the signature (OpenID Connect Core 3.1.3.7).
  const claims = JSON.parse(atob(id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
    aud: string;
    iss: string;
    exp: number;
    email?: string;
    email_verified?: boolean;
    hd?: string;
  };
  const domain = c.env.ALLOWED_EMAIL_DOMAIN.toLowerCase();
  const email = claims.email?.toLowerCase() ?? '';
  const valid =
    claims.aud === c.env.GOOGLE_CLIENT_ID &&
    ['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) &&
    claims.exp * 1000 > Date.now() &&
    claims.email_verified === true &&
    claims.hd?.toLowerCase() === domain &&
    email.endsWith(`@${domain}`);
  if (!valid) return c.redirect('/login?err=google-domain');

  const user = await c.env.DB.prepare('SELECT id, name, role, active FROM users WHERE email = ? AND active = 1')
    .bind(email)
    .first<User>();
  if (!user) {
    await audit(c.env.DB, null, 'user', null, 'login_failed', { method: 'google', email });
    return c.redirect('/login?err=google-unknown');
  }
  await startSession(c, user, 'google');
  return c.redirect('/');
});
