/**
 * Action input parsing — typed wrapper around @actions/core getInput.
 *
 * Validates inputs and provides typed defaults matching action.yml.
 */

import * as core from '@actions/core';
import type { Severity } from '../../src/scan/finding.js';

export interface ActionInputs {
  scanDir: string;
  severity: Severity;
  failOn: Severity;
  baselineFile: string;
  driftThreshold: number;
  sarifOutput: string;
  uploadSarif: boolean;
  installCommand: string;
}

const VALID_SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];

function parseSeverity(name: string, fallback: Severity): Severity {
  const raw = core.getInput(name) || fallback;
  if (!VALID_SEVERITIES.includes(raw as Severity)) {
    throw new Error(`Invalid severity "${raw}" for ${name}. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
  }
  return raw as Severity;
}

/** Read and validate all action inputs. */
export function parseInputs(): ActionInputs {
  return {
    scanDir: core.getInput('scan-dir') || './node_modules',
    severity: parseSeverity('severity', 'medium'),
    failOn: parseSeverity('fail-on', 'high'),
    baselineFile: core.getInput('baseline-file') || '',
    driftThreshold: parseInt(core.getInput('drift-threshold') || '40', 10),
    sarifOutput: core.getInput('sarif-output') || 'chainwatch-results.sarif',
    uploadSarif: core.getInput('upload-sarif') === 'true',
    installCommand: core.getInput('install-command') || 'npm ci',
  };
}
