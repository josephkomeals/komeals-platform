-- Foundation: users (name + 4-digit PIN), login sessions, audit log.
-- Migrations only ever add; never drop tables or rows that hold live data.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  role          TEXT    NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'manager', 'operator')),
  pin_hash      TEXT    NOT NULL,           -- PBKDF2-SHA256, base64
  pin_salt      TEXT    NOT NULL,           -- base64
  active        INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT,                       -- ISO time; set after too many wrong PINs
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  token_hash  TEXT    PRIMARY KEY,          -- SHA-256 of the cookie token; the token itself is never stored
  user_id     INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT    NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Every change to every record is written here. Rows are never updated or deleted.
CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  user_id    INTEGER REFERENCES users(id),  -- NULL for system actions
  entity     TEXT    NOT NULL,              -- e.g. 'user', 'make_order'
  entity_id  TEXT,
  action     TEXT    NOT NULL,              -- e.g. 'create', 'update', 'lock', 'unlock', 'login'
  details    TEXT                           -- JSON: what changed
);
CREATE INDEX audit_log_entity ON audit_log(entity, entity_id);
CREATE INDEX audit_log_at ON audit_log(at);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
