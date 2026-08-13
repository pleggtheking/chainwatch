import { describe, it, expect } from 'vitest';
import { findingsMarkdownTable } from '../../action/src/outputs.js';
import type { Finding } from '../../src/scan/finding.js';

// We test the pure functions that don't depend on @actions/core.
// setOutputs and writeSummary require the GitHub Actions runtime, so we test
// findingsMarkdownTable which is the core logic.

describe('Action outputs: findingsMarkdownTable', () => {
  it('returns "No findings" for empty array', () => {
    const table = findingsMarkdownTable([]);
    expect(table).toContain('No findings');
    expect(table).toContain('✅');
  });

  it('generates a markdown table with headers', () => {
    const findings: Finding[] = [
      { rule: 'postinstall_network', severity: 'high', package: 'evil@1.0.0', description: 'Network call in postinstall', file: 'node_modules/evil/install.js:5' },
    ];
    const table = findingsMarkdownTable(findings);
    expect(table).toContain('| Severity | Rule | Package | Description | File |');
    expect(table).toContain('postinstall_network');
    expect(table).toContain('evil@1.0.0');
    expect(table).toContain('Network call in postinstall');
    expect(table).toContain('node_modules/evil/install.js:5');
  });

  it('uses — for missing file', () => {
    const findings: Finding[] = [
      { rule: 'suspicious_publish', severity: 'medium', package: 'new-pkg@0.0.1', description: 'Recently published' },
    ];
    const table = findingsMarkdownTable(findings);
    expect(table).toContain('—');
  });

  it('includes severity emoji', () => {
    const findings: Finding[] = [
      { rule: 'postinstall_shell', severity: 'critical', package: 'evil@1.0.0', description: 'Shell spawn' },
      { rule: 'obfuscation_score', severity: 'medium', package: 'suspicious@1.0.0', description: 'Obfuscated code' },
    ];
    const table = findingsMarkdownTable(findings);
    expect(table).toContain('🔴');
    expect(table).toContain('🟡');
  });
});
