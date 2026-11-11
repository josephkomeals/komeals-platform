# Team pages – spec (first module of KoMeals Platform)

Status: agreed direction, Nov 2026. Designs: `design/team-pages/` (mockups only, example data).
Canvas with clickable versions: https://claude.ai/artifact/N8RmQJpQpZCVsGci7EyD8j

These are the first pages of the new MRP. They replace the monday.com board
"Komeals Projects & Tasks" once they work, and must stay generic enough to set
up for another company (see "Reuse for other companies").

All four pages sit in a **Team** section of the sidebar:
My day · Team overview · Responsibilities · Daily checks.

---

## 1. My day

Who: every user sees their own; managers can switch person.

- Header: date, person, "x of y done".
- Filters: Today · This week · Overdue.
- Tiles: Due today, Done, Overdue, Snoozed emails.
- **Today's plan**: time-ordered list. Each row = time slot, checkbox, title,
  priority pill, area pill. Overdue items pinned at the top.
- **Protected blocks** per person (Joseph: 10:00–12:00 for Faigy training,
  issues and new emails). Tasks are not scheduled into protected time.
- Side panels: Checks today (links to Daily checks), To discuss (count per
  person), Waiting on others (with days waiting).

## 2. Team overview

- Period switch: Yesterday · Last 7 days · Last 30 days.
- Tiles: Done, Not done, Overdue, Snoozed emails, Checks completed.
- Table per person: Done, Not done, Overdue, On-time % bar, Checks, **System match**.
- **System match** = tasks marked Done compared with the real record
  (e.g. "Close all MOs" marked done but MO-1243 still open). Starts with Katana,
  later the MRP's own make orders / POs / SOs.
- **Needs attention** list: mismatches, overdue, waiting > 3 days, missed checks.
- Needs a `completed_at` timestamp on every task (set when status → Done).

## 3. Responsibilities (RACI)

- Grouped by person. Each **duty**: title, R (does it), A (signs off),
  C / I, frequency (daily / weekly / monthly / per event), standard
  (e.g. "by 17:30, actual quantities entered"), where it's checked
  (Katana, Xero, Tasks, Daily checks), this-week score.
- Every daily/weekly/monthly duty **generates recurring tasks** for the R person,
  which then appear in their My day.
- Duties are agreed with the team first; the mockup rows are a draft.

## 4. Daily checks (food safety and H&S)

- **Temperature log**: one row per unit (Freezer 1, Freezer 2, walk-in chiller,
  blast chiller, Finchley cold room – placeholders, real list to confirm).
  AM by 10:00, PM by 15:00. Target range per unit
  (freezer -18°C or colder, chiller 0–5°C).
- **Log a reading**: unit, temperature, PIN sign-off, note.
  Out-of-range readings **require** a note / corrective action and alert
  Joseph and Micky.
- **Corrective actions**: open until closed, with who/when.
- **H&S checklist**: items with frequency (daily / weekly) and done-by/time.
- **7-day history grid** per unit (in range / missed / out of range).
- **Export for EHO**: date range → PDF/CSV.
- Readings and checklist entries **lock once saved** and keep a full audit log
  (same rule as all MRP records). Corrections are new entries that reference
  the original, never edits.
- Check schedules create items in each person's My day ("Checks today").

### 4a. Periodic tests: equipment and micro testing (added 11 Nov 2026)

The Daily checks page has tabs: **Temperatures · Equipment · Micro testing**.

- **Equipment**: each item has one or more tests, each with how often
  (every N days / weeks / months / years), the desired result (a reading with
  min / max, or pass / fail), who does it, and the **I/C** (person in charge).
- **Micro testing**: one row per product for sale (copied from Katana until the
  MRP has its own products), last tested, result, next due, full history, lab
  reference and report PDF.
- Next due = last test date + interval. Never tested = due now. A fail means retest.
- A test inside its reminder window (default 7 days) puts a "Test due" task in
  the tester's list (daily cron, 06:00 UTC). Recording the result closes it.
- A fail requires a note, creates a high-priority "Corrective action and retest"
  task, and notifies the I/C (in the app; email next). No I/C = all admins.
- Results lock once saved; corrections are new rows pointing at the original.

---

## Data model (first draft)

- `User` – name, role, PIN (hashed), protected blocks.
- `Task` – title, owner(s), status (not_started / working / stuck / snoozed /
  done / no_longer_needed / cancelled), priority (high / med / low), area
  (Orders/POs, Production, Admin, Systems), due_at, start_at, end_at,
  waiting_on, source (email / notepad / meeting / phone / system),
  email_link, recurring_rule, duty_id?, completed_at, created_at.
- `DiscussionPoint` – person to discuss with, text, status.
- `Duty` – title, r_user, a_user, c_users, i_users, frequency, standard,
  check_source, active.
- `CheckUnit` – name, type (freezer / chiller / blast / cold room), min, max, active.
- `CheckSchedule` – unit or checklist item, times (e.g. 10:00, 15:00), assignee.
- `CheckReading` – unit, value, taken_at, user, in_range, note, locked.
- `ChecklistItem` / `ChecklistEntry` – item, frequency, done_at, user, locked.
- `CorrectiveAction` – reading or entry, action taken, by, opened_at, closed_at.
- `TestSubject` – equipment or product (name, code, location, katana_id).
- `TestPlan` – subject, test name, every_n + every_unit, result type, min/max/unit,
  desired, responsible, I/C, remind_days, active.
- `TestResult` – plan, tested_on, value, passed, note, lab, report, corrects_id, locked.
- `Notification` – user, title, body, link, read_at.
- `AuditLog` – shared foundation table (who, what, when, before/after).

## Integrations

- Gmail: emails that need action become tasks (source = email, email_link);
  snoozed emails become tasks with status "snoozed" and due = snooze date.
- Katana (until the MRP replaces it): system-match checks for MOs, POs, SOs.
- Xero: invoice / payment duties.
- Daily brief: reads My day + Team overview data each morning.

## Reuse for other companies

Keep the core generic; put company-specific values in settings:
team members and roles, areas, working hours and protected time, check units
and ranges, which systems to match against, priority rules.

## Build order

1. Foundation already planned (audit log, locked records, users + PIN login).
2. Daily checks (small, self-contained, immediate value, needs locked records).
3. Tasks + My day.
4. Responsibilities → recurring tasks.
5. Team overview + system match.
