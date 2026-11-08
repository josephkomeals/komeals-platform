// KoMeals Platform – one Worker, separate modules.
// shared/ = login, users, audit log, layout. Modules (planner/, sales/, team/ …) mount below.

import { Hono } from 'hono';
import { loadUser, requireLogin, sameOrigin } from './shared/auth';
import { Shell } from './shared/layout';
import { googleRoutes } from './shared/google';
import { loginRoutes } from './shared/login';
import { settingsRoutes } from './shared/settings';
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

app.get('/health', (c) => c.json({ ok: true, env: c.env.APP_ENV }));

app.route('/', loginRoutes);
app.route('/', googleRoutes);

app.use('*', requireLogin);

app.get('/', (c) =>
  c.html(
    <Shell title="Home" path="/" user={c.get('user')!} env={c.env.APP_ENV}>
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

export default app;
