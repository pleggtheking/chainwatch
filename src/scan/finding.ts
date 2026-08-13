/**
 * Finding — the output type of every static scan rule.
 *
 * A Finding is a single suspicious thing detected in a package during a
 * `chainwatch scan` run. Rules produce Findings; the reporter formats them.
 */

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface Finding {
  /** Rule ID that produced this finding (e.g. `postinstall_network`). */
  rule: string;
  severity: Severity;
  /** Package name@version. */
  package: string;
  /** Human-readable description of what was found. */
  description: string;
  /** Source file + line if available. */
  file?: string;
  /** Code snippet evidence (max ~120 chars). */
  evidence?: string;
  /** Chain score if this finding came from a runtime event (watch mode). */
  chainScore?: number;
}

export const SEVERITY_RANK: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function severityRank(s: Severity): number {
  return SEVERITY_RANK[s] ?? 0;
}

/** True if `a` meets or exceeds `threshold` severity. */
export function meetsSeverity(a: Severity, threshold: Severity): boolean {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[threshold];
}
