import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

const CLI = path.resolve(__dirname, '../../dist/cli/index.js');

function runWatch(command: string, timeout = 15000): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`node "${CLI}" watch -- ${command}`, {
      encoding: 'utf8',
      timeout,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    return { stdout, stderr: '', code: 0 };
  } catch (e: any) {
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      code: e.status ?? 1,
    };
  }
}

describe('CLI: chainwatch watch', () => {
  it('runs a clean command with no findings', () => {
    const result = runWatch('node -e "console.log(42)"');
    // The command itself succeeds; watch should report 0 events.
    expect(result.stdout).toContain('Watch complete');
    expect(result.stdout).toContain('0 events');
  });

  it('catches and blocks fake-worm', () => {
    const wormScript = path.resolve(__dirname, '../fixtures/run-worm.cjs');
    const result = runWatch(`node "${wormScript}"`);
    expect(result.stdout).toContain('fake-worm');
    expect(result.stdout).toContain('credential_access');
    expect(result.stdout).toContain('self_propagation');
    expect(result.stdout).toContain('network_exfil');
    expect(result.stdout).toContain('BLOCK');
    expect(result.stdout).toContain('3 events');
  });
});
