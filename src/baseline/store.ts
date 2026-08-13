/**
 * Baseline store — reads/writes baseline.jsonl and normalizes paths.
 *
 * Normalization is the hardest part of Phase 3. Raw paths like
 * `C:\Users\reven\project\node_modules\vite\dist\index.js` must be normalized
 * to `{CWD}\node_modules\vite\dist\index.js` so baselines are portable across
 * machines and developers. Get this wrong and you get either zero drift alerts
 * (too loose) or constant false positives (too strict).
 *
 * Normalization rules:
 *  - Home directory → {HOME}
 *  - Current working directory → {CWD}
 *  - Temp directory → {TMP}
 *  - Temp file random suffixes → * (glob normalize, e.g. /tmp/vite-XXXX → {TMP}/vite-*)
 *  - Known-good hosts (registry.npmjs.org etc.) → kept as-is
 *  - Raw IP addresses → kept as-is (they're the signal)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { baselineKey, type BaselineEvent, type CompactedBaseline } from './types.js';

// ─── Normalization ──────────────────────────────────────────────────────────

const HOME = os.homedir();
const CWD = process.cwd();
const TMP = os.tmpdir();

/**
 * Normalize a filesystem path for baseline storage.
 * Replaces home/cwd/tmp with tokens and globs random temp suffixes.
 */
export function normalizePath(rawPath: string): string {
  let p = rawPath;

  // Normalize separators to forward slashes for cross-platform consistency.
  // We store {CWD}, {HOME}, {TMP} with forward slashes so a baseline recorded
  // on Windows works on Linux and vice versa.
  p = p.replace(/\\/g, '/');

  const homeNorm = HOME.replace(/\\/g, '/');
  const cwdNorm = CWD.replace(/\\/g, '/');
  const tmpNorm = TMP.replace(/\\/g, '/');

  // Check most specific paths first. On Windows, HOME is often a prefix of
  // both CWD and TMP (e.g. C:\Users\reven is HOME, C:\Users\reven\chainwatch
  // is CWD, C:\Users\reven\AppData\Local\Temp is TMP). If we check HOME first,
  // CWD and TMP paths get wrongly normalized to {HOME}/....
  // Order: CWD (longest) → TMP → HOME (shortest).
  if (p.toLowerCase().startsWith(cwdNorm.toLowerCase())) {
    p = '{CWD}' + p.slice(cwdNorm.length);
  } else if (p.toLowerCase().startsWith(tmpNorm.toLowerCase())) {
    p = '{TMP}' + p.slice(tmpNorm.length);
    // Glob normalize random temp suffixes: {TMP}/vite-abc123 → {TMP}/vite-*
    p = p.replace(/\/[a-zA-Z0-9._-]+-[a-zA-Z0-9]{6,}/g, '/*');
  } else if (p.toLowerCase().startsWith(homeNorm.toLowerCase())) {
    p = '{HOME}' + p.slice(homeNorm.length);
  }

  return p;
}

/**
 * Normalize a network host for baseline storage.
 * Known-good hosts are kept as-is. Raw IPs are kept as-is (they're the signal).
 * Everything else is kept as-is — the differ decides if it's new.
 */
export function normalizeHost(host: string): string {
  return host; // No transformation needed — hosts are already portable.
}

/**
 * Normalize a child_process command for baseline storage.
 * Strips absolute paths from the command, replaces with {CWD} etc.
 */
export function normalizeCommand(cmd: string): string {
  // Replace any absolute path that starts with CWD or HOME.
  let normalized = cmd;
  const cwdNorm = CWD.replace(/\\/g, '/');
  const homeNorm = HOME.replace(/\\/g, '/');

  // Match both forward and backslash variants of paths in the command string.
  normalized = normalized.replace(
    new RegExp(escapeRegex(cwdNorm).replace(/\//g, '[\\\\/]'), 'gi'),
    '{CWD}',
  );
  normalized = normalized.replace(
    new RegExp(escapeRegex(homeNorm).replace(/\//g, '[\\\\/]'), 'gi'),
    '{HOME}',
  );

  return normalized;
}

/**
 * Main normalization entry point — normalizes a detail string based on signal type.
 */
export function normalizeDetail(signal: string, detail: string): string {
  switch (signal) {
    case 'fs_read':
    case 'fs_write':
      return normalizePath(detail);
    case 'network_out':
    case 'dns_lookup':
      return normalizeHost(detail);
    case 'child_process':
      return normalizeCommand(detail);
    default:
      return detail;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── JSONL Read/Write ───────────────────────────────────────────────────────

/**
 * Read a baseline JSONL file and return the raw events.
 */
export function readBaseline(filePath: string): BaselineEvent[] {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as BaselineEvent);
  } catch {
    return [];
  }
}

/**
 * Write baseline events to a JSONL file (overwrites existing).
 */
export function writeBaseline(filePath: string, events: BaselineEvent[]): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Append a single event to the baseline file (for streaming during recording).
 */
export function appendBaselineEvent(filePath: string, event: BaselineEvent): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');
}

// ─── Compaction / Merge ─────────────────────────────────────────────────────

/**
 * Compact raw events into a merged baseline.
 * Events with the same (pkg, signal, detail) are merged — counts summed,
 * run timestamps collected.
 */
export function compactBaseline(events: BaselineEvent[]): CompactedBaseline {
  const eventMap = new Map<string, BaselineEvent>();
  const runs = new Set<string>();
  const tags = new Set<string>();

  for (const e of events) {
    runs.add(e.run);
    if (e.tag) tags.add(e.tag);

    const key = baselineKey(e);
    const existing = eventMap.get(key);
    if (existing) {
      existing.count += e.count;
    } else {
      eventMap.set(key, { ...e });
    }
  }

  return {
    events: eventMap,
    runCount: runs.size,
    runs: [...runs].sort(),
    tags: [...tags].sort(),
  };
}

/**
 * Merge new events into an existing baseline file.
 * Reads the existing baseline, merges with new events, writes back compacted.
 */
export function mergeBaseline(filePath: string, newEvents: BaselineEvent[]): CompactedBaseline {
  const existing = readBaseline(filePath);
  const all = [...existing, ...newEvents];
  const compacted = compactBaseline(all);
  // Write compacted form.
  writeBaseline(filePath, [...compacted.events.values()]);
  return compacted;
}
