/**
 * Scan utilities — helpers for reading package source files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const JS_EXTS = ['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx'];

/** Recursively collect all JS/TS source files in a directory. */
export function collectSourceFiles(dir: string, maxDepth = 5): string[] {
  const results: string[] = [];
  if (maxDepth <= 0) return results;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    // Skip nested node_modules.
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full, maxDepth - 1));
    } else if (entry.isFile() && JS_EXTS.includes(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

/** Read a file safely, returning empty string on error. */
export function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/** Extract a short evidence snippet around a match (max ~120 chars). */
export function evidenceAround(content: string, matchStr: string, maxLen = 120): string {
  const idx = content.indexOf(matchStr);
  if (idx === -1) return matchStr.slice(0, maxLen);
  const start = Math.max(0, idx - 20);
  const end = Math.min(content.length, idx + matchStr.length + 20);
  let snippet = content.slice(start, end).replace(/\n/g, ' ').trim();
  if (snippet.length > maxLen) snippet = snippet.slice(0, maxLen - 3) + '...';
  return snippet;
}

/** Read the scripts field from a parsed package.json. */
export function getScripts(raw: Record<string, unknown>): Record<string, string> {
  const scripts = raw['scripts'];
  if (scripts && typeof scripts === 'object') {
    return Object.fromEntries(
      Object.entries(scripts).filter(([, v]) => typeof v === 'string') as [string, string][],
    );
  }
  return {};
}

/** Find the line number of the first occurrence of `needle` in `content`. */
export function lineOf(content: string, needle: string): number {
  const idx = content.indexOf(needle);
  if (idx === -1) return 0;
  return content.slice(0, idx).split('\n').length;
}
