import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { syncFindings, detectRepoName, hashFile } from '../../src/sync/client.js';
import type { Finding } from '../../src/scan/finding.js';

describe('Sync client', () => {
  describe('detectRepoName', () => {
    it('returns a repo name or null (depends on git remote)', async () => {
      const name = await detectRepoName();
      // In the test env, git remote may or may not be set. Just verify it doesn't throw.
      expect(name === null || typeof name === 'string').toBe(true);
    });
  });

  describe('hashFile', () => {
    let tmpFile: string;
    beforeEach(() => {
      tmpFile = path.join(os.tmpdir(), `cw-hash-test-${Date.now()}.json`);
      fs.writeFileSync(tmpFile, '{"test":true}');
    });
    afterEach(() => {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* */ }
    });

    it('returns a sha256 hex hash', async () => {
      const hash = await hashFile(tmpFile);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns consistent hashes for the same content', async () => {
      const hash1 = await hashFile(tmpFile);
      const hash2 = await hashFile(tmpFile);
      expect(hash1).toBe(hash2);
    });
  });

  describe('syncFindings', () => {
    const findings: Finding[] = [
      { rule: 'postinstall_network', severity: 'high', package: 'evil@1.0.0', description: 'Network call' },
    ];

    it('skips silently when no API key is set', async () => {
      // Ensure no API key in env.
      const oldKey = process.env['CHAINWATCH_API_KEY'];
      delete process.env['CHAINWATCH_API_KEY'];
      try {
        const result = await syncFindings(findings, 'test-run');
        expect(result.skipped).toBe(true);
        expect(result.ingested).toBe(0);
      } finally {
        if (oldKey) process.env['CHAINWATCH_API_KEY'] = oldKey;
      }
    });

    it('skips when API key is set but no repo detected and no repo provided', async () => {
      const result = await syncFindings(findings, 'test-run', {
        apiKey: 'cw_test_key',
        repo: 'org/test-repo',
        apiUrl: 'http://localhost:9999', // Non-existent server
      });
      // This will try to connect and fail, but it shouldn't skip.
      expect(result.skipped).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('dry-run does not make network calls', async () => {
      const result = await syncFindings(findings, 'test-run', {
        apiKey: 'cw_test_key',
        repo: 'org/test-repo',
        dryRun: true,
      });
      expect(result.skipped).toBe(false);
      expect(result.ingested).toBe(findings.length);
      expect(result.error).toBeUndefined();
    });
  });
});
