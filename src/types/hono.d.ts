import 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    /** How the request was authenticated: a web session or a POS terminal with someone unlocked. */
    via: 'web' | 'pos';
  }
}
