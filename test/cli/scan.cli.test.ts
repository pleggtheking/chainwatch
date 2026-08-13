import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

const CLI = path.resolve(__dirname, '../../dist/cli/index.js');
const FIXTURES = path.resolve(__dirname, '../fixtures/node_modules');

function runCli(args: string): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`node "${CLI}" ${args}`, {
      encoding: 'utf8',
      timeout: 30000,
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

describe('CLI: chainwatch scan', () => {
  it('exits 0 on a clean node_modules', () => {
    // Create a temp dir with only the clean fixture.
    const cleanDir = path.resolve(__dirname, '../fixtures/clean-only');
    const result = runCli(`scan "${cleanDir}" --no-color --severity low`);
    expect(result.code).toBe(0);
  });

  it('exits 1 on node_modules with HIGH findings', () => {
    const result = runCli(`scan "${FIXTURES}" --no-color --fail-on high`);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('credential_file_access');
    expect(result.stdout).toContain('postinstall_network');
  });

  it('--output json produces valid parseable JSON', () => {
    const result = runCli(`scan "${FIXTURES}" --output json`);
    expect(result.code).toBe(1);
    let parsed: any;
    expect(() => {
      parsed = JSON.parse(result.stdout);
    }).not.toThrow();
    expect(parsed.scanner).toBe('chainwatch');
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings.length).toBeGreaterThan(0);
    expect(parsed.packageCount).toBeGreaterThanOrEqual(7);
  });

  it('--output sarif produces valid SARIF JSON', () => {
    const result = runCli(`scan "${FIXTURES}" --output sarif`);
    expect(result.code).toBe(1);
    let parsed: any;
    expect(() => {
      parsed = JSON.parse(result.stdout);
    }).not.toThrow();
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.runs[0].tool.driver.name).toBe('ChainWatch');
    expect(parsed.runs[0].results.length).toBeGreaterThan(0);
  });
});
