# KoMeals Platform

Manufacturing, purchasing, sales and team management for the KoMeals kitchen.
Fresh start, Nov 2026.

## What's here

| Path | What it is |
| --- | --- |
| `CLAUDE.md` | Agreed decisions, data model and build order – read first |
| `src/index.tsx` | The Worker: wires the shared pieces and modules together |
| `src/shared/` | Login (name + PIN), users, audit log, Zoho-style layout |
| `migrations/` | D1 schema changes, applied in order. Only ever add; never drop live data |
| `docs/team-pages-spec.md` | Spec for the Team pages module |
| `design/team-pages/` | Mockups of the Team pages (example data) |

Clickable mockups: https://claude.ai/artifact/N8RmQJpQpZCVsGci7EyD8j

Stack: one Cloudflare Worker using [Hono](https://hono.dev) (server-rendered pages, no
front-end build), TypeScript, D1 for the database.

## Plan (Nov 2026)

1. **Platform shell** – login, users, audit log, sidebar. *(this step)*
2. Move the **Planner** worker in as `src/modules/planner/`.
3. Move the **Sales dashboard** worker in as `src/modules/sales/`.
4. Switch over: old worker URLs redirect here, then the old workers are retired.

Then the Team pages and the MRP build order in `CLAUDE.md`.

## Running it locally

```sh
npm install
npm run db:migrate:local   # creates a local test database
npm run dev                # http://localhost:8787
```

The first visit goes to **/setup**, where you create the first admin (name, Google email, PIN).
Add everyone else under **Settings → Users**.

## One-time Cloudflare setup

Databases (created 8 Nov 2026): `komeals-platform-live` and `komeals-platform-test`, IDs in `wrangler.jsonc`.

Two Workers, both built from this repo (Workers & Pages → Create → Import a repository).
`wrangler.jsonc` top level is **test**, the `previews` block is used for branch previews (also
the test database), and `--env live` is live.

| Worker | Build command | Deploy / preview command |
| --- | --- | --- |
| `komeals-platform-test` | `npx wrangler d1 migrations apply DB --remote` | main: `npx wrangler deploy`; branches: `npx wrangler preview` |
| `komeals-platform` (live, later) | `npx wrangler d1 migrations apply DB --remote --env live` | `npx wrangler deploy --env live` (main only) |

The build command runs for every branch (the deploy command only for `main`), so new tables reach the
test database as soon as a branch preview builds. Every branch gets its own preview URL on the test database; merging to `main` updates the
test site and live.

## Google sign-in setup (one time)

1. Google Cloud console → APIs & Services → Credentials → Create credentials →
   OAuth client ID → Web application. Under "Authorized redirect URIs" add
   `https://<live address>/auth/google/callback` and the same for the test address.
   (OAuth consent screen: User type **Internal**, so only @komeals.com accounts can use it.)
2. Store the two values as Worker secrets, for live and for test:
   ```sh
   npx wrangler secret put GOOGLE_CLIENT_ID              # test
   npx wrangler secret put GOOGLE_CLIENT_SECRET          # test
   npx wrangler secret put GOOGLE_CLIENT_ID --env live
   npx wrangler secret put GOOGLE_CLIENT_SECRET --env live
   ```
Until both secrets are set, the name + PIN screen works on any device, so the first admin can log in.

## Login and security notes

- **Office / anywhere:** Sign in with Google. Only verified @komeals.com accounts whose email is
  linked to an active user get in.
- **Kitchen tablet:** an admin registers the device once (Settings → Users → Kitchen tablets).
  Only registered devices show the tap-your-name + PIN screen; removing a tablet turns it off.
- PINs are hashed (PBKDF2), never stored as typed.
- 5 wrong PINs lock that user for 15 minutes; an admin can reset the PIN to unlock.
- Sessions last 12 hours (Google) or 8 hours (PIN). Deactivating a user logs them out everywhere.
- The audit log is append-only: the database refuses edits and deletes on it.
