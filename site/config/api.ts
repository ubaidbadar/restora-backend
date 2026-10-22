/**
 * The guest pages' writes to the API. The site and the API are served by the same server, so these stay on this origin
 * (no CORS, no API address in the page). Answers the JSON, or throws an error with the API's message, said for a guest.
 */
async function post<T>(url: string, body: unknown): Promise<{ data: T }> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  } catch {
    throw Object.assign(new Error('We could not reach the restaurant. Check your connection and try again.'), { status: 0 });
  }
  const json = await res.json().catch(() => ({}));
  if (res.ok) return { data: json as T };
  throw Object.assign(new Error(typeof json.message === 'string' ? json.message : 'Something went wrong. Please ask a waiter.'), { status: res.status });
}

const api = { post };

export default api;
