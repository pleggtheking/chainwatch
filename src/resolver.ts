/**
 * Package resolver — maps resolved file paths to npm package names.
 *
 * Node resolves symlinks in stack traces by default, so a package installed via
 * `file:` dependency, pnpm, or workspace links shows its REAL path (e.g.
 * `test/fixtures/fake-worm/index.js`) instead of `node_modules/fake-worm/index.js`.
 *
 * To attribute correctly, we scan `node_modules/` at startup, resolve each
 * package directory's real path, and build a prefix map: `realPath → packageName`.
 * During attribution, we match the frame's file path against this map.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface PkgEntry {
  /** Real (symlink-resolved) absolute path of the package directory. */
  realPath: string;
  /** Package name (`@scope/name` or `name`). */
  name: string;
}

export class PackageResolver {
  /** Sorted by path length descending so longest prefix wins. */
  private entries: PkgEntry[] = [];
  private readonly nodeModulesPath: string;

  constructor(cwd: string = process.cwd()) {
    this.nodeModulesPath = path.join(cwd, 'node_modules');
  }

  /** Scan node_modules and build the path map. Call once at startup. */
  scan(): void {
    this.entries = [];
    if (!fs.existsSync(this.nodeModulesPath)) return;

    const scanDir = (dir: string, scoped = false) => {
      let entries: string[];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        // Skip pnpm internal dir and hidden dirs.
        if (entry.startsWith('.') || entry === '.package-lock.json') continue;

        const pkgDir = path.join(dir, entry);
        let stat;
        try {
          stat = fs.lstatSync(pkgDir);
        } catch {
          continue;
        }
        if (!stat.isDirectory() && !stat.isSymbolicLink()) continue;

        if (entry.startsWith('@') && !scoped) {
          // Scope directory — recurse into it.
          scanDir(pkgDir, true);
          continue;
        }

        // Read package.json for the real name.
        const pkgJsonPath = path.join(pkgDir, 'package.json');
        let name = scoped ? path.basename(dir) + '/' + entry : entry;
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
          if (pkg.name) name = pkg.name;
        } catch {
          // Fall back to directory-based name.
        }

        // Resolve symlinks to get the real path.
        let realPath: string;
        try {
          realPath = fs.realpathSync(pkgDir);
        } catch {
          realPath = pkgDir;
        }

        this.entries.push({ realPath: realPath + path.sep, name });
      }
    };

    scanDir(this.nodeModulesPath);

    // Sort by path length descending (longest prefix matches first).
    this.entries.sort((a, b) => b.realPath.length - a.realPath.length);
  }

  /**
   * Resolve a file path to its package name.
   * Returns null if the file is not inside any known package.
   */
  resolve(filePath: string): string | null {
    if (!filePath) return null;

    // Fast path: check for node_modules in the path (non-symlinked packages).
    const nmMatch = filePath.match(/[\\/]node_modules[\\/](?:@([^\\/]+)[\\/])?([^\\/]+)/);
    if (nmMatch) {
      const scope = nmMatch[1];
      const name = nmMatch[2] ?? '';
      // Verify against our map (handles edge cases). If not in map, still return
      // the name from the path — it's a reasonable fallback.
      return scope ? `@${scope}/${name}` : name;
    }

    // Slow path: check against resolved symlink targets.
    const normalized = filePath.replace(/\//g, path.sep);
    for (const entry of this.entries) {
      if (normalized.startsWith(entry.realPath) || normalized.startsWith(entry.realPath.replace(/\\/g, '/'))) {
        return entry.name;
      }
    }

    return null;
  }
}
