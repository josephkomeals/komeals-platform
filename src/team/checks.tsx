// Checks: Temperatures (next), Equipment tests, Micro testing (next).
// Everyone can record a result; admins and managers set up what gets tested.

import { Hono } from 'hono';
import { audit } from '../shared/auth';
import { Shell } from '../shared/layout';
import type { AppEnv, User } from '../shared/types';
import { fmtDate, everyLabel, isDate, todayLondon, type Unit } from './dates';
import {
  desiredLabel,
  getPlan,
  inRange,
  listPlans,
  listResults,
  planLink,
  planStatus,
  recordResult,
  syncDueTasks,
  type Plan,
  type State,
} from './tests';

const UNITS: Unit[] = ['day', 'week', 'month', 'year'];
const canSetUp = (u: User) => u.role === 'admin' || u.role === 'manager';
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });

export const checksRoutes = new Hono<AppEnv>();

function Tabs(props: { on: 'temps' | 'equipment' | 'micro' }) {
  return (
    <nav class="tabs" aria-label="Checks">
      <span title="Coming next">Temperatures</span>
      <a class={props.on === 'equipment' ? 'on' : ''} href="/team/checks/equipment">
        Equipment
      </a>
      <span title="Coming next">Micro testing</span>
    </nav>
  );
}

const STATE_PILL: Record<State, [string, string]> = {
  ok: ['green', 'OK'],
  due: ['orange', 'Due soon'],
  overdue: ['red', 'Overdue'],
  failed: ['red', 'Failed – retest'],
  never: ['orange', 'Not tested yet'],
  retired: ['', 'Retired'],
};

function StatePill(props: { state: State }) {
  const [cls, label] = STATE_PILL[props.state];
  return <span class={`pill ${cls}`}>{label}</span>;
}

function lastResultText(p: Plan) {
  if (!p.last_on) return '';
  const v = p.last_value !== null ? `${p.last_value}${p.unit ?? ''} · ` : '';
  return `${v}${p.last_passed ? 'Pass' : 'Fail'}`;
}

async function activeUsers(db: D1Database) {
  return (await db.prepare('SELECT id, name FROM users WHERE active = 1 ORDER BY name').all<{ id: number; name: string }>()).results;
}

function UserSelect(props: { name: string; users: { id: number; name: string }[]; value?: number | null; blank: string }) {
  return (
    <select name={props.name}>
      <option value="">{props.blank}</option>
      {props.users.map((u) => (
        <option value={String(u.id)} selected={props.value === u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}

/** Fields shared by "add equipment" and "edit test". */
function PlanFields(props: { users: { id: number; name: string }[]; p?: Plan }) {
  const p = props.p;
  return (
    <>
      <label>
        Test
        <input name="test" required maxlength={80} value={p?.name ?? ''} placeholder="e.g. Calibration (ice water)" />
      </label>
      <label>
        How often
        <span class="row" style="gap:6px">
          <input name="every_n" type="number" min="1" max="365" required value={String(p?.every_n ?? 1)} style="width:70px" />
          <select name="every_unit">
            {UNITS.map((u) => (
              <option value={u} selected={(p?.every_unit ?? 'month') === u}>
                {u}s
              </option>
            ))}
          </select>
        </span>
      </label>
      <label>
        Result is
        <select name="result_type">
          <option value="range" selected={p?.result_type !== 'pass_fail'}>
            A reading
          </option>
          <option value="pass_fail" selected={p?.result_type === 'pass_fail'}>
            Pass / fail
          </option>
        </select>
      </label>
      <label>
        Min
        <input name="min_value" type="number" step="any" value={p?.min_value ?? ''} style="width:90px" />
      </label>
      <label>
        Max
        <input name="max_value" type="number" step="any" value={p?.max_value ?? ''} style="width:90px" />
      </label>
      <label>
        Unit
        <input name="unit" maxlength={12} value={p?.unit ?? ''} placeholder="°C" style="width:70px" />
      </label>
      <label style="flex:1 1 240px">
        Desired result / method
        <input name="desired" maxlength={200} value={p?.desired ?? ''} placeholder="e.g. Reads 0°C ±1 in iced water" />
      </label>
      <label>
        Done by
        <UserSelect name="responsible_id" users={props.users} value={p?.responsible_id} blank="Choose…" />
      </label>
      <label>
        I/C (told if it fails)
        <UserSelect name="ic_id" users={props.users} value={p?.ic_id} blank="Admins" />
      </label>
      <label>
        Remind (days before)
        <input name="remind_days" type="number" min="0" max="90" value={String(p?.remind_days ?? 7)} style="width:80px" />
      </label>
    </>
  );
}

type PlanInput = {
  name: string;
  every_n: number;
  every_unit: Unit;
  result_type: 'pass_fail' | 'range';
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
  desired: string | null;
  responsible_id: number | null;
  ic_id: number | null;
  remind_days: number;
};

async function readPlanForm(form: FormData, db: D1Database): Promise<PlanInput | string> {
  const s = (k: string) => String(form.get(k) ?? '').trim();
  const num = (k: string) => (s(k) === '' ? null : Number(s(k)));
  const name = s('test');
  const every_n = Number(s('every_n'));
  const every_unit = s('every_unit') as Unit;
  const result_type = s('result_type') === 'pass_fail' ? 'pass_fail' : 'range';
  const min_value = result_type === 'range' ? num('min_value') : null;
  const max_value = result_type === 'range' ? num('max_value') : null;
  const remind_days = s('remind_days') === '' ? 7 : Number(s('remind_days'));
  if (!name) return 'Give the test a name.';
  if (!Number.isInteger(every_n) || every_n < 1 || every_n > 365) return 'How often must be a whole number from 1 to 365.';
  if (!UNITS.includes(every_unit)) return 'Choose days, weeks, months or years.';
  if ([min_value, max_value].some((v) => v !== null && !Number.isFinite(v))) return 'Min and max must be numbers.';
  if (min_value !== null && max_value !== null && min_value > max_value) return 'Min is higher than max.';
  if (result_type === 'range' && min_value === null && max_value === null) return 'For a reading, give a min, a max, or both.';
  if (!Number.isInteger(remind_days) || remind_days < 0 || remind_days > 90) return 'Remind days must be 0 to 90.';
  const userId = async (k: string) => {
    if (!s(k)) return null;
    const u = await db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').bind(Number(s(k))).first<{ id: number }>();
    return u?.id ?? null;
  };
  const responsible_id = await userId('responsible_id');
  if (!responsible_id) return 'Choose who does the test.';
  return {
    name,
    every_n,
    every_unit,
    result_type,
    min_value,
    max_value,
    unit: result_type === 'range' ? s('unit') || null : null,
    desired: s('desired') || null,
    responsible_id,
    ic_id: await userId('ic_id'),
    remind_days,
  };
}

checksRoutes.get('/', (c) => c.redirect('/team/checks/equipment'));

checksRoutes.get('/equipment', async (c) => {
  const user = c.get('user')!;
  const today = todayLondon();
  const plans = (await listPlans(c.env.DB, 'equipment')).map((p) => ({ p, ...planStatus(p, today) }));
  // Most urgent first: failed, overdue, never tested, due soon, OK.
  const order: State[] = ['failed', 'overdue', 'never', 'due', 'ok', 'retired'];
  plans.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.nextDue.localeCompare(b.nextDue));
  const count = (...s: State[]) => plans.filter((x) => s.includes(x.state)).length;
  const users = canSetUp(user) ? await activeUsers(c.env.DB) : [];
  const err = c.req.query('err');
  const msg = c.req.query('msg');
  return c.html(
    <Shell title="Equipment checks" path="/team/checks/equipment" user={user} env={c.env.APP_ENV} unread={c.get('unread')}>
      <div>
        <h1>Checks</h1>
        <p class="sub">Equipment that needs testing on a schedule. A due test goes into the tester's list; a fail tells the I/C.</p>
      </div>
      <Tabs on="equipment" />
      {msg && <p class="msg ok">{msg}</p>}
      {err && <p class="msg">{err}</p>}
      <div class="tiles">
        <div class="card tile">
          <div class="k">Failed</div>
          <div class="v" style={count('failed') ? 'color:var(--red)' : ''}>{count('failed')}</div>
        </div>
        <div class="card tile">
          <div class="k">Overdue or never tested</div>
          <div class="v" style={count('overdue', 'never') ? 'color:var(--red)' : ''}>{count('overdue', 'never')}</div>
        </div>
        <div class="card tile">
          <div class="k">Due soon</div>
          <div class="v" style={count('due') ? 'color:var(--orange)' : ''}>{count('due')}</div>
        </div>
        <div class="card tile">
          <div class="k">OK</div>
          <div class="v" style="color:var(--green)">{count('ok')}</div>
        </div>
      </div>
      <section class="card" style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Test</th>
              <th>How often</th>
              <th>Desired result</th>
              <th>Done by</th>
              <th>I/C</th>
              <th>Last tested</th>
              <th>Next due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 && (
              <tr>
                <td colspan={9} class="muted">
                  No equipment yet.{canSetUp(user) ? ' Add the first item below.' : ''}
                </td>
              </tr>
            )}
            {plans.map(({ p, nextDue, state }) => (
              <tr>
                <td>
                  <a href={planLink(p.id)}>{p.subject_name}</a>
                  {p.location && <div class="muted" style="font-size:12px">{p.location}</div>}
                </td>
                <td>{p.name}</td>
                <td>{everyLabel(p.every_n, p.every_unit)}</td>
                <td>{desiredLabel(p)}</td>
                <td>{p.responsible_name ?? <span class="muted">Nobody</span>}</td>
                <td>{p.ic_name ?? <span class="muted">Admins</span>}</td>
                <td>
                  {p.last_on ? fmtDate(p.last_on) : <span class="muted">Never</span>}
                  {p.last_on && <div class="muted" style="font-size:12px">{lastResultText(p)}</div>}
                </td>
                <td>{state === 'failed' ? 'Now' : fmtDate(nextDue)}</td>
                <td>
                  <StatePill state={state} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {canSetUp(user) && (
        <section class="card">
          <div class="card-h">
            <h2>Add equipment or a test</h2>
            <span class="muted" style="font-size:13px">Same equipment name again = another test for that item.</span>
          </div>
          <form class="card-b row" method="post" action="/team/checks/equipment">
            <label>
              Equipment
              <input name="equipment" required maxlength={80} placeholder="e.g. Probe thermometer 1" />
            </label>
            <label>
              Location
              <input name="location" maxlength={80} placeholder="e.g. Hot kitchen" />
            </label>
            <label>
              Asset no.
              <input name="code" maxlength={40} style="width:110px" />
            </label>
            <PlanFields users={users} />
            <button class="btn" type="submit">
              Add
            </button>
          </form>
        </section>
      )}
    </Shell>,
  );
});

checksRoutes.post('/equipment', async (c) => {
  const user = c.get('user')!;
  if (!canSetUp(user)) return c.text('Only admins and managers can add equipment.', 403);
  const form = await c.req.formData();
  const equipment = String(form.get('equipment') ?? '').trim();
  const location = String(form.get('location') ?? '').trim() || null;
  const code = String(form.get('code') ?? '').trim() || null;
  const input = await readPlanForm(form, c.env.DB);
  if (!equipment) return c.redirect('/team/checks/equipment?err=' + encodeURIComponent('Name the equipment.'));
  if (typeof input === 'string') return c.redirect('/team/checks/equipment?err=' + encodeURIComponent(input));

  const db = c.env.DB;
  let subject = await db
    .prepare("SELECT id FROM test_subjects WHERE kind = 'equipment' AND active = 1 AND name = ? COLLATE NOCASE")
    .bind(equipment)
    .first<{ id: number }>();
  if (!subject) {
    const res = await db
      .prepare("INSERT INTO test_subjects (kind, name, code, location) VALUES ('equipment', ?, ?, ?)")
      .bind(equipment, code, location)
      .run();
    subject = { id: Number(res.meta.last_row_id) };
    await audit(db, user.id, 'test_subject', subject.id, 'create', { kind: 'equipment', name: equipment, code, location });
  }
  const res = await db
    .prepare(
      `INSERT INTO test_plans (subject_id, name, every_n, every_unit, result_type, min_value, max_value, unit, desired,
                               responsible_id, ic_id, remind_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      subject.id,
      input.name,
      input.every_n,
      input.every_unit,
      input.result_type,
      input.min_value,
      input.max_value,
      input.unit,
      input.desired,
      input.responsible_id,
      input.ic_id,
      input.remind_days,
    )
    .run();
  const planId = Number(res.meta.last_row_id);
  await audit(db, user.id, 'test_plan', planId, 'create', { subject_id: subject.id, ...input });
  await syncDueTasks(db);
  return c.redirect('/team/checks/equipment?msg=' + encodeURIComponent(`Added ${equipment}: ${input.name}.`));
});

checksRoutes.get('/tests/:id', async (c) => {
  const user = c.get('user')!;
  const p = await getPlan(c.env.DB, Number(c.req.param('id')));
  if (!p) return c.notFound();
  const { nextDue, state } = planStatus(p);
  const results = await listResults(c.env.DB, p.id);
  const correcting = Number(c.req.query('correct')) || null;
  const original = correcting ? results.find((r) => r.id === correcting && !r.corrected_by_id) : undefined;
  const editing = c.req.query('edit') === '1' && canSetUp(user);
  const users = editing ? await activeUsers(c.env.DB) : [];
  const history = (
    await c.env.DB.prepare(
      `SELECT a.at, a.action, a.details, u.name AS who FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity = 'test_plan' AND a.entity_id = ? ORDER BY a.id DESC LIMIT 20`,
    )
      .bind(String(p.id))
      .all<{ at: string; action: string; details: string | null; who: string | null }>()
  ).results;
  const err = c.req.query('err');
  const msg = c.req.query('msg');
  const back = p.kind === 'equipment' ? '/team/checks/equipment' : '/team/checks/micro';

  return c.html(
    <Shell title={`${p.subject_name}: ${p.name}`} path={back} user={user} env={c.env.APP_ENV} unread={c.get('unread')}>
      <div>
        <a href={back} class="muted" style="font-size:13px;text-decoration:none">
          ← Checks
        </a>
        <h1 style="margin-top:6px">
          {p.subject_name}: {p.name} <StatePill state={state} />
        </h1>
        <p class="sub">
          {everyLabel(p.every_n, p.every_unit)} · next due {state === 'failed' ? 'now (retest)' : fmtDate(nextDue)}
        </p>
      </div>
      {msg && <p class="msg ok">{msg}</p>}
      {err && <p class="msg">{err}</p>}
      <div class="grid2">
        <section class="card">
          <div class="card-h">
            <h2>{original ? `Correct the ${fmtDate(original.tested_on)} result` : 'Record a result'}</h2>
          </div>
          {p.active ? (
            <form class="card-b" method="post" action={`/team/checks/tests/${p.id}/results`} style="display:flex;flex-direction:column;gap:12px">
              {original && <input type="hidden" name="corrects_id" value={String(original.id)} />}
              <p class="muted" style="margin:0">Desired: {desiredLabel(p)}</p>
              <div class="row">
                <label>
                  Date tested
                  <input name="tested_on" type="date" required value={original?.tested_on ?? todayLondon()} max={todayLondon()} />
                </label>
                {p.result_type === 'range' ? (
                  <label>
                    Reading{p.unit ? ` (${p.unit})` : ''}
                    <input name="value" type="number" step="any" required style="width:110px" />
                  </label>
                ) : (
                  <label>
                    Result
                    <select name="passed" required>
                      <option value="">Choose…</option>
                      <option value="1">Pass</option>
                      <option value="0">Fail</option>
                    </select>
                  </label>
                )}
                {p.kind === 'product' && (
                  <label>
                    Lab / report ref.
                    <input name="lab" maxlength={120} />
                  </label>
                )}
              </div>
              <label>
                {original ? 'Why it is being corrected (required)' : 'Note (required if it fails: what was done about it)'}
                <textarea name="note" maxlength={1000} required={Boolean(original)} />
              </label>
              <div class="row">
                <button class="btn" type="submit">
                  {original ? 'Save correction' : 'Save result'}
                </button>
                {original && (
                  <a class="btn ghost" href={planLink(p.id)}>
                    Cancel
                  </a>
                )}
              </div>
              <p class="muted" style="margin:0;font-size:12px">Results lock once saved. Mistakes are fixed with a correction, which keeps the original.</p>
            </form>
          ) : (
            <p class="card-b muted">This test is retired.</p>
          )}
        </section>
        <section class="card">
          <div class="card-h">
            <h2>Details</h2>
            <span style="flex:1" />
            {canSetUp(user) && !editing && (
              <a class="btn ghost small" href={`${planLink(p.id)}?edit=1`}>
                Edit
              </a>
            )}
          </div>
          {editing ? (
            <form class="card-b row" method="post" action={`/team/checks/tests/${p.id}`}>
              <PlanFields users={users} p={p} />
              <button class="btn" type="submit">
                Save
              </button>
              <a class="btn ghost" href={planLink(p.id)}>
                Cancel
              </a>
            </form>
          ) : (
            <div class="card-b">
              <dl class="facts">
                <dt>Equipment</dt>
                <dd>
                  {p.subject_name}
                  {p.code ? ` (${p.code})` : ''}
                </dd>
                {p.location && (
                  <>
                    <dt>Location</dt>
                    <dd>{p.location}</dd>
                  </>
                )}
                <dt>Desired result</dt>
                <dd>{desiredLabel(p)}</dd>
                <dt>Done by</dt>
                <dd>{p.responsible_name ?? 'Nobody'}</dd>
                <dt>I/C</dt>
                <dd>{p.ic_name ?? 'Admins'}</dd>
                <dt>Reminder</dt>
                <dd>{p.remind_days} days before due</dd>
              </dl>
              {canSetUp(user) && (
                <form method="post" action={`/team/checks/tests/${p.id}/active`} style="margin-top:14px">
                  <button class="btn ghost small" type="submit">
                    {p.active ? 'Retire this test' : 'Bring back'}
                  </button>
                </form>
              )}
            </div>
          )}
        </section>
      </div>
      <section class="card" style="overflow-x:auto">
        <div class="card-h">
          <h2>Results</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Tested</th>
              <th>Result</th>
              <th>Note</th>
              <th>Recorded by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 && (
              <tr>
                <td colspan={5} class="muted">
                  No results yet.
                </td>
              </tr>
            )}
            {results.map((r) => (
              <tr style={r.corrected_by_id ? 'opacity:.55' : ''}>
                <td>{fmtDate(r.tested_on)}</td>
                <td>
                  {r.value !== null && `${r.value}${p.unit ?? ''} `}
                  <span class={`pill ${r.passed ? 'green' : 'red'}`}>{r.passed ? 'Pass' : 'Fail'}</span>
                  {r.corrected_by_id && <div class="muted" style="font-size:12px">Replaced by a correction</div>}
                  {r.corrects_id && <div class="muted" style="font-size:12px">Correction</div>}
                </td>
                <td>
                  {r.note}
                  {r.lab && <div class="muted" style="font-size:12px">Lab: {r.lab}</div>}
                </td>
                <td>
                  {r.recorded_by_name}
                  <div class="muted" style="font-size:12px">{fmtTime(r.recorded_at)}</div>
                </td>
                <td>
                  {!r.corrected_by_id && p.active ? (
                    <a class="btn ghost small" href={`${planLink(p.id)}?correct=${r.id}`}>
                      Correct
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {history.length > 0 && (
        <section class="card" style="overflow-x:auto">
          <div class="card-h">
            <h2>Changes to this test</h2>
          </div>
          <table>
            <tbody>
              {history.map((h) => (
                <tr>
                  <td style="white-space:nowrap">{fmtTime(h.at)}</td>
                  <td>{h.who ?? 'System'}</td>
                  <td>{h.action}</td>
                  <td class="muted" style="font-size:12px;word-break:break-word">{h.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </Shell>,
  );
});

checksRoutes.post('/tests/:id/results', async (c) => {
  const user = c.get('user')!;
  const p = await getPlan(c.env.DB, Number(c.req.param('id')));
  if (!p) return c.notFound();
  const back = planLink(p.id);
  const fail = (m: string) => c.redirect(`${back}?err=${encodeURIComponent(m)}`);
  if (!p.active) return fail('This test is retired.');

  const form = await c.req.formData();
  const s = (k: string) => String(form.get(k) ?? '').trim();
  const testedOn = s('tested_on');
  if (!isDate(testedOn) || testedOn > todayLondon()) return fail('Enter the date the test was done (not in the future).');

  let value: number | null = null;
  let passed: boolean;
  if (p.result_type === 'range') {
    value = Number(s('value'));
    if (s('value') === '' || !Number.isFinite(value)) return fail('Enter the reading as a number.');
    passed = inRange(p, value);
  } else {
    if (s('passed') !== '1' && s('passed') !== '0') return fail('Choose pass or fail.');
    passed = s('passed') === '1';
  }
  const note = s('note');
  const correctsId = s('corrects_id') ? Number(s('corrects_id')) : null;
  if (correctsId) {
    const orig = await c.env.DB.prepare(
      'SELECT id FROM test_results r WHERE id = ? AND plan_id = ? AND NOT EXISTS (SELECT 1 FROM test_results c WHERE c.corrects_id = r.id)',
    )
      .bind(correctsId, p.id)
      .first();
    if (!orig) return fail('That result has already been corrected.');
    if (!note) return fail('Say why the result is being corrected.');
  }
  if (!passed && !note) return fail(`That's a fail (wanted ${desiredLabel(p)}). Add a note on what was done about it.`);

  await recordResult(c.env.DB, p, { testedOn, value, passed, note, lab: s('lab'), correctsId }, user.id);
  const m = passed
    ? 'Saved. Pass.'
    : `Saved. Fail: a corrective task went to ${p.responsible_name ?? 'you'} and ${p.ic_name ?? 'the admins'} ${p.ic_name ? 'was' : 'were'} notified.`;
  return c.redirect(`${back}?msg=${encodeURIComponent(m)}`);
});

checksRoutes.post('/tests/:id', async (c) => {
  const user = c.get('user')!;
  if (!canSetUp(user)) return c.text('Only admins and managers can change tests.', 403);
  const p = await getPlan(c.env.DB, Number(c.req.param('id')));
  if (!p) return c.notFound();
  const input = await readPlanForm(await c.req.formData(), c.env.DB);
  if (typeof input === 'string') return c.redirect(`${planLink(p.id)}?edit=1&err=${encodeURIComponent(input)}`);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(input)) {
    const before = (p as Record<string, unknown>)[k];
    if (before !== v) changes[k] = { from: before, to: v };
  }
  if (Object.keys(changes).length) {
    await c.env.DB.prepare(
      `UPDATE test_plans SET name = ?, every_n = ?, every_unit = ?, result_type = ?, min_value = ?, max_value = ?, unit = ?,
              desired = ?, responsible_id = ?, ic_id = ?, remind_days = ? WHERE id = ?`,
    )
      .bind(
        input.name,
        input.every_n,
        input.every_unit,
        input.result_type,
        input.min_value,
        input.max_value,
        input.unit,
        input.desired,
        input.responsible_id,
        input.ic_id,
        input.remind_days,
        p.id,
      )
      .run();
    await audit(c.env.DB, user.id, 'test_plan', p.id, 'update', changes);
    await syncDueTasks(c.env.DB);
  }
  return c.redirect(`${planLink(p.id)}?msg=${encodeURIComponent(Object.keys(changes).length ? 'Saved.' : 'Nothing changed.')}`);
});

checksRoutes.post('/tests/:id/active', async (c) => {
  const user = c.get('user')!;
  if (!canSetUp(user)) return c.text('Only admins and managers can change tests.', 403);
  const p = await getPlan(c.env.DB, Number(c.req.param('id')));
  if (!p) return c.notFound();
  const active = p.active ? 0 : 1;
  await c.env.DB.prepare('UPDATE test_plans SET active = ? WHERE id = ?').bind(active, p.id).run();
  await audit(c.env.DB, user.id, 'test_plan', p.id, active ? 'reactivate' : 'retire');
  if (!active) {
    await c.env.DB.prepare(
      "UPDATE tasks SET status = 'no_longer_needed' WHERE ref_entity = 'test_plan' AND ref_id = ? AND status IN ('not_started','working','stuck','snoozed')",
    )
      .bind(String(p.id))
      .run();
  } else await syncDueTasks(c.env.DB);
  return c.redirect(`${planLink(p.id)}?msg=${encodeURIComponent(active ? 'Back in use.' : 'Retired. It no longer creates tasks.')}`);
});
