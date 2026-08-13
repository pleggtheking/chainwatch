/**
 * Redis connection for pub/sub (real-time event feed to dashboard).
 */

import Redis from 'ioredis';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

export const redisSub = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

/** Publish a finding to the workspace channel for WebSocket fan-out. */
export async function publishFinding(workspaceId: string, finding: unknown): Promise<void> {
  await redis.publish(`chainwatch:workspace:${workspaceId}`, JSON.stringify(finding));
}
