/**
 * JSON reporter — machine-parseable scan output.
 */

import type { Finding } from '../scan/finding.js';

export interface JsonReport {
  scanner: 'chainwatch';
  version: string;
  timestamp: string;
  packageCount: number;
  scanMs: number;
  findings: Finding[];
}

export function formatJson(
  findings: Finding[],
  pkgCount: number,
  scanMs: number,
): string {
  const report: JsonReport = {
    scanner: 'chainwatch',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
    packageCount: pkgCount,
    scanMs,
    findings,
  };
  return JSON.stringify(report, null, 2);
}
