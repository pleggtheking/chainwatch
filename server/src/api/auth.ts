/**
 * Auth middleware — validates API keys on every request.
 *
 * API key format: cw_<workspace_id>_<random_32_bytes_hex>
 * The server stores bcrypt(key_hash) — never the raw key.
 *
 * On validation, sets `request.workspace` to the workspace object and
 * `request.apiKey` to the key record.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as bcrypt from 'bcrypt';
import { getApiKeyByHash, getWorkspaceById, touchApiKey } from '../db/queries.js';
import type { Workspace } from '../db/queries.js';

declare module 'fastify' {
  interface FastifyRequest {
    workspace?: Workspace;
    apiKeyId?: string;
  }
}

/** Extract the API key from the Authorization header. */
function extractApiKey(req: FastifyRequest): string | null {
  const auth = req.headers['authorization'];
  if (!auth) return null;
  const match = /^Bearer\s+(cw_[a-f0-9-]+_[a-f0-9]+)$/i.exec(auth);
  if (!match) return null;
  return match[1] ?? null;
}

/**
 * Auth middleware — validates the API key and attaches workspace to the request.
 * Calls done() on success, sends 401 on failure.
 */
export async function authMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const rawKey = extractApiKey(req);
  if (!rawKey) {
    await reply.code(401).send({ error: 'Missing or invalid Authorization header. Expected: Bearer cw_<workspace>_<key>' });
    return;
  }

  // Extract workspace ID from the key format: cw_<uuid>_<hex>
  const parts = rawKey.split('_');
  if (parts.length < 3) {
    await reply.code(401).send({ error: 'Invalid API key format' });
    return;
  }

  const workspaceId = parts[1]!;

  // Verify the workspace exists.
  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    await reply.code(401).send({ error: 'Invalid API key — workspace not found' });
    return;
  }

  // Look up the API key by trying to match the bcrypt hash.
  // Since bcrypt hashes are unique, we compare against stored hashes.
  // For efficiency, we store a lookup prefix (first 16 chars of the key) to
  // narrow the search, then do a full bcrypt.compare.
  // For now, we do a full table scan of api_keys for this workspace.
  // In production, add a key_prefix column for indexing.
  const { sql } = await import('../db/index.js');
  const keys = await sql`SELECT * FROM api_keys WHERE workspace_id = ${workspaceId}`;
  let matchedKeyId: string | null = null;
  for (const keyRow of keys) {
    const match = await bcrypt.compare(rawKey, keyRow.key_hash as string);
    if (match) {
      matchedKeyId = keyRow.id as string;
      break;
    }
  }

  if (!matchedKeyId) {
    await reply.code(401).send({ error: 'Invalid API key' });
    return;
  }

  req.workspace = workspace;
  req.apiKeyId = matchedKeyId;

  // Update last_used_at (fire and forget).
  touchApiKey(matchedKeyId).catch(() => {});
}

/**
 * Generate a new API key for a workspace.
 * Returns the raw key (shown to the user once) and stores the bcrypt hash.
 */
export async function generateApiKey(workspaceId: string, label: string): Promise<string> {
  const crypto = await import('node:crypto');
  const randomHex = crypto.randomBytes(32).toString('hex');
  const rawKey = `cw_${workspaceId}_${randomHex}`;
  const keyHash = await bcrypt.hash(rawKey, 10);
  await import('../db/queries.js').then((m) => m.createApiKey(workspaceId, keyHash, label));
  return rawKey;
}

/** Check if a workspace has access to a feature (freemium gate). */
export function hasFeature(workspace: Workspace, feature: 'cloud_sync' | 'dashboard' | 'alerts' | 'team_baseline'): boolean {
  if (workspace.tier === 'enterprise') return true;
  if (workspace.tier === 'team') return true;
  // Free tier: no cloud features.
  return false;
}
