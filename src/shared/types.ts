import type { Context } from 'hono';

export type Role = 'admin' | 'manager' | 'operator';

export type User = { id: number; name: string; role: Role; active: number };

export type AppEnv = {
  Bindings: {
    DB: D1Database;
    APP_ENV: string;
    ALLOWED_EMAIL_DOMAIN: string;
    // Secrets (wrangler secret put). Until both are set, PIN login works on any device.
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
  };
  Variables: { user?: User };
};

export type AppContext = Context<AppEnv>;
