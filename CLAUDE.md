# KoMeals Platform – project notes for Claude

KoMeals Platform: the fresh-start MRP plus team, planner and sales modules for the KoMeals kitchen (began 16 Oct 2026).
The earlier attempt is `josephkomeals/mrp-nutrition-platform` (Next.js 14,
Prisma, PostgreSQL, Tailwind). Parts may be reused, but this repo is the new home.

## Agreed decisions

- The MRP has its own database from day one. Synced with Katana while testing,
  then Katana is switched off once trusted.
- Look and feel: Zoho Inventory style. Neutral blue, status colours
  (green = done, orange = draft / due, red = problem). Not KoMeals brand colours.
- Sidebar: Home, Inventory, Production, Sales, Purchases, Reports, plus a
  **Team** section (My day, Team overview, Responsibilities, Daily checks).
- Record discipline like Zoho: every record has an audit log; records are
  closed / locked properly; "click Edit to unlock".
- Planning playground stays sandboxed; only when locked does it become real
  make orders, with an audit trail.
- Operator screens stay minimal. Login: Sign in with Google (@komeals.com) for office
  staff; tap name + 4-digit PIN only on registered kitchen tablets (decided 8 Nov 2026).

## Hosting and structure

- Hosted on Cloudflare: Workers (app), D1 (database), R2 (files). Paid Workers
  plan (~$5/month) once the team relies on it.
- GitHub `main` = live. Work on branches; each branch gets a Cloudflare preview
  with the **test** database. Merge to `main` to go live.
- Two databases: test and live. Never reset or drop the live database.
- All schema changes are migrations that keep existing rows.
- One app, separate modules, built one at a time:
  `shared/` (login + PIN, users, audit log, sidebar, theme), `team/`,
  `planner/` (move the existing KoMeals Planner in), `sales/` (Leo's sales
  dashboard), `production/` etc. Modules don't depend on each other for now;
  links between them come later through the shared database.

## Data model (core)

Products (with variants: own SKU, price, portion size; one shared recipe),
recipes (can contain recipes; each line = amount used + waste amount; final
yield), ingredients (base unit + purchase units, default waste %, nutrition,
allergens, multiple brands × hechsher options, optional batch tracking),
sub-batches, make orders (separate MOs for sub-recipes, linked to parent;
record operator, time taken, actual quantities), sales orders (real customers
only), purchasing (multiple suppliers per ingredient, preferred supplier,
price history, goods-in against PO, invoices matched and pushed to Xero),
stock counts (full and spot; differences need approval).
Full detail: Claude Docs "KoMeals MRP — Plan v1 (Fresh Start)".

## Build order

1. Foundation: audit log, locked records, users + PIN login.
2. Team pages – see `docs/team-pages-spec.md` (Daily checks first).
3. Ingredients, recipes, products.
4. Make orders, sales orders, purchasing.
5. Katana sync for side-by-side testing. Reports later.

## Designs

`design/team-pages/*.dc.html` are mockups (example data) of the four Team pages.
Treat them as the visual reference; rebuild them as real components.

## Working style

- Joseph gives the build a couple of hours a week; keep steps small and shippable.
- Explain choices briefly and frame hurdles as next steps.
- Never add "Sent using AI" to emails. Notes Claude adds in Katana/Zoho end with
  "Sent using AI".
