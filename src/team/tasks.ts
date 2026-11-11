// Task + notification helpers used by the Team pages (checks, My day).

import { audit } from '../shared/auth';

export type Task = {
  id: number;
  title: string;
  notes: string | null;
  owner_id: number;
  status: string;
  priority: 'high' | 'med' | 'low';
  area: string | null;
  due_on: string | null;
  source: string;
  link: string | null;
  ref_entity: string | null;
  ref_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export const OPEN_STATUSES = ['not_started', 'working', 'stuck', 'snoozed'] as const;
const OPEN_SQL = `status IN (${OPEN_STATUSES.map((s) => `'${s}'`).join(',')})`;

type NewTask = {
  title: string;
  notes?: string;
  ownerId: number;
  priority?: 'high' | 'med' | 'low';
  area?: string;
  dueOn?: string;
  link?: string;
  ref?: { entity: string; id: string | number };
  createdBy?: number | null; // null/undefined = made by the system
};

export async function createTask(db: D1Database, t: NewTask) {
  const res = await db
    .prepare(
      `INSERT INTO tasks (title, notes, owner_id, priority, area, due_on, source, link, ref_entity, ref_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      t.title,
      t.notes ?? null,
      t.ownerId,
      t.priority ?? 'med',
      t.area ?? null,
      t.dueOn ?? null,
      t.createdBy ? 'manual' : 'system',
      t.link ?? null,
      t.ref?.entity ?? null,
      t.ref ? String(t.ref.id) : null,
      t.createdBy ?? null,
    )
    .run();
  const id = Number(res.meta.last_row_id);
  await audit(db, t.createdBy ?? null, 'task', id, 'create', { title: t.title, owner_id: t.ownerId, due_on: t.dueOn });
  return id;
}

/** Is there still an open task pointing at this record? */
export async function hasOpenTask(db: D1Database, entity: string, id: string | number) {
  return Boolean(
    await db.prepare(`SELECT 1 FROM tasks WHERE ref_entity = ? AND ref_id = ? AND ${OPEN_SQL}`).bind(entity, String(id)).first(),
  );
}

/** Marks open tasks for a record done, e.g. the "test due" task once the test is recorded. */
export async function completeTasksFor(db: D1Database, entity: string, id: string | number, userId: number) {
  const open = (
    await db.prepare(`SELECT id FROM tasks WHERE ref_entity = ? AND ref_id = ? AND ${OPEN_SQL}`).bind(entity, String(id)).all<{ id: number }>()
  ).results;
  for (const t of open) {
    await db
      .prepare("UPDATE tasks SET status = 'done', completed_at = ?, completed_by = ? WHERE id = ?")
      .bind(new Date().toISOString(), userId, t.id)
      .run();
    await audit(db, userId, 'task', t.id, 'complete', { via: `${entity} ${id}` });
  }
}

export async function notify(db: D1Database, userId: number, title: string, body?: string, link?: string) {
  await db
    .prepare('INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)')
    .bind(userId, title, body ?? null, link ?? null)
    .run();
}

export async function unreadCount(db: D1Database, userId: number) {
  return (await db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(userId).first<{ n: number }>())!.n;
}
