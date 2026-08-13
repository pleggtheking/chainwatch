/**
 * Runtime reporter — pretty-prints the ChainWatch event trail (Phase 1).
 *
 * Used by the demo and the `watch` command to show what was caught live.
 */

import type { ChainWatchEvent } from '../events.js';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '\x1b[41;37;1m',
  high: '\x1b[31;1m',
  medium: '\x1b[33;1m',
  low: '\x1b[37m',
};
const ACTION_COLORS: Record<string, string> = {
  block: '\x1b[41;37;1m',
  flag: '\x1b[33;1m',
  log: '\x1b[37m',
};
const RESET = '\x1b[0m';

export function formatEvent(e: ChainWatchEvent): string {
  const sev = SEVERITY_COLORS[e.severity] ?? '';
  const act = ACTION_COLORS[e.action] ?? '';
  const detail = Object.entries(e.detail)
    .filter(([k]) => k !== 'chainScore')
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ');
  return (
    `  ${act}[${e.action.toUpperCase()}]${RESET} ` +
    `${sev}${e.severity}${RESET} ` +
    `${e.signal} ` +
    `pkg="${e.package}" ` +
    `score=${e.detail.chainScore ?? e.score} ` +
    `${detail}`
  );
}

export function printEventTrail(events: ChainWatchEvent[]): void {
  if (events.length === 0) {
    console.log('  (no events — clean run)');
    return;
  }
  console.log('\n  ChainWatch event trail:');
  console.log('  ' + '─'.repeat(70));
  for (const e of events) {
    console.log(formatEvent(e));
  }
  console.log('  ' + '─'.repeat(70));
  const blocked = events.filter((e) => e.action === 'block').length;
  const flagged = events.filter((e) => e.action === 'flag').length;
  console.log(`  Total: ${events.length} events — ${blocked} blocked, ${flagged} flagged\n`);
}
