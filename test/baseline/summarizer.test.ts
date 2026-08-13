import { describe, it, expect } from 'vitest';
import { formatDriftResult, formatBaselineSummary } from '../../src/baseline/summarizer.js';
import { compactBaseline } from '../../src/baseline/store.js';
import type { BaselineEvent } from '../../src/baseline/types.js';

describe('Summarizer', () => {
  it('formats a drift result with package name and new behavior', () => {
    const result = {
      pkg: 'some-dep@1.2.4',
      newEvents: [
        { pkg: 'some-dep@1.2.4', signal: 'network_out' as const, detail: '185.220.101.47', count: 1, run: '2026-08-13T10:00:00Z' },
      ],
      missingEvents: [],
      driftScore: 50,
      severity: 'medium' as const,
    };
    const output = formatDriftResult(result, { useColor: false });
    expect(output).toContain('some-dep@1.2.4');
    expect(output).toContain('185.220.101.47');
    expect(output).toContain('50/100');
    expect(output).toContain('never seen before');
  });

  it('formats baseline summary with package list', () => {
    const events: BaselineEvent[] = [
      { pkg: 'vite@5.4.21', signal: 'fs_read', detail: '{CWD}/src/index.ts', count: 3, run: '2026-08-13T10:00:00Z' },
      { pkg: 'esbuild@0.27.7', signal: 'network_out', detail: 'registry.npmjs.org', count: 1, run: '2026-08-13T10:00:00Z' },
    ];
    const baseline = compactBaseline(events);
    const output = formatBaselineSummary(baseline, '.chainwatch/baseline.jsonl', { useColor: false });
    expect(output).toContain('.chainwatch/baseline.jsonl');
    expect(output).toContain('vite@5.4.21');
    expect(output).toContain('esbuild@0.27.7');
    expect(output).toContain('fs_read');
    expect(output).toContain('network_out');
  });
});
