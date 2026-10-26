import pg from 'pg';
import { env } from './env.js';

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(env.databaseUrl);

// Neon's dashboard gives sslmode=require; pg treats it as verify-full and warns that this will change,
// so ask for full certificate verification explicitly.
const connectionString = env.databaseUrl.replace(/sslmode=(require|prefer|verify-ca)/, 'sslmode=verify-full');

export const pool = new pg.Pool({
  connectionString,
  // Neon requires TLS; sslmode in the URL also enables it, this covers URLs without it.
  ssl: isLocal || /sslmode=/.test(connectionString) ? undefined : { rejectUnauthorized: true },
  max: 10,
  // Opening a TLS connection to Neon costs ~1.5 s; keep idle connections instead of the 10 s default.
  idleTimeoutMillis: 5 * 60 * 1000,
});

// Neon closes idle connections from its side. pg reports that on the pool; without a listener Node
// treats it as an uncaught error and exits. The pool drops the broken client and opens a new one.
pool.on('error', (err) => {
  console.warn(`Idle database connection closed: ${err.code ?? err.message}`);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Runs fn(client) inside a transaction; commits on success, rolls back on error. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
