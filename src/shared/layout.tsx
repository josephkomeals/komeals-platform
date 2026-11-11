// Zoho Inventory style shell: dark sidebar, white top bar, light grey page.
// Colours follow design/team-pages mockups.

import type { Child } from 'hono/jsx';
import type { User } from './types';

const css = `
:root{--bg:#f6f7fb;--ink:#1c2230;--muted:#5b6475;--line:#e3e6ee;--field:#d5d9e3;--blue:#2f6fdb;--blue-dark:#1f55b3;--blue-soft:#e4ecfb;
--green:#1f7a4a;--green-soft:#e3f4ea;--orange:#8a4b00;--orange-soft:#fdf0dc;--red:#b42318;--red-soft:#fde8e7;--side:#1d2433;--side-hover:#2b3447}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);font-family:Inter,system-ui,sans-serif;color:var(--ink);font-size:14px}
a{color:var(--blue)}a:hover{color:var(--blue-dark)}
.app{display:flex;min-height:100vh}
.side{flex:0 0 220px;background:var(--side);padding:16px 12px;display:flex;flex-direction:column;gap:2px}
.brand{color:#fff;font-weight:600;font-size:16px;padding:6px 14px 18px}.brand span{color:#8fa0bf;font-weight:400}
.nav{display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-radius:6px;color:#c9cfdc;text-decoration:none}
.nav:hover{background:var(--side-hover);color:#fff}
.nav.on,.nav.on:hover{background:var(--blue);color:#fff}
.nav.soon{color:#6b7690}.nav.soon:hover{background:transparent;color:#6b7690;cursor:default}
.nav small{font-size:11px}
.section{color:#8fa0bf;font-size:12px;padding:18px 14px 6px}
main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}
.top{background:#fff;border-bottom:1px solid var(--line);padding:12px 28px;display:flex;align-items:center;gap:12px}
.top .grow{flex:1}
.env{font-size:12px;padding:3px 9px;border-radius:999px;background:var(--orange-soft);color:var(--orange)}
.bell{text-decoration:none;color:var(--muted);font-size:13px;display:inline-flex;align-items:center;gap:6px}
.bell .count{background:var(--red);color:#fff;border-radius:999px;font-size:11px;padding:1px 7px;font-weight:600}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line)}
.tabs a,.tabs span{padding:9px 14px;text-decoration:none;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs a.on{color:var(--blue-dark);border-color:var(--blue);font-weight:500}.tabs span{color:#9aa3b5}
textarea{border:1px solid var(--field);border-radius:6px;padding:8px 12px;font:inherit;background:#fff;min-height:64px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;align-items:start}
dl.facts{display:grid;grid-template-columns:max-content 1fr;gap:8px 18px;margin:0}dl.facts dt{color:var(--muted)}dl.facts dd{margin:0}
.avatar{width:34px;height:34px;border-radius:50%;background:var(--blue-soft);color:var(--blue-dark);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600}
.page{padding:24px 28px 40px;display:flex;flex-direction:column;gap:20px}
h1{margin:0;font-size:24px;font-weight:600}h2{margin:0;font-size:16px;font-weight:600}
.sub{margin:4px 0 0;color:var(--muted)}
.card{background:#fff;border:1px solid var(--line);border-radius:10px}
.card-h{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px}
.card-b{padding:16px 18px}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-weight:500;color:var(--muted);font-size:13px;padding:10px 18px;border-bottom:1px solid var(--line)}
td{padding:10px 18px;border-bottom:1px solid #eef0f5}
tr:last-child td{border-bottom:0}
.pill{font-size:12px;padding:3px 9px;border-radius:999px;white-space:nowrap;display:inline-block;background:#eef0f5;color:#3d4556}
.pill.green{background:var(--green-soft);color:var(--green)}.pill.orange{background:var(--orange-soft);color:var(--orange)}.pill.red{background:var(--red-soft);color:var(--red)}
.btn{height:36px;padding:0 14px;border:0;border-radius:6px;background:var(--blue);color:#fff;font:inherit;font-weight:500;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
.btn:hover{background:var(--blue-dark);color:#fff}
.btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--field)}.btn.ghost:hover{background:#f3f4f7}
.btn.small{height:30px;padding:0 10px;font-size:13px}
input,select{height:36px;border:1px solid var(--field);border-radius:6px;padding:0 12px;font:inherit;background:#fff}
label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.tile{padding:14px 16px}.tile .k{font-size:13px;color:var(--muted)}.tile .v{font-size:22px;font-weight:600;margin-top:4px}
.msg{padding:10px 14px;border-radius:6px;background:var(--red-soft);color:var(--red)}
.msg.ok{background:var(--green-soft);color:var(--green)}
.muted{color:var(--muted)}
.names{border:0;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.names legend{font-size:13px;color:var(--muted);margin-bottom:6px;padding:0}
.name-tile{display:block;cursor:pointer}
.name-tile input{position:absolute;opacity:0;pointer-events:none}
.name-tile span{display:flex;align-items:center;justify-content:center;min-height:52px;padding:8px;border:1px solid var(--field);border-radius:8px;background:#fff;color:var(--ink);font-size:15px;font-weight:500;text-align:center}
.name-tile:hover span{background:#f3f4f7}
.name-tile input:checked+span{border-color:var(--blue);background:var(--blue-soft);color:var(--blue-dark)}
.name-tile input:focus-visible+span{outline:2px solid var(--blue);outline-offset:2px}
@media (max-width:760px){.app{flex-direction:column}.side{flex:none;flex-direction:row;flex-wrap:wrap;padding:10px}.section,.brand{display:none}.top,.page{padding-left:16px;padding-right:16px}}
`;

export function Doc(props: { title: string; children: Child }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title} · KoMeals</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{props.children}</body>
    </html>
  );
}

type NavItem = { href: string; label: string; soon?: boolean; adminOnly?: boolean };

// Agreed sidebar (CLAUDE.md). Items marked soon are placeholders until their module is built.
const MAIN: NavItem[] = [
  { href: '/', label: 'Home' },
  { href: '/inventory', label: 'Inventory', soon: true },
  { href: '/production', label: 'Production', soon: true },
  { href: '/planner', label: 'Planner', soon: true },
  { href: '/sales', label: 'Sales', soon: true },
  { href: '/purchases', label: 'Purchases', soon: true },
  { href: '/reports', label: 'Reports', soon: true },
];
const TEAM: NavItem[] = [
  { href: '/team/my-day', label: 'My day' },
  { href: '/team/overview', label: 'Team overview', soon: true },
  { href: '/team/responsibilities', label: 'Responsibilities', soon: true },
  { href: '/team/checks', label: 'Daily checks' },
];
const SETTINGS: NavItem[] = [
  { href: '/settings/users', label: 'Users', adminOnly: true },
  { href: '/settings/audit', label: 'Audit log', adminOnly: true },
];

function Nav(props: { items: NavItem[]; path: string; user: User }) {
  return (
    <>
      {props.items
        .filter((i) => !i.adminOnly || props.user.role === 'admin')
        .map((i) =>
          i.soon ? (
            <span class="nav soon" title="Coming soon">
              {i.label} <small>soon</small>
            </span>
          ) : (
            <a class={`nav${props.path === i.href || (i.href !== '/' && props.path.startsWith(i.href + '/')) ? ' on' : ''}`} href={i.href}>
              {i.label}
            </a>
          ),
        )}
    </>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function Shell(props: { title: string; path: string; user: User; env: string; unread?: number; children: Child }) {
  return (
    <Doc title={props.title}>
      <div class="app">
        <nav class="side" aria-label="Main">
          <div class="brand">
            KoMeals <span>Platform</span>
          </div>
          <Nav items={MAIN} path={props.path} user={props.user} />
          <div class="section">Team</div>
          <Nav items={TEAM} path={props.path} user={props.user} />
          {props.user.role === 'admin' && <div class="section">Settings</div>}
          <Nav items={SETTINGS} path={props.path} user={props.user} />
        </nav>
        <main>
          <div class="top">
            <div class="grow" />
            {props.env !== 'live' && <span class="env">Test database</span>}
            <a class="bell" href="/team/my-day#notifications" title="Notifications">
              Notifications{props.unread ? <span class="count">{props.unread}</span> : null}
            </a>
            <span class="muted">{props.user.name}</span>
            <div class="avatar" aria-hidden="true">
              {initials(props.user.name)}
            </div>
            <form method="post" action="/logout">
              <button class="btn ghost small" type="submit">
                Log out
              </button>
            </form>
          </div>
          <div class="page">{props.children}</div>
        </main>
      </div>
    </Doc>
  );
}
