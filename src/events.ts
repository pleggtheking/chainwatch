/**
 * ChainWatch event schema.
 *
 * Every suspicious action observed at runtime becomes a ChainWatchEvent. The
 * chain scorer consumes a stream of these and decides whether the *sequence*
 * is a worm, not just whether any single event is bad.
 */

export type SignalType =
  | 'credential_access'
  | 'network_exfil'
  | 'self_propagation'
  | 'install_script'
  | 'shell_spawn';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type Action = 'log' | 'flag' | 'block';

export interface ChainWatchEvent {
  /** Unique event id (monotonic counter + pid, not a UUID — keeps it cheap). */
  id: string;
  /** Epoch milliseconds. */
  ts: number;
  /**
   * Attributed package name — the package whose code made the call, resolved
   * by walking the call stack for the first frame inside `node_modules/<pkg>/`.
   * `<entry>` = the process entry point, `<unknown>` = could not attribute.
   */
  package: string;
  signal: SignalType;
  severity: Severity;
  /** 0–100 per-signal score; the scorer combines these into a chain score. */
  score: number;
  /** Signal-specific payload (file path, host, command, etc.). */
  detail: Record<string, unknown>;
  /** Serialized call stack for forensics. */
  stack: string;
  /** What ChainWatch did in response. */
  action: Action;
}

let counter = 0;

export function makeEvent(
  pkg: string,
  signal: SignalType,
  severity: Severity,
  score: number,
  detail: Record<string, unknown>,
  stack: string,
  action: Action,
): ChainWatchEvent {
  return {
    id: `cw_${process.pid}_${++counter}`,
    ts: Date.now(),
    package: pkg,
    signal,
    severity,
    score,
    detail,
    stack,
    action,
  };
}
