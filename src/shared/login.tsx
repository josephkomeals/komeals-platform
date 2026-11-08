// Login (pick your name, type your 4-digit PIN), first-time setup, logout.

import { Hono } from 'hono';
import { Doc } from './layout';
import { audit, checkLogin, endSession, hashPin, isValidPin, startSession } from './auth';
import type { AppEnv } from './types';

const box = 'max-width:460px;margin:10vh auto 0;padding:28px';

function LoginPage(props: { names: string[]; error?: string; name?: string }) {
  return (
    <Doc title="Log in">
      <div class="card" style={box}>
        <h1 style="font-size:20px">
          KoMeals <span class="muted" style="font-weight:400">Platform</span>
        </h1>
        <p class="sub" style="margin-bottom:20px">Tap your name, then enter your PIN.</p>
        {props.error && (
          <p class="msg" role="alert">
            {props.error}
          </p>
        )}
        <form method="post" action="/login" style="display:flex;flex-direction:column;gap:14px">
          <fieldset class="names">
            <legend>Who are you?</legend>
            {props.names.map((n) => (
              <label class="name-tile">
                <input type="radio" name="name" value={n} required checked={n === props.name} />
                <span>{n}</span>
              </label>
            ))}
          </fieldset>
          <label>
            PIN
            <input
              name="pin"
              type="password"
              inputmode="numeric"
              pattern="\d{4}"
              maxlength={4}
              autocomplete="off"
              required
              style="letter-spacing:6px;font-size:18px"
            />
          </label>
          <button class="btn" type="submit" style="justify-content:center">
            Log in
          </button>
        </form>
      </div>
    </Doc>
  );
}

function SetupPage(props: { error?: string }) {
  return (
    <Doc title="Set up">
      <div class="card" style={box}>
        <h1 style="font-size:20px">Set up KoMeals Platform</h1>
        <p class="sub" style="margin-bottom:20px">
          No users yet. Create the first admin. You can add the rest of the team after logging in.
        </p>
        {props.error && (
          <p class="msg" role="alert">
            {props.error}
          </p>
        )}
        <form method="post" action="/setup" style="display:flex;flex-direction:column;gap:14px">
          <label>
            Your name
            <input name="name" required maxlength={60} />
          </label>
          <label>
            Choose a 4-digit PIN
            <input name="pin" type="password" inputmode="numeric" pattern="\d{4}" maxlength={4} required />
          </label>
          <button class="btn" type="submit" style="justify-content:center">
            Create admin
          </button>
        </form>
      </div>
    </Doc>
  );
}

const userCount = async (db: D1Database) =>
  (await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>())!.n;

const activeNames = async (db: D1Database) =>
  (await db.prepare('SELECT name FROM users WHERE active = 1 ORDER BY name').all<{ name: string }>()).results.map(
    (r) => r.name,
  );

export const loginRoutes = new Hono<AppEnv>();

loginRoutes.get('/login', async (c) => {
  if (c.get('user')) return c.redirect('/');
  if ((await userCount(c.env.DB)) === 0) return c.redirect('/setup');
  return c.html(<LoginPage names={await activeNames(c.env.DB)} />);
});

loginRoutes.post('/login', async (c) => {
  const form = await c.req.parseBody();
  const name = String(form.name ?? '');
  const pin = String(form.pin ?? '');
  const result = await checkLogin(c.env.DB, name, pin);
  if (!result.ok) {
    const error =
      result.reason === 'locked'
        ? `Too many wrong PINs. Try again in ${result.minutes} minutes, or ask an admin.`
        : 'That name and PIN don’t match.';
    return c.html(<LoginPage names={await activeNames(c.env.DB)} error={error} name={name} />, 401);
  }
  await startSession(c, result.user);
  return c.redirect('/');
});

loginRoutes.post('/logout', async (c) => {
  await endSession(c);
  return c.redirect('/login');
});

// First admin. Only works while the users table is empty.
loginRoutes.get('/setup', async (c) => {
  if ((await userCount(c.env.DB)) > 0) return c.redirect('/login');
  return c.html(<SetupPage />);
});

loginRoutes.post('/setup', async (c) => {
  if ((await userCount(c.env.DB)) > 0) return c.redirect('/login');
  const form = await c.req.parseBody();
  const name = String(form.name ?? '').trim();
  const pin = String(form.pin ?? '');
  if (!name || !isValidPin(pin)) return c.html(<SetupPage error="Enter a name and a 4-digit PIN." />, 400);
  const { hash, salt } = await hashPin(pin);
  // The WHERE NOT EXISTS guard stops two setup requests racing each other.
  const res = await c.env.DB.prepare(
    `INSERT INTO users (name, role, pin_hash, pin_salt)
     SELECT ?, 'admin', ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)`,
  )
    .bind(name, hash, salt)
    .run();
  if (!res.meta.changes) return c.redirect('/login');
  const user = { id: Number(res.meta.last_row_id), name, role: 'admin' as const, active: 1 };
  await audit(c.env.DB, user.id, 'user', user.id, 'create', { name, role: 'admin', via: 'first setup' });
  await startSession(c, user);
  return c.redirect('/');
});
