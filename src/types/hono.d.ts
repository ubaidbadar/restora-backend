import 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    /** How the request was authenticated: a web session or a POS terminal with someone unlocked. */
    via: 'web' | 'pos';
    /** The signed-in person; on a terminal, the one unlocked on it. */
    user: { id: string; name: string; email: string; image?: string | null };
  }
}
