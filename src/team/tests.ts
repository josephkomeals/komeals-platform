// Periodic tests: equipment now, micro testing per product next.
// A plan = what is tested, how often, the desired result, who does it and who is I/C.

import { audit } from '../shared/auth';
import { completeTasksFor, createTask, hasOpenTask, notify } from './tasks';
import { addInterval, daysBetween, fmtDate, todayLondon, type Unit } from './dates';

export type Plan = {
  id: number;
  subject_id: number;
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
  active: number;
  kind: 'equipment' | 'product';
  subject_name: string;
  code: string | null;
  location: string | null;
  responsible_name: string | null;
  ic_name: string | null;
  last_on: string | null;
  last_passed: number | null;
  last_value: number | null;
};

export type Result = {
  id: number;
  plan_id: number;
  tested_on: string;
  value: number | null;
  passed: number;
  note: string | null;
  lab: string | null;
  corrects_id: number | null;
  recorded_by_name: string;
  recorded_at: string;
  corrected_by_id: number | null;
};

// Results that have not been replaced by a correction.
const EFFECTIVE = `SELECT r.*, ROW_NUMBER() OVER (PARTITION BY r.plan_id ORDER BY r.tested_on DESC, r.id DESC) AS rn
  FROM test_results r WHERE NOT EXISTS (SELECT 1 FROM test_results c WHERE c.corrects_id = r.id)`;

const PLAN_SQL = `WITH eff AS (${EFFECTIVE})
  SELECT p.*, s.kind, s.name AS subject_name, s.code, s.location,
         ru.name AS responsible_name, iu.name AS ic_name,
         eff.tested_on AS last_on, eff.passed AS last_passed, eff.value AS last_value
  FROM test_plans p
  JOIN test_subjects s ON s.id = p.subject_id
  LEFT JOIN users ru ON ru.id = p.responsible_id
  LEFT JOIN users iu ON iu.id = p.ic_id
  LEFT JOIN eff ON eff.plan_id = p.id AND eff.rn = 1`;

export async function listPlans(db: D1Database, kind: 'equipment' | 'product', includeRetired = false) {
  return (
    await db
      .prepare(`${PLAN_SQL} WHERE s.kind = ? ${includeRetired ? '' : 'AND p.active = 1 AND s.active = 1'} ORDER BY s.name, p.name`)
      .bind(kind)
      .all<Plan>()
  ).results;
}

export const getPlan = (db: D1Database, id: number) => db.prepare(`${PLAN_SQL} WHERE p.id = ?`).bind(id).first<Plan>();

export async function listResults(db: D1Database, planId: number) {
  return (
    await db
      .prepare(
        `SELECT r.*, u.name AS recorded_by_name, (SELECT c.id FROM test_results c WHERE c.corrects_id = r.id) AS corrected_by_id
         FROM test_results r JOIN users u ON u.id = r.recorded_by
         WHERE r.plan_id = ? ORDER BY r.tested_on DESC, r.id DESC`,
      )
      .bind(planId)
      .all<Result>()
  ).results;
}

export type State = 'ok' | 'due' | 'overdue' | 'failed' | 'never' | 'retired';

/** Next due date and traffic-light state. Never tested = due now. A failed last result needs a retest. */
export function planStatus(p: Plan, today = todayLondon()): { nextDue: string; state: State; days: number } {
  const nextDue = p.last_on ? addInterval(p.last_on, p.every_n, p.every_unit) : today;
  const days = daysBetween(today, nextDue);
  let state: State;
  if (!p.active) state = 'retired';
  else if (p.last_passed === 0) state = 'failed';
  else if (!p.last_on) state = 'never';
  else if (days < 0) state = 'overdue';
  else if (days <= p.remind_days) state = 'due';
  else state = 'ok';
  return { nextDue, state, days };
}

export function desiredLabel(p: Pick<Plan, 'result_type' | 'min_value' | 'max_value' | 'unit' | 'desired'>) {
  if (p.result_type === 'pass_fail') return p.desired || 'Pass';
  const u = p.unit ?? '';
  const range =
    p.min_value !== null && p.max_value !== null
      ? `${p.min_value} to ${p.max_value}${u}`
      : p.min_value !== null
        ? `${p.min_value}${u} or more`
        : p.max_value !== null
          ? `${p.max_value}${u} or less`
          : 'Any value';
  return p.desired ? `${range} (${p.desired})` : range;
}

export function inRange(p: Pick<Plan, 'min_value' | 'max_value'>, v: number) {
  return (p.min_value === null || v >= p.min_value) && (p.max_value === null || v <= p.max_value);
}

export const planLink = (id: number) => `/team/checks/tests/${id}`;
const planTitle = (p: Plan) => `${p.subject_name}: ${p.name}`;

/**
 * Puts a "test due" task in the responsible person's list for each test inside its reminder window,
 * unless one is already open. Run daily by the cron, and after a plan is added or changed.
 */
export async function syncDueTasks(db: D1Database) {
  const today = todayLondon();
  let made = 0;
  for (const kind of ['equipment', 'product'] as const) {
    for (const p of await listPlans(db, kind)) {
      if (!p.responsible_id) continue;
      const { nextDue, state } = planStatus(p, today);
      if (state !== 'due' && state !== 'overdue' && state !== 'never') continue;
      if (await hasOpenTask(db, 'test_plan', p.id)) continue;
      await createTask(db, {
        title: `Test due: ${planTitle(p)}`,
        notes: `Desired result: ${desiredLabel(p)}. Due ${fmtDate(nextDue)}.`,
        ownerId: p.responsible_id,
        priority: state === 'overdue' ? 'high' : 'med',
        area: 'Food safety',
        dueOn: nextDue,
        link: planLink(p.id),
        ref: { entity: 'test_plan', id: p.id },
      });
      made++;
    }
  }
  return made;
}

/** Fallback I/C when a plan has none: every active admin. */
async function icFor(db: D1Database, p: Plan) {
  if (p.ic_id) return [p.ic_id];
  return (await db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1").all<{ id: number }>()).results.map((u) => u.id);
}

export type NewResult = { testedOn: string; value: number | null; passed: boolean; note: string; lab: string; correctsId: number | null };

/** Saves a (locked) result, closes the "test due" task, and on a fail opens a corrective task and tells the I/C. */
export async function recordResult(db: D1Database, p: Plan, r: NewResult, userId: number) {
  const res = await db
    .prepare(
      `INSERT INTO test_results (plan_id, tested_on, value, passed, note, lab, corrects_id, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(p.id, r.testedOn, r.value, r.passed ? 1 : 0, r.note || null, r.lab || null, r.correctsId, userId)
    .run();
  const id = Number(res.meta.last_row_id);
  await audit(db, userId, 'test_result', id, r.correctsId ? 'correct' : 'create', {
    plan_id: p.id,
    tested_on: r.testedOn,
    value: r.value,
    passed: r.passed,
    note: r.note || undefined,
    corrects_id: r.correctsId ?? undefined,
  });

  await completeTasksFor(db, 'test_plan', p.id, userId);

  // A correction only raises the alarm if it turns a pass into a fail.
  const wasFail = r.correctsId
    ? (await db.prepare('SELECT passed FROM test_results WHERE id = ?').bind(r.correctsId).first<{ passed: number }>())?.passed === 0
    : false;
  if (!r.passed && !wasFail) {
    const shown = r.value !== null ? `${r.value}${p.unit ?? ''}` : 'Fail';
    const title = `Failed: ${planTitle(p)}`;
    const body = `Result ${shown} on ${fmtDate(r.testedOn)}; wanted ${desiredLabel(p)}. Action noted: ${r.note}`;
    await createTask(db, {
      title: `Corrective action and retest: ${planTitle(p)}`,
      notes: body,
      ownerId: p.responsible_id ?? userId,
      priority: 'high',
      area: 'Food safety',
      dueOn: todayLondon(),
      link: planLink(p.id),
      ref: { entity: 'test_result', id },
    });
    for (const ic of await icFor(db, p)) await notify(db, ic, title, body, planLink(p.id));
  }
  return id;
}
