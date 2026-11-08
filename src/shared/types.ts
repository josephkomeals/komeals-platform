export type Role = 'admin' | 'manager' | 'operator';

export type User = { id: number; name: string; role: Role; active: number };

export type AppEnv = {
  Bindings: { DB: D1Database; APP_ENV: string };
  Variables: { user?: User };
};
