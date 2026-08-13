/**
 * Action outputs — sets GitHub Action outputs and writes step summary.
 */

import * as core from '@actions/core';
import type { Finding, Severity } from '../../src/scan/finding.js';

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
};

/** Set action outputs from findings. */
export function setOutputs(findings: Finding[], sarifFile: string): void {
  const critical = countBySeverity(findings, 'critical');
  const high = countBySeverity(findings, 'high');

  core.setOutput('findings-count', findings.length.toString());
  core.setOutput('critical-count', critical.toString());
  core.setOutput('high-count', high.toString());
  core.setOutput('sarif-file', sarifFile);
}

/** Write the GitHub Actions step summary (shows in the run page UI). */
export async function writeSummary(findings: Finding[]): Promise<void> {
  const critical = countBySeverity(findings, 'critical');
  const high = countBySeverity(findings, 'high');
  const medium = countBySeverity(findings, 'medium');
  const low = countBySeverity(findings, 'low');

  await core.summary
    .addHeading('ChainWatch Supply Chain Scan')
    .addTable([
      [{ data: 'Severity', header: true }, { data: 'Count', header: true }],
      ['🔴 Critical', critical.toString()],
      ['🟠 High', high.toString()],
      ['🟡 Medium', medium.toString()],
      ['🔵 Low', low.toString()],
    ])
    .addDetails('Full findings', findingsMarkdownTable(findings))
    .write();
}

/** Generate a markdown table of all findings for the step summary. */
export function findingsMarkdownTable(findings: Finding[]): string {
  if (findings.length === 0) {
    return 'No findings. ✅';
  }

  const rows = findings.map((f) => {
    const emoji = SEVERITY_EMOJI[f.severity] ?? '⚠️';
    const file = f.file ?? '—';
    return `| ${emoji} ${f.severity} | ${f.rule} | ${f.package} | ${f.description} | ${file} |`;
  });

  return [
    '| Severity | Rule | Package | Description | File |',
    '|----------|------|---------|-------------|------|',
    ...rows,
  ].join('\n');
}

function countBySeverity(findings: Finding[], severity: Severity): number {
  return findings.filter((f) => f.severity === severity).length;
}
