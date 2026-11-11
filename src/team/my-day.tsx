// My day (first version): your open tasks and notifications. The full design
// (time slots, protected blocks, side panels) comes with the Tasks step.

import { Hono } from 'hono';
import { audit } from '../shared/auth';
import { Shell } from '../shared/layout';
import type { AppEnv } from '../shared/types';
import { fmtDate, todayLondon, addDays } from './dates';
import { OPEN_STATUSES, type Task } from './tasks';

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  working: 'Working on it',
  stuck: 'Stuck',
  snoozed: 'Snoozed',
  done: 'Done',
  no_longer_needed: 'No longer needed',
  cancelled: 'Cancelled',
};
const PRIORITY_PILL = { high: 'red', med: 'orange', low: '' } as const;
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });

export const myDayRoutes = new Hono<AppEnv>();

myDayRoutes.get('/my-day', async (c) => {
  const me = c.get('user')!;
  const isManager = me.role === 'admin' || me.role === 'manager';
  const people = isManager
    ? (await c.env.DB.prepare('SELECT id, name FROM users WHERE active = 1 ORDER BY name').all<{ id: number; name: string }>()).results
    : [];
  const asked = Number(c.req.query('user'));
  const person = isManager && people.find((p) => p.id === asked) ? people.find((p) => p.id === asked)! : { id: me.id, name: me.name };
  const self = person.id === me.id;
  const today = todayLondon();

  const open = (
    await c.env.DB.prepare(
      `SELECT * FROM tasks WHERE owner_id = ? AND status IN (${OPEN_STATUSES.map(() => '?').join(',')})
       ORDER BY due_on IS NULL, due_on, CASE priority WHEN 'high' THEN 0 WHEN 'med' THEN 1 ELSE 2 END, id`,
    )
      .bind(person.id, ...OPEN_STATUSES)
      .all<Task>()
  ).results;
  const done = (
    await c.env.DB.prepare(
      "SELECT * FROM tasks WHERE owner_id = ? AND status = 'done' AND completed_at >= ? ORDER BY completed_at DESC LIMIT 30",
    )
      .bind(person.id, addDays(today, -7))
      .all<Task>()
  ).results;
  const notes = self
    ? (
        await c.env.DB.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 20')
          .bind(me.id)
          .all<{ id: number; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null }>()
      ).results
    : [];
  const overdue = open.filter((t) => t.due_on && t.due_on < today);
  const dueToday = open.filter((t) => t.due_on === today);

  return c.html(
    <Shell title="My day" path="/team/my-day" user={me} env={c.env.APP_ENV} unread={c.get('unread')}>
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <h1>{self ? 'My day' : `${person.name}'s day`}</h1>
          <p class="sub">
            {new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        {isManager && (
          <form method="get" action="/team/my-day" class="row">
            <select name="user" onchange="this.form.submit()" aria-label="Person">
              {people.map((p) => (
                <option value={String(p.id)} selected={p.id === person.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <noscript>
              <button class="btn ghost small">Show</button>
            </noscript>
          </form>
        )}
      </div>
      <div class="tiles">
        <div class="card tile">
          <div class="k">Overdue</div>
          <div class="v" style={overdue.length ? 'color:var(--red)' : ''}>{overdue.length}</div>
        </div>
        <div class="card tile">
          <div class="k">Due today</div>
          <div class="v">{dueToday.length}</div>
        </div>
        <div class="card tile">
          <div class="k">Open</div>
          <div class="v">{open.length}</div>
        </div>
        <div class="card tile">
          <div class="k">Done in last 7 days</div>
          <div class="v" style="color:var(--green)">{done.length}</div>
        </div>
      </div>
      {self && notes.some((n) => !n.read_at) && (
        <section class="card" id="notifications">
          <div class="card-h">
            <h2>Notifications</h2>
            <span style="flex:1" />
            <form method="post" action="/team/notifications/read">
              <button class="btn ghost small">Mark all read</button>
            </form>
          </div>
          <table>
            <tbody>
              {notes
                .filter((n) => !n.read_at)
                .map((n) => (
                  <tr>
                    <td>
                      <span class="pill red">New</span>
                    </td>
                    <td>
                      {n.link ? <a href={n.link}>{n.title}</a> : n.title}
                      {n.body && <div class="muted" style="font-size:12px">{n.body}</div>}
                    </td>
                    <td class="muted" style="white-space:nowrap">{fmtTime(n.created_at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
      <section class="card" style="overflow-x:auto">
        <div class="card-h">
          <h2>Open tasks</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Due</th>
              <th>Priority</th>
              <th>Area</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {open.length === 0 && (
              <tr>
                <td colspan={5} class="muted">
                  Nothing open.
                </td>
              </tr>
            )}
            {open.map((t) => (
              <tr>
                <td>
                  {t.link ? <a href={t.link}>{t.title}</a> : t.title}
                  {t.notes && <div class="muted" style="font-size:12px">{t.notes}</div>}
                </td>
                <td style="white-space:nowrap">
                  {t.due_on ? (
                    <span class={t.due_on < today ? 'pill red' : t.due_on === today ? 'pill orange' : ''}>{fmtDate(t.due_on)}</span>
                  ) : (
                    ''
                  )}
                </td>
                <td>
                  <span class={`pill ${PRIORITY_PILL[t.priority]}`}>{t.priority === 'med' ? 'Medium' : t.priority === 'high' ? 'High' : 'Low'}</span>
                </td>
                <td>{t.area}</td>
                <td>
                  <form method="post" action={`/team/tasks/${t.id}/status`} class="row" style="flex-wrap:nowrap">
                    <select name="status" aria-label="Status">
                      {Object.entries(STATUS_LABEL).map(([k, v]) => (
                        <option value={k} selected={k === t.status}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <button class="btn ghost small">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {done.length > 0 && (
        <section class="card" style="overflow-x:auto">
          <div class="card-h">
            <h2>Done in the last 7 days</h2>
          </div>
          <table>
            <tbody>
              {done.map((t) => (
                <tr>
                  <td>{t.link ? <a href={t.link}>{t.title}</a> : t.title}</td>
                  <td class="muted">{fmtTime(t.completed_at!)}</td>
                  <td>
                    <span class="pill green">Done</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </Shell>,
  );
});

myDayRoutes.post('/tasks/:id/status', async (c) => {
  const me = c.get('user')!;
  const id = Number(c.req.param('id'));
  const status = String((await c.req.formData()).get('status') ?? '');
  if (!(status in STATUS_LABEL)) return c.text('Unknown status', 400);
  const t = await c.env.DB.prepare('SELECT id, owner_id, status FROM tasks WHERE id = ?').bind(id).first<Task>();
  if (!t) return c.notFound();
  const isManager = me.role === 'admin' || me.role === 'manager';
  if (t.owner_id !== me.id && !isManager) return c.text('That task is not yours.', 403);
  if (t.status !== status) {
    const doneNow = status === 'done';
    await c.env.DB.prepare('UPDATE tasks SET status = ?, completed_at = ?, completed_by = ? WHERE id = ?')
      .bind(status, doneNow ? new Date().toISOString() : null, doneNow ? me.id : null, id)
      .run();
    await audit(c.env.DB, me.id, 'task', id, 'status', { from: t.status, to: status });
  }
  const back = t.owner_id === me.id ? '/team/my-day' : `/team/my-day?user=${t.owner_id}`;
  return c.redirect(back);
});

myDayRoutes.post('/notifications/read', async (c) => {
  const me = c.get('user')!;
  await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .bind(new Date().toISOString(), me.id)
    .run();
  return c.redirect('/team/my-day');
});
