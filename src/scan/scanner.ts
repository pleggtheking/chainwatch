/**
 * Scanner — orchestrates detection rules over a node_modules directory.
 *
 * Discovers all installed packages, runs every rule against each, and returns
 * sorted findings. No concurrency in v1 — a 300-package scan runs in < 2s.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Finding, Severity } from './finding.js';
import { severityRank, meetsSeverity } from './finding.js';
import type { PackageMeta, RuleContext, RegistryMeta } from './types.js';
import { ALL_RULES } from './rules/index.js';

export interface ScanOptions {
  /** Minimum severity to include in results. */
  minSeverity?: Severity;
  /** Rules to run (defaults to ALL_RULES). */
  rules?: typeof ALL_RULES;
  /** Context passed to rules (package-lock, registry fetcher). */
  context?: RuleContext;
}

export interface ScanResult {
  findings: Finding[];
  packageCount: number;
  scanMs: number;
}

/**
 * Discover all packages in a node_modules directory by reading package.json
 * files. Handles scoped packages (@org/name).
 */
export function discoverPackages(nodeModulesDir: string): PackageMeta[] {
  const packages: PackageMeta[] = [];
  if (!fs.existsSync(nodeModulesDir)) return packages;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });
  } catch {
    return packages;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith('.')) continue;
    if (entry.name === '.package-lock.json') continue;

    const pkgPath = path.join(nodeModulesDir, entry.name);

    if (entry.name.startsWith('@')) {
      // Scope directory — recurse one level.
      let scoped: fs.Dirent[];
      try {
        scoped = fs.readdirSync(pkgPath, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const sub of scoped) {
        if (!sub.isDirectory() && !sub.isSymbolicLink()) continue;
        const subPath = path.join(pkgPath, sub.name);
        const meta = readPackageMeta(subPath, `${entry.name}/${sub.name}`);
        if (meta) packages.push(meta);
      }
    } else {
      const meta = readPackageMeta(pkgPath, entry.name);
      if (meta) packages.push(meta);
    }
  }

  return packages;
}

function readPackageMeta(pkgPath: string, fallbackName: string): PackageMeta | null {
  const pkgJsonPath = path.join(pkgPath, 'package.json');
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  } catch {
    return null;
  }
  return {
    name: (raw['name'] as string) ?? fallbackName,
    version: (raw['version'] as string) ?? '0.0.0',
    path: pkgPath,
    raw,
  };
}

/**
 * Scan a node_modules directory. Runs all rules against all packages.
 */
export async function scan(nodeModulesDir: string, opts: ScanOptions = {}): Promise<ScanResult> {
  const start = Date.now();
  const rules = opts.rules ?? ALL_RULES;
  const minSev = opts.minSeverity ?? 'low';

  // Load package-lock.json for rules that need it (dependency_confusion).
  let context: RuleContext = opts.context ?? {};
  if (!context.packageLock) {
    const lockPath = path.join(path.dirname(nodeModulesDir), 'package-lock.json');
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      context = { ...context, packageLock: lock };
    } catch {
      // No lock file — dependency_confusion rule will skip.
    }
  }

  // Set up a default registry fetcher if none provided.
  if (!context.fetchRegistryMeta) {
    context.fetchRegistryMeta = makeDefaultFetcher();
  }

  const packages = discoverPackages(nodeModulesDir);
  const findings: Finding[] = [];

  for (const pkg of packages) {
    for (const rule of rules) {
      try {
        const results = await rule.check(pkg, context);
        findings.push(...results);
      } catch (e) {
        // A rule error shouldn't abort the whole scan.
        process.stderr.write(`chainwatch: rule ${rule.id} error on ${pkg.name}: ${(e as Error).message}\n`);
      }
    }
  }

  // Filter by min severity and sort by severity descending.
  const filtered = findings
    .filter((f) => meetsSeverity(f.severity, minSev))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  return {
    findings: filtered,
    packageCount: packages.length,
    scanMs: Date.now() - start,
  };
}

/** Default registry fetcher — hits registry.npmjs.org. Cached per session. */
function makeDefaultFetcher(): (name: string) => Promise<RegistryMeta | null> {
  const cache = new Map<string, RegistryMeta | null>();
  return async (name: string) => {
    if (cache.has(name)) return cache.get(name) ?? null;
    try {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
      if (!res.ok) {
        cache.set(name, null);
        return null;
      }
      const data = (await res.json()) as RegistryMeta;
      cache.set(name, data);
      return data;
    } catch {
      cache.set(name, null);
      return null;
    }
  };
}
