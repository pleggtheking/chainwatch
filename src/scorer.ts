/**
 * Chain scorer — the heart of ChainWatch.
 *
 * Individual signals are often benign. A package reading a file or making a
 * network call is usually fine. The *sequence* is what matters:
 *
 *   read credentials → enumerate/propagate → exfiltrate to network
 *
 * That sequence is exactly what Shai-Hulud and ChainDrop do, and it's exactly
 * what signature scanners miss. The scorer keeps a per-package sliding window
 * of recent signals and adds chain bonuses when it sees the worm pattern.
 */

import type { Action, Severity, SignalType } from './events.js';
import type { Policy } from './policy.js';

interface WindowEntry {
  signal: SignalType;
  ts: number;
}

const WINDOW_MS = 30_000;
const WINDOW_MAX = 20;

export interface ScoreResult {
  action: Action;
  chainScore: number;
}

export class ChainScorer {
  private readonly policy: Policy;
  private readonly windows = new Map<string, WindowEntry[]>();

  constructor(policy: Policy) {
    this.policy = policy;
  }

  observe(
    pkg: string,
    signal: SignalType,
    severity: Severity,
    baseScore: number,
    _detail: Record<string, unknown>,
  ): ScoreResult {
    const now = Date.now();
    const win = this.windows.get(pkg) ?? [];
    // Prune expired entries.
    while (win.length > 0 && now - (win[0]?.ts ?? 0) > WINDOW_MS) win.shift();

    const chainScore = this.scoreChain(pkg, signal, baseScore, win, now);

    win.push({ signal, ts: now });
    if (win.length > WINDOW_MAX) win.shift();
    this.windows.set(pkg, win);

    let action: Action = 'log';
    if (chainScore >= this.policy.chainBlockThreshold || baseScore >= this.policy.blockThreshold) {
      action = 'block';
    } else if (chainScore >= this.policy.flagThreshold || baseScore >= this.policy.flagThreshold) {
      action = 'flag';
    }

    // Critical single signals (self_propagation) always at least flag.
    if (severity === 'critical' && action === 'log') action = 'flag';

    return { action, chainScore };
  }

  /**
   * Compute the chain score: base score of the current signal plus bonuses for
   * suspicious sequences already in the window.
   */
  private scoreChain(
    _pkg: string,
    signal: SignalType,
    baseScore: number,
    win: WindowEntry[],
    _now: number,
  ): number {
    const has = (s: SignalType) => win.some((e) => e.signal === s);

    let score = baseScore;

    // credential_access → network_exfil  (cred steal + phone home)
    if (signal === 'network_exfil' && has('credential_access')) score += 30;
    // credential_access → self_propagation  (read tokens, then use them)
    if (signal === 'self_propagation' && has('credential_access')) score += 40;
    // self_propagation → network_exfil  (publish/spread + exfil)
    if (signal === 'network_exfil' && has('self_propagation')) score += 30;
    // The full Shai-Hulud chain: cred → propagate → exfil
    if (signal === 'network_exfil' && has('credential_access') && has('self_propagation')) {
      score += 50;
    }
    // credential_access → shell_spawn  (creds then shell, common in worms)
    if (signal === 'shell_spawn' && has('credential_access')) score += 20;

    return Math.min(score, 100);
  }
}
