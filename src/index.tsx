// KoMeals Platform – one Worker, separate modules.
// shared/ = login, users, audit log, layout. Modules (planner/, sales/, team/ …) mount below.

import { Hono } from 'hono';
import { loadUser, requireLogin, sameOrigin } from './shared/auth';
import { Shell } from './shared/layout';
import { googleRoutes } from './shared/google';
import { loginRoutes } from './shared/login';
import { settingsRoutes } from './shared/settings';
import { checksRoutes } from './team/checks';
import { myDayRoutes } from './team/my-day';
import { syncDueTasks } from './team/tests';
import { unreadCount } from './team/tasks';
import type { AppEnv } from './shared/types';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'same-origin');
  if (c.res.headers.get('Content-Type')?.includes('text/html')) c.header('Cache-Control', 'no-store');
});
app.use('*', sameOrigin);
app.use('*', loadUser);

// On the test site, show what went wrong instead of a bare "Internal Server Error".
app.onError((err, c) => {
  console.error(err);
  const detail = c.env.APP_ENV === 'live' ? '' : `\n\nDetail (test site only): ${err.message}`;
  return c.text(`Something went wrong. Please tell Joseph what you were doing.${detail}`, 500);
});

app.get('/health', (c) => c.json({ ok: true, env: c.env.APP_ENV }));

app.route('/', loginRoutes);
app.route('/', googleRoutes);

app.use('*', requireLogin);
app.use('*', async (c, next) => {
  c.set('unread', await unreadCount(c.env.DB, c.get('user')!.id));
  await next();
});

app.get('/', (c) =>
  c.html(
    <Shell title="Home" path="/" user={c.get('user')!} env={c.env.APP_ENV} unread={c.get('unread')}>
      <div>
        <h1>Welcome, {c.get('user')!.name.split(' ')[0]}</h1>
        <p class="sub">KoMeals Platform. Modules are switched on here as they are built.</p>
      </div>
      <div class="tiles">
        <div class="card tile">
          <div class="k">Planner</div>
          <div class="v" style="font-size:16px">
            <span class="pill orange">Moving in next</span>
          </div>
        </div>
        <div class="card tile">
          <div class="k">Sales dashboard</div>
          <div class="v" style="font-size:16px">
            <span class="pill orange">After the Planner</span>
          </div>
        </div>
        <div class="card tile">
          <div class="k">Team pages</div>
          <div class="v" style="font-size:16px">
            <span class="pill">Later</span>
          </div>
        </div>
      </div>
    </Shell>,
  ),
);

app.route('/settings', settingsRoutes);
app.route('/team/checks', checksRoutes);
app.route('/team', myDayRoutes);

export default {
  fetch: app.fetch,
  // Daily (see triggers in wrangler.jsonc): put tests that are coming due into people's task lists.
  async scheduled(_event: ScheduledController, env: AppEnv['Bindings'], ctx: ExecutionContext) {
    ctx.waitUntil(syncDueTasks(env.DB).then((n) => console.log(`syncDueTasks: ${n} task(s) created`)));
  },
} satisfies ExportedHandler<AppEnv['Bindings']>;
