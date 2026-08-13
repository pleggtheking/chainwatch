/**
 * Database connection — uses postgres.js (no ORM, as specified).
 *
 * Connection string from DATABASE_URL env var, defaults to local docker-compose.
 */

import postgres from 'postgres';

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgres://chainwatch:chainwatch_dev@localhost:5432/chainwatch';

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export type DbClient = typeof sql;
