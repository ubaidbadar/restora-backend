/** What went wrong, said for a person: the API's message when there is one. */
export default function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  return 'Something went wrong!';
}
