/** The web app's address (the first of CLIENT_ORIGIN), for links and images in emails. */
export default function appOrigin(): string {
  return (process.env.CLIENT_ORIGIN || 'http://localhost:3000').split(',')[0]!.trim().replace(/\/+$/, '');
}
