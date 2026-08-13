/**
 * Database migration runner — executes schema.sql against the configured database.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate(): Promise<void> {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  console.log('Running migrations...');
  await sql.unsafe(schema);
  console.log('Migrations complete.');

  await sql.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
