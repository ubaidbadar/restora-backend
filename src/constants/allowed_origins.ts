/** Origins allowed to call the API with cookies: CLIENT_ORIGIN (comma-separated for several) plus local dev servers. */
const configured = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const devOrigins =
  process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'];

const allowedOrigins: string[] = [...new Set([...configured, ...devOrigins])];

export default allowedOrigins;
