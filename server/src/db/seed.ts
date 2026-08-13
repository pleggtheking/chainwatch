/**
 * Seed script — creates a dev workspace with a test API key.
 * Run with: npm run db:seed
 */

import { createWorkspace } from './queries.js';
import { generateApiKey } from '../api/auth.js';
import { sql } from './index.js';

async function seed(): Promise<void> {
  console.log('Seeding database...');

  // Create a dev workspace.
  let workspace;
  try {
    workspace = await createWorkspace('Dev Team', 'dev-team', 'team');
  } catch {
    // Already exists — fetch it.
    const rows = await sql`SELECT * FROM workspaces WHERE slug = 'dev-team'`;
    workspace = rows[0];
    console.log('  Workspace already exists, reusing.');
  }

  if (!workspace) {
    throw new Error('Failed to create or find workspace');
  }

  console.log(`  Workspace: ${workspace.name} (${workspace.id})`);

  // Generate an API key.
  const apiKey = await generateApiKey(workspace.id as string, 'dev-seed');
  console.log(`  API Key: ${apiKey}`);
  console.log('');
  console.log('  Save this API key — it won\'t be shown again.');
  console.log('  Use it with: chainwatch sync --api-key <key>');

  await sql.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
