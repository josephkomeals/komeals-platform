// Login screens.
// - Office / anywhere: Sign in with Google (@komeals.com accounts linked to a user).
// - Registered kitchen tablet: tap your name, type your 4-digit PIN.
// Until Google sign-in is configured, the PIN screen works on any device so the first admin can get in.

import { Hono } from 'hono';
import { Doc } from './layout';
import { audit, checkLogin, endSession, getDevice, hashPin, isValidPin, startSession } from './auth';
import { googleConfigured } from './google';
import type { AppContext, AppEnv } from './types';

const box = 'max-width:460px;margin:10vh auto 0;padding:28px';

const ERRORS: Record<string, string> = {
  'google-failed': 'Google sign-in didn’t finish. Please try again.',
  'google-domain': 'Use your @komeals.com Google account.',
  'google-unknown': 'That Google account isn’t linked to a user yet. Ask an admin to add your email.',
  'google-off': 'Google sign-in isn’t set up yet.',
};

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
    <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>
);

function Title(props: { sub: string }) {
  return (
    <>
      <h1 style="font-size:20px">
        KoMeals <span class="muted" style="font-weight:400">Platform</span>
      </h1>
      <p class="sub" style="margin-bottom:20px">
        {props.sub}
      </p>
    </>
  );
}

function Error(props: { text?: string }) {
  return props.text ? (
    <p class="msg" role="alert">
      {props.text}
    </p>
  ) : null;
}

function GooglePage(props: { error?: string }) {
  return (
    <Doc title="Log in">
      <div class="card" style={box}>
        <Title sub="Sign in with your KoMeals Google account." />
        <Error text={props.error} />
        <a class="btn ghost" href="/auth/google" style="justify-content:center;gap:10px;width:100%;height:44px">
          <GoogleIcon /> Sign in with Google
        </a>
        <p class="muted" style="font-size:13px;margin:16px 0 0">
          Working in the kitchen? Use the kitchen tablet to log in with your PIN.
        </p>
      </div>
    </Doc>
  );
}

function PinPage(props: { names: string[]; error?: string; name?: string; device?: string; showGoogle: boolean }) {
  return (
    <Doc title="Log in">
      <div class="card" style={box}>
        <Title sub={props.device ? `${props.device}: tap your name, then enter your PIN.` : 'Tap your name, then enter your PIN.'} />
        {!props.device && (
          <p class="msg" style="background:var(--orange-soft);color:var(--orange)">
            Google sign-in isn’t set up yet, so PIN login works on any device for now.
          </p>
        )}
        <Error text={props.error} />
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
          <button class="btn" type="submit" style="justify-content:center;height:44px">
            Log in
          </button>
        </form>
        {props.showGoogle && (
          <p style="font-size:13px;margin:16px 0 0">
            <a href="/auth/google">Sign in with Google instead</a>
          </p>
        )}
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
        <Error text={props.error} />
        <form method="post" action="/setup" style="display:flex;flex-direction:column;gap:14px">
          <label>
            Your name
            <input name="name" required maxlength={60} />
          </label>
          <label>
            Your Google email (for Sign in with Google)
            <input name="email" type="email" required maxlength={120} />
          </label>
          <label>
            Choose a 4-digit PIN (for the kitchen tablet)
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

const pinNames = async (db: D1Database) =>
  (
    await db.prepare("SELECT name FROM users WHERE active = 1 AND pin_hash != '' ORDER BY name").all<{ name: string }>()
  ).results.map((r) => r.name);

export const loginRoutes = new Hono<AppEnv>();

/** PIN login is allowed on registered tablets, or anywhere until Google is configured. */
async function pinAllowed(c: AppContext) {
  const device = await getDevice(c);
  return { device, allowed: Boolean(device) || !googleConfigured(c.env) };
}

loginRoutes.get('/login', async (c) => {
  if (c.get('user')) return c.redirect('/');
  if ((await userCount(c.env.DB)) === 0) return c.redirect('/setup');
  const error = ERRORS[c.req.query('err') ?? ''];
  const { device, allowed } = await pinAllowed(c);
  if (!allowed) return c.html(<GooglePage error={error} />);
  return c.html(
    <PinPage names={await pinNames(c.env.DB)} error={error} device={device?.name} showGoogle={googleConfigured(c.env)} />,
  );
});

loginRoutes.post('/login', async (c) => {
  const { device, allowed } = await pinAllowed(c);
  if (!allowed) return c.redirect('/login');
  const form = await c.req.parseBody();
  const name = String(form.name ?? '');
  const pin = String(form.pin ?? '');
  const result = await checkLogin(c.env.DB, name, pin);
  if (!result.ok) {
    const error =
      result.reason === 'locked'
        ? `Too many wrong PINs. Try again in ${result.minutes} minutes, or ask an admin.`
        : 'That name and PIN don’t match.';
    return c.html(
      <PinPage names={await pinNames(c.env.DB)} error={error} name={name} device={device?.name} showGoogle={googleConfigured(c.env)} />,
      401,
    );
  }
  if (device) await c.env.DB.prepare("UPDATE devices SET last_used = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(device.id).run();
  await startSession(c, result.user, 'pin');
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
  const email = String(form.email ?? '').trim().toLowerCase();
  const pin = String(form.pin ?? '');
  if (!name || !email.includes('@') || !isValidPin(pin))
    return c.html(<SetupPage error="Enter a name, your Google email and a 4-digit PIN." />, 400);
  const { hash, salt } = await hashPin(pin);
  // The WHERE NOT EXISTS guard stops two setup requests racing each other.
  const res = await c.env.DB.prepare(
    `INSERT INTO users (name, email, role, pin_hash, pin_salt)
     SELECT ?, ?, 'admin', ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)`,
  )
    .bind(name, email, hash, salt)
    .run();
  if (!res.meta.changes) return c.redirect('/login');
  const user = { id: Number(res.meta.last_row_id), name, role: 'admin' as const, active: 1 };
  await audit(c.env.DB, user.id, 'user', user.id, 'create', { name, email, role: 'admin', via: 'first setup' });
  await startSession(c, user, 'pin');
  return c.redirect('/');
});
