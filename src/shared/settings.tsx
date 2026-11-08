// Settings: manage users (admins only) and view the audit log.

import { Hono } from 'hono';
import { Shell } from './layout';
import { audit, getDevice, hashPin, isValidPin, registerDevice, requireAdmin } from './auth';
import type { AppEnv, Role, User } from './types';

const ROLES: Role[] = ['admin', 'manager', 'operator'];

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });

export const settingsRoutes = new Hono<AppEnv>();
settingsRoutes.use('*', requireAdmin);

settingsRoutes.get('/users', async (c) => {
  const users = (
    await c.env.DB.prepare(
      "SELECT id, name, email, role, active, locked_until, pin_hash != '' AS has_pin FROM users ORDER BY active DESC, name",
    ).all<User & { email: string | null; locked_until: string | null; has_pin: number }>()
  ).results;
  const devices = (
    await c.env.DB.prepare(
      `SELECT d.id, d.name, d.created_at, d.last_used, u.name AS by FROM devices d JOIN users u ON u.id = d.created_by
       WHERE d.revoked_at IS NULL ORDER BY d.id`,
    ).all<{ id: number; name: string; created_at: string; last_used: string | null; by: string }>()
  ).results;
  const thisDevice = await getDevice(c);
  const msg = c.req.query('msg');
  const err = c.req.query('err');
  return c.html(
    <Shell title="Users" path="/settings/users" user={c.get('user')!} env={c.env.APP_ENV}>
      <div>
        <h1>Users</h1>
        <p class="sub">
          Office staff sign in with their @komeals.com Google account. On a kitchen tablet, people tap their name and
          enter a 4-digit PIN.
        </p>
      </div>
      {msg && <p class="msg ok">{msg}</p>}
      {err && <p class="msg">{err}</p>}
      <section class="card">
        <div class="card-h">
          <h2>Add a user</h2>
        </div>
        <form class="card-b row" method="post" action="/settings/users">
          <label>
            Name
            <input name="name" required maxlength={60} />
          </label>
          <label>
            Google email (optional)
            <input name="email" type="email" maxlength={120} placeholder="name@komeals.com" />
          </label>
          <label>
            Role
            <select name="role">
              {ROLES.map((r) => (
                <option value={r} selected={r === 'operator'}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label>
            PIN (optional)
            <input name="pin" inputmode="numeric" pattern="\d{4}" maxlength={4} style="width:110px" />
          </label>
          <button class="btn" type="submit">
            Add user
          </button>
        </form>
      </section>
      <section class="card" style="overflow:hidden">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Google email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Change PIN</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const locked = u.locked_until && Date.parse(u.locked_until) > Date.now();
              return (
                <tr>
                  <td>{u.name}</td>
                  <td>
                    <form method="post" action={`/settings/users/${u.id}/email`} class="row">
                      <input name="email" type="email" value={u.email ?? ''} placeholder="No Google login" maxlength={120} style="width:210px" />
                      <button class="btn ghost small" type="submit">
                        Save
                      </button>
                    </form>
                  </td>
                  <td>{u.role}</td>
                  <td>
                    {!u.active ? (
                      <span class="pill">Inactive</span>
                    ) : locked ? (
                      <span class="pill red">Locked out</span>
                    ) : (
                      <span class="pill green">Active</span>
                    )}
                  </td>
                  <td>
                    <form method="post" action={`/settings/users/${u.id}/pin`} class="row">
                      <input name="pin" inputmode="numeric" pattern="\d{4}" maxlength={4} required placeholder={u.has_pin ? 'New PIN' : 'No PIN yet'} style="width:110px" />
                      <button class="btn ghost small" type="submit">
                        Set PIN
                      </button>
                    </form>
                  </td>
                  <td>
                    {u.id !== c.get('user')!.id && (
                      <form method="post" action={`/settings/users/${u.id}/active`}>
                        <input type="hidden" name="active" value={u.active ? '0' : '1'} />
                        <button class="btn ghost small" type="submit">
                          {u.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section class="card" style="overflow:hidden">
        <div class="card-h">
          <h2 style="flex:1">Kitchen tablets</h2>
          <span class="muted" style="font-size:13px">Only these devices show the name + PIN login</span>
        </div>
        {devices.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>Registered</th>
                <th>Last PIN login</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr>
                  <td>
                    {d.name} {thisDevice?.id === d.id && <span class="pill green">This device</span>}
                  </td>
                  <td>
                    {fmt(d.created_at)} by {d.by}
                  </td>
                  <td>{d.last_used ? fmt(d.last_used) : <span class="muted">Never</span>}</td>
                  <td>
                    <form method="post" action={`/settings/devices/${d.id}/revoke`}>
                      <button class="btn ghost small" type="submit">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!thisDevice && (
          <form class="card-b row" method="post" action="/settings/devices">
            <label>
              Register this device as a kitchen tablet
              <input name="name" required maxlength={60} value="Kitchen tablet" />
            </label>
            <button class="btn" type="submit">
              Register this device
            </button>
          </form>
        )}
      </section>
    </Shell>,
  );
});

const back = (msg: string, ok = true) => `/settings/users?${ok ? 'msg' : 'err'}=${encodeURIComponent(msg)}`;

settingsRoutes.post('/users', async (c) => {
  const f = await c.req.parseBody();
  const name = String(f.name ?? '').trim();
  const role = String(f.role ?? 'operator') as Role;
  const pin = String(f.pin ?? '');
  const email = String(f.email ?? '').trim().toLowerCase() || null;
  if (!name || !ROLES.includes(role)) return c.redirect(back('Enter a name and role.', false));
  if (!email && !pin) return c.redirect(back('Give them a Google email, a PIN, or both, so they can log in.', false));
  if (pin && !isValidPin(pin)) return c.redirect(back('A PIN is 4 digits.', false));
  if (email && !email.includes('@')) return c.redirect(back('That email doesn’t look right.', false));
  if (email && (await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()))
    return c.redirect(back(`${email} is already linked to another user.`, false));
  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE name = ?').bind(name).first();
  if (exists) return c.redirect(back(`There is already a user called ${name}.`, false));
  const { hash, salt } = pin ? await hashPin(pin) : { hash: '', salt: '' };
  const res = await c.env.DB.prepare('INSERT INTO users (name, email, role, pin_hash, pin_salt) VALUES (?, ?, ?, ?, ?)')
    .bind(name, email, role, hash, salt)
    .run();
  await audit(c.env.DB, c.get('user')!.id, 'user', Number(res.meta.last_row_id), 'create', { name, email, role, pin: Boolean(pin) });
  return c.redirect(back(`${name} added.`));
});

settingsRoutes.post('/users/:id/pin', async (c) => {
  const id = Number(c.req.param('id'));
  const pin = String((await c.req.parseBody()).pin ?? '');
  if (!isValidPin(pin)) return c.redirect(back('A PIN is 4 digits.', false));
  const { hash, salt } = await hashPin(pin);
  const res = await c.env.DB.prepare(
    `UPDATE users SET pin_hash = ?, pin_salt = ?, failed_logins = 0, locked_until = NULL,
     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  )
    .bind(hash, salt, id)
    .run();
  if (!res.meta.changes) return c.notFound();
  await audit(c.env.DB, c.get('user')!.id, 'user', id, 'pin_changed');
  return c.redirect(back('PIN changed.'));
});

settingsRoutes.post('/users/:id/active', async (c) => {
  const id = Number(c.req.param('id'));
  if (id === c.get('user')!.id) return c.redirect(back('You can’t deactivate yourself.', false));
  const active = String((await c.req.parseBody()).active) === '1' ? 1 : 0;
  const res = await c.env.DB.prepare(
    `UPDATE users SET active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  )
    .bind(active, id)
    .run();
  if (!res.meta.changes) return c.notFound();
  if (!active) await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  await audit(c.env.DB, c.get('user')!.id, 'user', id, active ? 'reactivate' : 'deactivate');
  return c.redirect(back(active ? 'User reactivated.' : 'User deactivated.'));
});

settingsRoutes.post('/users/:id/email', async (c) => {
  const id = Number(c.req.param('id'));
  const email = String((await c.req.parseBody()).email ?? '').trim().toLowerCase() || null;
  if (email && !email.includes('@')) return c.redirect(back('That email doesn’t look right.', false));
  if (email && (await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').bind(email, id).first()))
    return c.redirect(back(`${email} is already linked to another user.`, false));
  const before = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(id).first<{ email: string | null }>();
  if (!before) return c.notFound();
  if (before.email === email) return c.redirect(back('No change.'));
  await c.env.DB.prepare(`UPDATE users SET email = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
    .bind(email, id)
    .run();
  await audit(c.env.DB, c.get('user')!.id, 'user', id, 'update', { email: { from: before.email, to: email } });
  return c.redirect(back(email ? 'Google email saved.' : 'Google login removed.'));
});

settingsRoutes.post('/devices', async (c) => {
  const name = String((await c.req.parseBody()).name ?? '').trim() || 'Kitchen tablet';
  if (await getDevice(c)) return c.redirect(back('This device is already registered.', false));
  await registerDevice(c, name);
  return c.redirect(back(`${name} registered. The PIN login will show on this device.`));
});

settingsRoutes.post('/devices/:id/revoke', async (c) => {
  const id = Number(c.req.param('id'));
  const res = await c.env.DB.prepare(
    "UPDATE devices SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND revoked_at IS NULL",
  )
    .bind(id)
    .run();
  if (!res.meta.changes) return c.notFound();
  await audit(c.env.DB, c.get('user')!.id, 'device', id, 'remove');
  return c.redirect(back('Tablet removed. It now shows the Google sign-in.'));
});

settingsRoutes.get('/audit', async (c) => {
  const rows = (
    await c.env.DB.prepare(
      `SELECT a.at, a.entity, a.entity_id, a.action, a.details, u.name AS who, t.name AS target
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN users t ON a.entity = 'user' AND t.id = CAST(a.entity_id AS INTEGER)
       ORDER BY a.id DESC LIMIT 200`,
    ).all<{ at: string; entity: string; entity_id: string | null; action: string; details: string | null; who: string | null; target: string | null }>()
  ).results;
  return c.html(
    <Shell title="Audit log" path="/settings/audit" user={c.get('user')!} env={c.env.APP_ENV}>
      <div>
        <h1>Audit log</h1>
        <p class="sub">Every change, newest first. Entries can’t be edited or deleted.</p>
      </div>
      <section class="card" style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Record</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td style="white-space:nowrap">{fmt(r.at)}</td>
                <td>{r.who ?? <span class="muted">System</span>}</td>
                <td>
                  {r.entity} {r.target ?? r.entity_id}
                </td>
                <td>
                  <span class={`pill${r.action.includes('fail') || r.action.includes('lock') ? ' red' : ''}`}>{r.action}</span>
                </td>
                <td class="muted" style="font-size:13px">
                  {r.details}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Shell>,
  );
});
