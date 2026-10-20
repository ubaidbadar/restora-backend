/** An error the error handler turns into `{ message }` with this status. */
export default function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}
