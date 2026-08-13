/**
 * Drift scorer — compares current run events to baseline, scores deviations.
 *
 * This is what catches slow-burn attacks: a package that does one suspicious
 * thing per run, across many runs. No single run trips the chain scorer, but
 * the differ sees that the behavior is NEW relative to the baseline.
 *
 * Scoring is rule-based (not ML) — deliberate for v1:
 *   network_out to raw IP:        +50 (no legit reason to POST to an IP)
 *   network_out to new hostname:  +30
 *   fs_read of credential file:   +40
 *   child_process not in baseline:+35
 *   dns_lookup of new domain:     +25
 *   fs_write outside CWD:         +30
 *   chain bonus (after cred read):+20
 *
 * Cap at 100. >= 40 = warn, >= 70 = high, >= 85 = critical.
 */

import { baselineKey, type BaselineEvent, type CompactedBaseline, type BaselineSignal } from './types.js';

export type DriftSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface DriftResult {
  pkg: string;
  newEvents: BaselineEvent[];
  missingEvents: BaselineEvent[];
  driftScore: number;
  severity: DriftSeverity;
}

/** Check if a string is a raw IP address (v4 or v6). */
function isRawIP(s: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s) || /^[0-9a-fA-F:]+$/.test(s) && s.includes(':');
}

/** Check if a normalized path looks like a credential file. */
function isCredentialPath(detail: string): boolean {
  const lower = detail.toLowerCase();
  return (
    lower.includes('.npmrc') ||
    lower.includes('.ssh/') ||
    lower.includes('.aws/credentials') ||
    lower.includes('.aws/config') ||
    lower.includes('.env') ||
    lower.includes('.kube/config') ||
    lower.includes('.netrc') ||
    lower.includes('.git-credentials') ||
    lower.includes('.docker/config')
  );
}

/** Check if a path is outside {CWD}. */
function isOutsideCWD(detail: string): boolean {
  return !detail.startsWith('{CWD}');
}

/** Score a single new event. */
function scoreNewEvent(event: BaselineEvent, recentCredRead: boolean): number {
  let score = 0;

  switch (event.signal) {
    case 'network_out':
      if (isRawIP(event.detail)) {
        score += 50; // Raw IP — always suspicious
      } else {
        score += 30; // New hostname
      }
      break;
    case 'fs_read':
      if (isCredentialPath(event.detail)) {
        score += 40;
      }
      break;
    case 'child_process':
      score += 35;
      break;
    case 'dns_lookup':
      score += 25;
      break;
    case 'fs_write':
      if (isOutsideCWD(event.detail)) {
        score += 30;
      }
      break;
  }

  // Chain bonus: any signal right after a credential read.
  if (recentCredRead && event.signal !== 'fs_read') {
    score += 20;
  }

  return score;
}

function severityForScore(score: number): DriftSeverity {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  if (score > 0) return 'low';
  return 'low';
}

/**
 * Compare current run events to a compacted baseline.
 * Returns one DriftResult per package that has any new or missing events.
 */
export function diffBaseline(
  currentEvents: BaselineEvent[],
  baseline: CompactedBaseline,
): DriftResult[] {
  // Group current events by package.
  const byPkg = new Map<string, BaselineEvent[]>();
  for (const e of currentEvents) {
    const list = byPkg.get(e.pkg) ?? [];
    list.push(e);
    byPkg.set(e.pkg, list);
  }

  // Also collect all packages from the baseline (for missing-event detection
  // when a package has zero current events).
  const baselinePkgs = new Set<string>();
  for (const e of baseline.events.values()) {
    baselinePkgs.add(e.pkg);
  }

  // Build a set of baseline keys for fast lookup.
  const baselineKeys = new Set(baseline.events.keys());

  // All packages to check: those in current run + those in baseline.
  const allPkgs = new Set([...byPkg.keys(), ...baselinePkgs]);

  const results: DriftResult[] = [];

  for (const pkg of allPkgs) {
    const events = byPkg.get(pkg) ?? [];
    const newEvents: BaselineEvent[] = [];
    let recentCredRead = false;

    // Sort events by... well, they're in order of observation. We track if a
    // credential read happened recently for the chain bonus.
    for (const e of events) {
      const key = baselineKey(e);
      if (!baselineKeys.has(key)) {
        newEvents.push(e);
      }
      if (e.signal === 'fs_read' && isCredentialPath(e.detail)) {
        recentCredRead = true;
      }
    }

    // Find missing events (in baseline but not in current run).
    const currentKeys = new Set(events.map(baselineKey));
    const missingEvents: BaselineEvent[] = [];
    for (const [key, baselineEvent] of baseline.events) {
      if (baselineEvent.pkg === pkg && !currentKeys.has(key)) {
        missingEvents.push(baselineEvent);
      }
    }

    if (newEvents.length === 0 && missingEvents.length === 0) continue;

    // Score new events.
    let driftScore = 0;
    recentCredRead = false; // Reset for scoring pass
    for (const e of events) {
      const key = baselineKey(e);
      if (!baselineKeys.has(key)) {
        if (e.signal === 'fs_read' && isCredentialPath(e.detail)) {
          recentCredRead = true;
        }
        driftScore += scoreNewEvent(e, recentCredRead);
      }
    }

    // Missing events: low priority, +10 each, max 20 total.
    const missingScore = Math.min(missingEvents.length * 10, 20);
    driftScore += missingScore;

    driftScore = Math.min(driftScore, 100);

    results.push({
      pkg,
      newEvents,
      missingEvents,
      driftScore,
      severity: severityForScore(driftScore),
    });
  }

  // Sort by drift score descending.
  return results.sort((a, b) => b.driftScore - a.driftScore);
}
