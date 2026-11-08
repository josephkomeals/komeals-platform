-- Google sign-in for office staff; name + PIN only on registered kitchen tablets.

-- Google account email for each user (NULL = PIN-only, e.g. kitchen operators).
ALTER TABLE users ADD COLUMN email TEXT;
CREATE UNIQUE INDEX users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;

-- A user without a PIN has pin_hash = '' and can't use the tablet login.

-- Devices an admin has registered as kitchen tablets. Only these show the PIN screen.
CREATE TABLE devices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash  TEXT    NOT NULL UNIQUE,      -- SHA-256 of the device cookie
  name        TEXT    NOT NULL,             -- e.g. 'Kitchen tablet'
  created_by  INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used   TEXT,
  revoked_at  TEXT
);

-- How a session was started, so tablet sessions can be kept short.
ALTER TABLE sessions ADD COLUMN method TEXT NOT NULL DEFAULT 'pin';
