import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  normalizePath,
  normalizeHost,
  normalizeCommand,
  normalizeDetail,
  readBaseline,
  writeBaseline,
  appendBaselineEvent,
  compactBaseline,
  mergeBaseline,
} from '../../src/baseline/store.js';
import type { BaselineEvent } from '../../src/baseline/types.js';

describe('Baseline store: normalization', () => {
  it('replaces home directory with {HOME}', () => {
    const home = os.homedir();
    const normalized = normalizePath(path.join(home, '.config', 'vite', 'vite.config.ts'));
    expect(normalized).toBe('{HOME}/.config/vite/vite.config.ts');
  });

  it('replaces current working directory with {CWD}', () => {
    const cwd = process.cwd();
    const normalized = normalizePath(path.join(cwd, 'src', 'index.ts'));
    expect(normalized).toBe('{CWD}/src/index.ts');
  });

  it('replaces temp directory with {TMP} and globs random suffixes', () => {
    const tmp = os.tmpdir();
    const normalized = normalizePath(path.join(tmp, 'vite-abc123', 'cache.json'));
    expect(normalized).toBe('{TMP}/*/cache.json');
  });

  it('normalizes backslashes to forward slashes', () => {
    const home = os.homedir().replace(/\\/g, '/');
    const input = home + '\\.npmrc';
    const normalized = normalizePath(input);
    expect(normalized).toBe('{HOME}/.npmrc');
  });

  it('is case-insensitive for home/cwd matching (Windows)', () => {
    const cwd = process.cwd();
    // Upper-case the drive letter
    const upperCwd = cwd.charAt(0).toUpperCase() + cwd.slice(1);
    const normalized = normalizePath(upperCwd + '\\src\\index.ts');
    expect(normalized).toBe('{CWD}/src/index.ts');
  });

  it('keeps raw IP addresses as-is (they are the signal)', () => {
    expect(normalizeHost('185.220.101.47')).toBe('185.220.101.47');
  });

  it('keeps known-good hostnames as-is', () => {
    expect(normalizeHost('registry.npmjs.org')).toBe('registry.npmjs.org');
  });

  it('normalizes commands by replacing CWD paths', () => {
    const cwd = process.cwd();
    const cmd = `node ${path.join(cwd, 'scripts', 'build.js')}`;
    const normalized = normalizeCommand(cmd);
    expect(normalized).toContain('{CWD}');
    expect(normalized).not.toContain(cwd);
  });

  it('normalizeDetail dispatches by signal type', () => {
    const home = os.homedir();
    expect(normalizeDetail('fs_read', path.join(home, '.npmrc'))).toBe('{HOME}/.npmrc');
    expect(normalizeDetail('network_out', '185.220.101.47')).toBe('185.220.101.47');
    expect(normalizeDetail('dns_lookup', 'evil.example.com')).toBe('evil.example.com');
  });
});

describe('Baseline store: JSONL read/write', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `cw-baseline-test-${Date.now()}.jsonl`);
  });

  afterEach(() => {
    try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
  });

  it('writes and reads baseline events', () => {
    const events: BaselineEvent[] = [
      { pkg: 'vite@5.4.21', signal: 'fs_read', detail: '{CWD}/src/index.ts', count: 3, run: '2026-08-13T10:00:00Z' },
      { pkg: 'esbuild@0.27.7', signal: 'network_out', detail: 'registry.npmjs.org', count: 1, run: '2026-08-13T10:00:00Z' },
    ];
    writeBaseline(tmpFile, events);
    const read = readBaseline(tmpFile);
    expect(read).toHaveLength(2);
    expect(read[0]!.pkg).toBe('vite@5.4.21');
    expect(read[1]!.signal).toBe('network_out');
  });

  it('appendBaselineEvent adds lines', () => {
    appendBaselineEvent(tmpFile, {
      pkg: 'vite@5.4.21', signal: 'fs_read', detail: '{HOME}/.npmrc', count: 1, run: '2026-08-13T10:00:00Z',
    });
    appendBaselineEvent(tmpFile, {
      pkg: 'esbuild@0.27.7', signal: 'network_out', detail: 'registry.npmjs.org', count: 1, run: '2026-08-13T10:00:00Z',
    });
    const read = readBaseline(tmpFile);
    expect(read).toHaveLength(2);
  });

  it('returns empty array for missing file', () => {
    expect(readBaseline('/nonexistent/path/baseline.jsonl')).toEqual([]);
  });
});

describe('Baseline store: compaction and merge', () => {
  it('compacts events with same key, summing counts', () => {
    const events: BaselineEvent[] = [
      { pkg: 'vite@5.4.21', signal: 'fs_read', detail: '{CWD}/src/index.ts', count: 3, run: '2026-08-13T10:00:00Z' },
      { pkg: 'vite@5.4.21', signal: 'fs_read', detail: '{CWD}/src/index.ts', count: 5, run: '2026-08-14T10:00:00Z' },
      { pkg: 'esbuild@0.27.7', signal: 'network_out', detail: 'registry.npmjs.org', count: 1, run: '2026-08-13T10:00:00Z' },
    ];
    const compacted = compactBaseline(events);
    expect(compacted.events.size).toBe(2);
    expect(compacted.runCount).toBe(2);
    const viteEvent = [...compacted.events.values()].find((e) => e.pkg === 'vite@5.4.21');
    expect(viteEvent?.count).toBe(8);
  });

  it('mergeBaseline merges existing file with new events', () => {
    const tmpFile = path.join(os.tmpdir(), `cw-merge-test-${Date.now()}.jsonl`);
    try {
      const existing: BaselineEvent[] = [
        { pkg: 'vite@5.4.21', signal: 'fs_read', detail: '{CWD}/src/index.ts', count: 3, run: '2026-08-13T10:00:00Z' },
      ];
      writeBaseline(tmpFile, existing);

      const newEvents: BaselineEvent[] = [
        { pkg: 'vite@5.4.21', signal: 'fs_read', detail: '{CWD}/src/index.ts', count: 2, run: '2026-08-14T10:00:00Z' },
        { pkg: 'esbuild@0.27.7', signal: 'network_out', detail: 'registry.npmjs.org', count: 1, run: '2026-08-14T10:00:00Z' },
      ];
      const merged = mergeBaseline(tmpFile, newEvents);
      expect(merged.events.size).toBe(2);
      expect(merged.runCount).toBe(2);
      const viteEvent = [...merged.events.values()].find((e) => e.pkg === 'vite@5.4.21');
      expect(viteEvent?.count).toBe(5);

      // File should contain compacted form.
      const read = readBaseline(tmpFile);
      expect(read).toHaveLength(2);
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });
});
