/**
 * Summarizer — produces human-readable drift reports.
 *
 * Used by the `watch --drift` command to explain what changed.
 */

import type { DriftResult } from './differ.js';
import type { CompactedBaseline } from './types.js';

const SEV_ICON: Record<string, string> = {
  critical: '🛑',
  high: '⚠️ ',
  medium: '⚠',
  low: 'ℹ️',
};

const SEV_COLOR: Record<string, string> = {
  critical: '\x1b[41;37;1m',
  high: '\x1b[31;1m',
  medium: '\x1b[33;1m',
  low: '\x1b[37m',
};
const RESET = '\x1b[0m';

export interface SummarizerOptions {
  useColor: boolean;
}

/**
 * Format a single drift result for terminal output.
 */
export function formatDriftResult(result: DriftResult, opts: SummarizerOptions): string {
  const icon = SEV_ICON[result.severity] ?? '⚠';
  const sevColor = opts.useColor ? (SEV_COLOR[result.severity] ?? '') : '';
  const r = opts.useColor ? RESET : '';
  const lines: string[] = [];

  lines.push(`  ${icon}  ${sevColor}DRIFT DETECTED${r} — ${result.pkg}`);
  lines.push(`     New behavior not seen in baseline:`);

  for (const e of result.newEvents) {
    const desc = describeNewEvent(e.signal, e.detail);
    lines.push(`     → ${desc}`);
  }

  if (result.missingEvents.length > 0) {
    lines.push(`     Previously seen behavior that stopped:`);
    for (const e of result.missingEvents.slice(0, 3)) {
      lines.push(`     ✗ ${e.signal} ${e.detail}`);
    }
    if (result.missingEvents.length > 3) {
      lines.push(`     ... and ${result.missingEvents.length - 3} more`);
    }
  }

  lines.push(`     Drift score: ${result.driftScore}/100 (${result.severity})`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format the full drift report for a watch session.
 */
export function formatDriftReport(
  results: DriftResult[],
  baseline: CompactedBaseline,
  opts: SummarizerOptions,
): string {
  const lines: string[] = [];

  if (results.length === 0) {
    lines.push('  No drift detected. All behavior matches baseline.');
    return lines.join('\n');
  }

  for (const result of results) {
    lines.push(formatDriftResult(result, opts));
  }

  const critical = results.filter((r) => r.severity === 'critical').length;
  const high = results.filter((r) => r.severity === 'high').length;
  const medium = results.filter((r) => r.severity === 'medium').length;
  const low = results.filter((r) => r.severity === 'low').length;

  lines.push('  ' + '─'.repeat(50));
  const parts: string[] = [];
  if (critical) parts.push(`${critical} critical`);
  if (high) parts.push(`${high} high`);
  if (medium) parts.push(`${medium} medium`);
  if (low) parts.push(`${low} low`);
  lines.push(`  Drift findings: ${parts.join(', ')}`);
  lines.push(`  Baseline: ${baseline.runCount} run(s), ${baseline.events.size} events`);

  return lines.join('\n');
}

/**
 * Format the baseline show output.
 */
export function formatBaselineSummary(
  baseline: CompactedBaseline,
  filePath: string,
  opts: SummarizerOptions,
): string {
  const lines: string[] = [];
  const r = opts.useColor ? RESET : '';

  lines.push(`ChainWatch baseline — ${filePath}`);
  lines.push(`Recorded: ${baseline.runs.join(', ')} · ${baseline.runCount} run(s) · ${baseline.events.size} events`);

  // Group by package.
  const byPkg = new Map<string, { signal: string; detail: string; count: number }[]>();
  for (const e of baseline.events.values()) {
    const list = byPkg.get(e.pkg) ?? [];
    list.push({ signal: e.signal, detail: e.detail, count: e.count });
    byPkg.set(e.pkg, list);
  }

  lines.push('');
  lines.push('  Package                   Signals observed');
  lines.push('  ' + '─'.repeat(50));

  const sortedPkgs = [...byPkg.keys()].sort();
  for (const pkg of sortedPkgs.slice(0, 30)) {
    const signals = byPkg.get(pkg)!;
    const summary = signals
      .map((s) => `${s.signal} (${s.detail} ×${s.count})`)
      .join(', ')
      .slice(0, 60);
    lines.push(`  ${pkg.padEnd(25)} ${summary}`);
  }

  if (sortedPkgs.length > 30) {
    lines.push(`  ... (${sortedPkgs.length - 30} more)`);
  }

  return lines.join('\n');
}

function describeNewEvent(signal: string, detail: string): string {
  switch (signal) {
    case 'network_out':
      return `network_out to ${detail} (never seen before)`;
    case 'fs_read':
      return `fs_read of ${detail} (never seen before)`;
    case 'fs_write':
      return `fs_write to ${detail} (never seen before)`;
    case 'child_process':
      return `child_process: ${detail} (never seen before)`;
    case 'dns_lookup':
      return `dns_lookup of ${detail} (never seen before)`;
    default:
      return `${signal}: ${detail} (never seen before)`;
  }
}
