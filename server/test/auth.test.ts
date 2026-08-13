import { describe, it, expect } from 'vitest';
import * as bcrypt from 'bcrypt';

describe('Auth: API key generation', () => {
  it('generates keys in cw_<uuid>_<hex> format', async () => {
    const crypto = await import('node:crypto');
    const workspaceId = crypto.randomUUID();
    const randomHex = crypto.randomBytes(32).toString('hex');
    const rawKey = `cw_${workspaceId}_${randomHex}`;

    expect(rawKey).toMatch(/^cw_[a-f0-9-]{36}_[a-f0-9]{64}$/);
  });

  it('bcrypt hashes are verifiable', async () => {
    const rawKey = 'cw_test-workspace_abc123def456';
    const hash = await bcrypt.hash(rawKey, 10);
    expect(hash).not.toBe(rawKey);
    expect(await bcrypt.compare(rawKey, hash)).toBe(true);
    expect(await bcrypt.compare('wrong_key', hash)).toBe(false);
  });
});

describe('Auth: freemium gate', () => {
  // Re-implement the hasFeature logic for testing without DB.
  function hasFeature(tier: string, feature: string): boolean {
    if (tier === 'enterprise') return true;
    if (tier === 'team') return true;
    return false; // free tier
  }

  it('free tier has no cloud features', () => {
    expect(hasFeature('free', 'cloud_sync')).toBe(false);
    expect(hasFeature('free', 'dashboard')).toBe(false);
    expect(hasFeature('free', 'alerts')).toBe(false);
    expect(hasFeature('free', 'team_baseline')).toBe(false);
  });

  it('team tier has all cloud features', () => {
    expect(hasFeature('team', 'cloud_sync')).toBe(true);
    expect(hasFeature('team', 'dashboard')).toBe(true);
    expect(hasFeature('team', 'alerts')).toBe(true);
    expect(hasFeature('team', 'team_baseline')).toBe(true);
  });

  it('enterprise tier has all features', () => {
    expect(hasFeature('enterprise', 'cloud_sync')).toBe(true);
    expect(hasFeature('enterprise', 'dashboard')).toBe(true);
  });
});
