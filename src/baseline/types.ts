/**
 * Baseline event type — one line in baseline.jsonl.
 *
 * Each event represents a behavioral observation from a package during a
 * known-good run. The detail field is NORMALIZED (see store.ts) so baselines
 * are portable across machines and developers.
 */

export type BaselineSignal =
  | 'fs_read'
  | 'fs_write'
  | 'network_out'
  | 'child_process'
  | 'dns_lookup';

export interface BaselineEvent {
  /** Package name@version. */
  pkg: string;
  /** Signal type — what kind of behavior was observed. */
  signal: BaselineSignal;
  /** Normalized path/host/command (see normalization rules in store.ts). */
  detail: string;
  /** How many times this exact (pkg, signal, detail) was seen in this run. */
  count: number;
  /** ISO timestamp of the recording run. */
  run: string;
  /** Optional label from --tag. */
  tag?: string;
}

/**
 * A compacted baseline — events merged across runs, keyed by (pkg, signal, detail).
 * This is what the differ compares against.
 */
export interface CompactedBaseline {
  /** Map key: `${pkg}\x00${signal}\x00${detail}` → merged event. */
  events: Map<string, BaselineEvent>;
  /** Number of runs merged into this baseline. */
  runCount: number;
  /** ISO timestamps of all runs. */
  runs: string[];
  /** Tags present in the baseline. */
  tags: string[];
}

export function baselineKey(e: BaselineEvent): string {
  return `${e.pkg}\x00${e.signal}\x00${e.detail}`;
}
