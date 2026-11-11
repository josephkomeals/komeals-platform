-- Tasks, in-app notifications, and periodic tests (equipment now, micro testing per product next).
-- Only adds tables; no existing rows are touched.

-- Tasks: the shared task list behind My day. System-made tasks point back at what made them.
CREATE TABLE tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  notes         TEXT,
  owner_id      INTEGER NOT NULL REFERENCES users(id),
  status        TEXT    NOT NULL DEFAULT 'not_started'
                CHECK (status IN ('not_started', 'working', 'stuck', 'snoozed', 'done', 'no_longer_needed', 'cancelled')),
  priority      TEXT    NOT NULL DEFAULT 'med' CHECK (priority IN ('high', 'med', 'low')),
  area          TEXT,                       -- e.g. 'Food safety', 'Production'
  due_on        TEXT,                       -- YYYY-MM-DD (London)
  source        TEXT    NOT NULL DEFAULT 'manual', -- manual / system / email / meeting …
  link          TEXT,                       -- page in the app the task is about
  ref_entity    TEXT,                       -- e.g. 'test_plan', 'test_result'
  ref_id        TEXT,
  created_by    INTEGER REFERENCES users(id), -- NULL when the system made it
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at  TEXT,
  completed_by  INTEGER REFERENCES users(id)
);
CREATE INDEX tasks_owner ON tasks(owner_id, status);
CREATE INDEX tasks_ref ON tasks(ref_entity, ref_id);

-- In-app notifications (e.g. the I/C hearing about a failed test). Email can be added later.
CREATE TABLE notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  title       TEXT    NOT NULL,
  body        TEXT,
  link        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_at     TEXT
);
CREATE INDEX notifications_user ON notifications(user_id, read_at);

-- Things that get tested: equipment, and (next) products for sale.
CREATE TABLE test_subjects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL CHECK (kind IN ('equipment', 'product')),
  name        TEXT    NOT NULL,
  code        TEXT,                         -- asset number or SKU
  location    TEXT,
  katana_id   TEXT,                         -- products copied from Katana
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A test that repeats: what, how often, the desired result, who does it and who is I/C.
CREATE TABLE test_plans (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id      INTEGER NOT NULL REFERENCES test_subjects(id),
  name            TEXT    NOT NULL,         -- e.g. 'Calibration (boiling water)'
  every_n         INTEGER NOT NULL CHECK (every_n > 0),
  every_unit      TEXT    NOT NULL CHECK (every_unit IN ('day', 'week', 'month', 'year')),
  result_type     TEXT    NOT NULL CHECK (result_type IN ('pass_fail', 'range')),
  min_value       REAL,                     -- range tests: desired min / max (either may be blank)
  max_value       REAL,
  unit            TEXT,                     -- e.g. '°C'
  desired         TEXT,                     -- plain-words desired result / method
  responsible_id  INTEGER REFERENCES users(id),
  ic_id           INTEGER REFERENCES users(id),
  remind_days     INTEGER NOT NULL DEFAULT 7, -- task appears this many days before due
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX test_plans_subject ON test_plans(subject_id);

-- Results lock once saved. A correction is a new row pointing at the original.
CREATE TABLE test_results (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id            INTEGER NOT NULL REFERENCES test_plans(id),
  tested_on          TEXT    NOT NULL,      -- YYYY-MM-DD
  value              REAL,                  -- range tests
  passed             INTEGER NOT NULL CHECK (passed IN (0, 1)),
  note               TEXT,                  -- required when failed: what was done about it
  lab                TEXT,                  -- micro tests: lab name / reference
  report_key         TEXT,                  -- R2 key of an attached report (later)
  corrects_id        INTEGER REFERENCES test_results(id),
  recorded_by        INTEGER NOT NULL REFERENCES users(id),
  recorded_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX test_results_plan ON test_results(plan_id, tested_on);

CREATE TRIGGER test_results_no_update BEFORE UPDATE ON test_results
BEGIN SELECT RAISE(ABORT, 'test results are locked; add a correction instead'); END;
CREATE TRIGGER test_results_no_delete BEFORE DELETE ON test_results
BEGIN SELECT RAISE(ABORT, 'test results are locked; add a correction instead'); END;
