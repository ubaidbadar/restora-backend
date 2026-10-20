import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  restaurantId?: string;
  /** Queries see every restaurant. Only for code that scopes itself (auth lookups, public QR lookups, cleanup). */
  bypassTenant?: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function getTenantId(): string | undefined {
  return tenantStorage.getStore()?.restaurantId;
}

export function isBypassTenant(): boolean {
  return !!tenantStorage.getStore()?.bypassTenant;
}

/** True inside a request (or job) that set a tenant store, scoped or not. Outside one (scripts, tests) queries run as written. */
export function hasTenantStore(): boolean {
  return tenantStorage.getStore() !== undefined;
}

/*
 * `fn` is awaited inside the store on purpose: a Mongoose query is lazy and only runs when awaited,
 * so `runWithoutTenant(() => Model.find())` must await it here, not after the store is gone.
 */

/** Runs `fn` scoped to one restaurant. Without an id, tenant queries inside `fn` fail instead of reading every restaurant. */
export function runWithTenant<T>(restaurantId: string | undefined, fn: () => PromiseLike<T> | T): Promise<T> {
  return tenantStorage.run({ restaurantId, bypassTenant: false }, async (): Promise<T> => await fn());
}

export function runWithoutTenant<T>(fn: () => PromiseLike<T> | T): Promise<T> {
  return tenantStorage.run({ bypassTenant: true }, async (): Promise<T> => await fn());
}
